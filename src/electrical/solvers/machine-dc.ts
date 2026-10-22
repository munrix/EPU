import type {
  Component,
  Diagnostic,
  ElectricalCircuit,
  SimulationResult,
  SolverAdapter,
} from '../../domain/models';
import {
  emfVolts,
  excitation,
  GENERATOR,
  type MachineCircuit,
  type MachineReading,
} from '../../machines/dcGenerator';
import {
  magnitude,
  MOTOR,
  phasor,
  sequences,
  steadyState,
  type MotorOperatingPoint,
} from '../../machines/inductionMotor';
import { solvePolyphase, windingVolts, type PolyphaseResult } from '../circuit/polyphase';
import { linearDcSolver } from './linear-dc';

const MAX_ITERATIONS = 800;
const RELAXATION = 0.5;

/**
 * Linear DC solver with motor–generator sets.
 *
 * The prime mover is fed only through the wiring: the three-phase side (R S T supply, leads,
 * load switch, terminal box links) is solved as phasors, which gives each motor winding's voltage
 * and so the motor's torque–speed curve. The generator's EMF depends on that speed and on its
 * field and armature currents, which depend on the DC wiring, and the generator's load torque in
 * turn slows the motor. The bench is therefore solved repeatedly, moving speed and EMF part-way
 * towards the values the last solution implies, until both settle. Starting from the residual
 * voltage, this is self-excitation itself: below the critical field resistance the voltage climbs
 * to the curve's crossing point, otherwise (or with the field reversed, or too slow) it stays low.
 */
export const benchSolver: SolverAdapter = {
  id: 'linear-dc-machines-v2',
  solve(circuit: ElectricalCircuit, revision: number): SimulationResult {
    const machines = circuit.machines ?? [];
    if (!machines.length) return linearDcSolver.solve(circuit, revision);
    const ac = solvePolyphase(
      circuit,
      circuit.polyphase ?? [],
      machines.map((m) => m.motor),
    );
    const drive = new Map(
      machines.map((m) => [m.equipmentId, sequences(...ac.windings[m.equipmentId])]),
    );
    const volts = new Map<string, number>();
    const motor = new Map<string, MotorOperatingPoint>();
    const runAt = (m: MachineCircuit, generatorTorque: number) => {
      const d = drive.get(m.equipmentId)!;
      return steadyState(d.positive, d.negative, generatorTorque);
    };
    machines.forEach((m) => {
      const point = runAt(m, 0);
      motor.set(m.equipmentId, point);
      volts.set(m.emfId, emfVolts(0, point.rpm, m.state.peakFieldAmps, 0));
    });
    let result = linearDcSolver.solve(withMachines(circuit, machines, volts, motor), revision);
    let converged = false;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      let largest = 0;
      for (const m of machines) {
        const r = readCurrents(result, m);
        const before = motor.get(m.equipmentId)!;
        const e = volts.get(m.emfId) ?? 0;
        // Generator torque opposing the shaft: converted power over angular speed.
        const omega = (2 * Math.PI * Math.abs(before.rpm)) / 60;
        const torque = omega > 1 ? (e * r.armatureAmps) / omega : 0;
        const point = runAt(m, torque);
        const rpm = before.rpm + RELAXATION * (point.rpm - before.rpm);
        const target = emfVolts(
          excitation(r.shuntAmps, r.seriesAmps),
          rpm,
          m.state.peakFieldAmps,
          r.armatureAmps,
        );
        const next = e + RELAXATION * (target - e);
        largest = Math.max(largest, Math.abs(next - e), Math.abs(rpm - before.rpm));
        volts.set(m.emfId, next);
        motor.set(m.equipmentId, { ...point, rpm });
      }
      result = linearDcSolver.solve(withMachines(circuit, machines, volts, motor), revision);
      if (largest < 1e-6) {
        converged = true;
        break;
      }
    }
    const diagnostics: Diagnostic[] = [];
    const overloads: { supplyId: string; reason: string }[] = [];
    const livePolyphase = (circuit.polyphase ?? []).filter((s) => s.on);
    result.machines = Object.fromEntries(
      machines.map((m): [string, MachineReading] => {
        const r = readCurrents(result, m);
        const point = motor.get(m.equipmentId)!;
        const windings = windingVolts(ac.windings[m.equipmentId]);
        const box = [m.motor.U1, m.motor.V1, m.motor.W1, m.motor.U2, m.motor.V2, m.motor.W2];
        const say = (severity: Diagnostic['severity'], message: string) =>
          diagnostics.push({ code: 'machine', severity, message, terminalIds: box });
        if (point.status === 'humming' || point.status === 'stalled') {
          const reason =
            point.status === 'humming'
              ? 'The prime mover hummed but could not start: only two of R, S, T reach its windings (single phasing). Its locked-rotor current tripped the breaker.'
              : 'The prime mover stalled. Its locked-rotor current tripped the breaker.';
          livePolyphase.forEach((s) => overloads.push({ supplyId: s.equipmentId, reason }));
          say('fault', reason);
        }
        if (Math.max(...windings) > MOTOR.windingVolts * 1.15)
          say(
            'warning',
            `The prime-mover windings see ${Math.round(Math.max(...windings))} V; they are rated 220 V. On the 380 V supply this motor must be connected in star (W2, U2, V2 linked).`,
          );
        if (point.rpm < -1)
          say(
            'info',
            'The set is turning backwards: two of the supply phases are swapped at the motor.',
          );
        return [
          m.equipmentId,
          {
            rpm: point.rpm,
            motorStatus: point.status,
            motorAmps: point.lineAmps,
            windingVolts: windings,
            emfVolts: volts.get(m.emfId) ?? 0,
            excitationAmps: excitation(r.shuntAmps, r.seriesAmps),
            ...r,
            converged,
          },
        ];
      }),
    );
    ac.shorts.forEach((s) =>
      diagnostics.push({
        code: 'short-circuit',
        severity: 'fault',
        message: `${s.between.join(' and ')} of the three-phase supply are joined by a lead: a short circuit. The breaker tripped.`,
        terminalIds: [],
      }),
    );
    result.diagnostics.push(...diagnostics);
    readThreePhaseMeters(circuit, result, ac, machines, motor, drive);
    if (ac.shorts.length) result.polyphaseShorts = ac.shorts;
    if (overloads.length) result.polyphaseOverloads = overloads;
    return result;
  },
};

function readCurrents(result: SimulationResult, m: MachineCircuit) {
  return {
    shuntAmps: result.componentCurrents[m.shuntId] ?? 0,
    seriesAmps: result.componentCurrents[m.seriesId] ?? 0,
    armatureAmps: result.componentCurrents[m.armatureId] ?? 0,
  };
}

function withMachines(
  circuit: ElectricalCircuit,
  machines: MachineCircuit[],
  volts: Map<string, number>,
  motor: Map<string, MotorOperatingPoint>,
): ElectricalCircuit {
  const tachoVolts = new Map(
    machines.map((m) => [
      m.tachoId,
      (motor.get(m.equipmentId)?.rpm ?? 0) * GENERATOR.tachoVoltsPerRpm,
    ]),
  );
  return {
    ...circuit,
    components: circuit.components.map((c): Component => {
      if (c.kind !== 'dc-source') return c;
      const v = volts.get(c.id) ?? tachoVolts.get(c.id);
      return v === undefined ? c : { ...c, voltageVolts: v };
    }),
  };
}

/**
 * Multimeters on the three-phase side. That side is solved as phasors, not as waveforms, so a
 * meter whose leads are both on it gets its RMS value here: AC volts between any two sockets,
 * and the line current through an ammeter in a motor lead. Its DC value is 0, as on a real
 * meter set to DC across AC.
 */
function readThreePhaseMeters(
  circuit: ElectricalCircuit,
  result: SimulationResult,
  ac: PolyphaseResult,
  machines: MachineCircuit[],
  motor: Map<string, MotorOperatingPoint>,
  drive: Map<string, { positive: number; negative: number }>,
) {
  // Winding currents: in phase with the winding voltage less the motor's power-factor angle,
  // scaled so the line current matches the operating point.
  const windingAmps = Object.fromEntries(
    machines.map((m) => {
      const point = motor.get(m.equipmentId)!;
      const d = drive.get(m.equipmentId)!;
      const perUnit = Math.max(d.positive, d.negative);
      const scale = perUnit > 0.05 ? point.lineAmps / (perUnit * MOTOR.windingVolts) : 0;
      return [
        m.equipmentId,
        ac.windings[m.equipmentId].map((v) =>
          phasor(magnitude(v) * scale, (Math.atan2(v.im, v.re) * 180) / Math.PI - 40),
        ),
      ];
    }),
  );
  const stats = (rms: number) => ({
    mean: 0,
    rms,
    acMeanAbs: (rms * 2 * Math.SQRT2) / Math.PI,
    min: -rms * Math.SQRT2,
    max: rms * Math.SQRT2,
  });
  const overridden = new Set<string>();
  const ohmmeters = new Set(
    circuit.components.filter((c) => c.id.endsWith('.ohm-source')).map((c) => c.id),
  );
  for (const m of circuit.measurements) {
    // An ohmmeter measures with its own DC test current, which the DC solve already gives.
    if (ohmmeters.has(`${m.equipmentId}.ohm-source`)) continue;
    if (m.kind === 'voltage') {
      const a = ac.voltageAt(m.positiveTerminalId),
        b = ac.voltageAt(m.negativeTerminalId);
      if (!a || !b) continue;
      const rms = magnitude({ re: a.re - b.re, im: a.im - b.im });
      result.measurements[m.id] = { value: 0, status: 'valid', stats: stats(rms) };
      overridden.add(m.positiveTerminalId).add(m.negativeTerminalId);
    } else {
      const shunt = circuit.components.find((c) => c.id === m.componentId);
      if (shunt?.kind !== 'resistor' || !ac.voltageAt(shunt.a)) continue;
      const rms = Math.max(
        magnitude(ac.currentInto(shunt.a, windingAmps)),
        magnitude(ac.currentInto(shunt.b, windingAmps)),
      );
      result.measurements[m.id] = { value: 0, status: 'valid', stats: stats(rms) };
    }
  }
  result.diagnostics = result.diagnostics.filter(
    (d) => d.code !== 'floating-meter' || !d.terminalIds.some((t) => overridden.has(t)),
  );
}
