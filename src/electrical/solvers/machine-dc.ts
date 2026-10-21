import type {
  Component,
  ElectricalCircuit,
  SimulationResult,
  SolverAdapter,
} from '../../domain/models';
import {
  emfVolts,
  excitation,
  GENERATOR,
  shaftRpm,
  type MachineCircuit,
  type MachineReading,
} from '../../machines/dcGenerator';
import { linearDcSolver } from './linear-dc';

const MAX_ITERATIONS = 800;
const RELAXATION = 0.5;

/**
 * Linear DC solver with rotating machines. A machine's EMF depends on its field and armature
 * currents, which depend on the wiring, so the bench is solved repeatedly: solve with the present
 * EMF, read the currents, move the EMF part-way towards the value they imply, and repeat until it
 * settles. Starting from the residual voltage, this is self-excitation itself: with the field
 * circuit below its critical resistance the voltage climbs to the curve's crossing point,
 * otherwise (or with the field reversed, or too slow) it stays near the residual voltage.
 */
export const benchSolver: SolverAdapter = {
  id: 'linear-dc-machines-v1',
  solve(circuit: ElectricalCircuit, revision: number): SimulationResult {
    const machines = circuit.machines ?? [];
    if (!machines.length) return linearDcSolver.solve(circuit, revision);
    const volts = new Map<string, number>();
    const rpm = new Map<string, number>();
    machines.forEach((m) => {
      const n = shaftRpm(m.state, 0);
      rpm.set(m.equipmentId, n);
      volts.set(m.emfId, emfVolts(0, n, m.state.peakFieldAmps, 0));
    });
    let result = linearDcSolver.solve(withMachines(circuit, machines, volts, rpm), revision);
    let converged = false;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      let largest = 0;
      for (const m of machines) {
        const r = readCurrents(result, m);
        const out = (volts.get(m.emfId) ?? 0) * r.armatureAmps;
        const n = shaftRpm(m.state, out);
        const target = emfVolts(
          excitation(r.shuntAmps, r.seriesAmps),
          n,
          m.state.peakFieldAmps,
          r.armatureAmps,
        );
        const now = volts.get(m.emfId) ?? 0;
        const next = now + RELAXATION * (target - now);
        largest = Math.max(largest, Math.abs(next - now), Math.abs(n - rpm.get(m.equipmentId)!));
        volts.set(m.emfId, next);
        rpm.set(m.equipmentId, n);
      }
      result = linearDcSolver.solve(withMachines(circuit, machines, volts, rpm), revision);
      if (largest < 1e-6) {
        converged = true;
        break;
      }
    }
    result.machines = Object.fromEntries(
      machines.map((m): [string, MachineReading] => {
        const r = readCurrents(result, m);
        return [
          m.equipmentId,
          {
            rpm: rpm.get(m.equipmentId) ?? 0,
            emfVolts: volts.get(m.emfId) ?? 0,
            excitationAmps: excitation(r.shuntAmps, r.seriesAmps),
            ...r,
            converged,
          },
        ];
      }),
    );
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
  rpm: Map<string, number>,
): ElectricalCircuit {
  const tachoVolts = new Map(
    machines.map((m) => [m.tachoId, (rpm.get(m.equipmentId) ?? 0) * GENERATOR.tachoVoltsPerRpm]),
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
