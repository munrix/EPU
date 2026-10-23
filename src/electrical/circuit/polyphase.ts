import type { ElectricalCircuit } from '../../domain/models';
import { isActive } from '../../domain/models';
import { magnitude, phasor, type Phasor } from '../../machines/inductionMotor';
import { DisjointSet } from '../connectivity/buildCircuit';
import { solveLinearSystem } from '../solvers/linear-dc';

/**
 * A three-phase source on the bench: the R S T N mains (380 V line, 220 V phase, 50 Hz), or a
 * frequency inverter's U V W output, which is live only while its L1 L2 L3 input sees three
 * different live phases.
 */
export interface PolyphaseSupply {
  equipmentId: string;
  on: boolean;
  hz: number;
  outputs: { name: string; terminalId: string; volts: number; degrees: number }[];
  /** An inverter's input sockets: all three must be on distinct live phases. */
  inputs?: string[];
}
/** The lab's R S T N mains outputs. */
export const mainsOutputs = (id: string): PolyphaseSupply['outputs'] =>
  (['R', 'S', 'T', 'N'] as const).map((name) => ({
    name,
    terminalId: `${id}.${name}`,
    volts: name === 'N' ? 0 : PHASE_VOLTS,
    degrees: PHASE_ANGLE[name],
  }));
/** A motor's six terminal-box sockets; windings run U1–U2, V1–V2, W1–W2. */
export interface MotorTerminals {
  equipmentId: string;
  U1: string;
  V1: string;
  W1: string;
  U2: string;
  V2: string;
  W2: string;
}
export const PHASE_VOLTS = 220;
const PHASE_ANGLE = { R: 0, S: -120, T: 120, N: 0 } as const;
/** Paths below this resistance count as a solid AC connection: closed switch poles, ammeter shunts. */
const SOLID_OHMS = 1;

export interface PolyphaseResult {
  /** Winding voltages U, V, W (start minus finish) per motor. */
  windings: Record<string, [Phasor, Phasor, Phasor]>;
  /** Supplies with two of their outputs joined by a solid path while switched on. */
  shorts: { supplyId: string; between: string[] }[];
  /** Supply frequency reaching each motor (0 if none). */
  motorHz: Record<string, number>;
  /** Inverters set to RUN whose input does not see three live phases, with the reason. */
  starved: { supplyId: string; reason: string }[];
  /** AC voltage of a socket on the three-phase side, or null if it is not part of it. */
  voltageAt(terminalId: string): Phasor | null;
  /**
   * AC current flowing from a socket's side into the motor windings, for an ammeter in a line.
   * Winding currents are given per motor as U, V, W (start → finish).
   */
  currentInto(terminalId: string, windingAmps: Record<string, Phasor[]>): Phasor;
}

/**
 * Solves the three-phase side of the bench. AC is not run through the DC solver: the supply's
 * outputs are known phasors, each motor winding is an equal impedance, and the voltage of any
 * winding junction that is not tied to the supply (the star point) follows from Kirchhoff's
 * current law. Leads, closed switch poles and ammeters are solid connections.
 */
export function solvePolyphase(
  circuit: ElectricalCircuit,
  supplies: PolyphaseSupply[],
  motors: MotorTerminals[],
): PolyphaseResult {
  const solid = new DisjointSet();
  // The same, without meter shunts: the two sides of an ammeter, for its current.
  const base = new DisjointSet();
  for (const c of circuit.components)
    if (c.kind === 'resistor' && isActive(c) && c.resistanceOhms < SOLID_OHMS) {
      solid.union(circuit.terminalToNode[c.a], circuit.terminalToNode[c.b]);
      if (c.origin !== 'instrument')
        base.union(circuit.terminalToNode[c.a], circuit.terminalToNode[c.b]);
    }
  const group = (terminalId: string) => solid.find(circuit.terminalToNode[terminalId]);
  const side = (terminalId: string) => base.find(circuit.terminalToNode[terminalId]);
  const acGroups = new Set([
    ...supplies.flatMap((s) =>
      [...s.outputs.map((o) => o.terminalId), ...(s.inputs ?? [])].map(group),
    ),
    ...motors.flatMap((m) => [m.U1, m.V1, m.W1, m.U2, m.V2, m.W2].map(group)),
  ]);
  const currentInto: PolyphaseResult['currentInto'] = (terminalId, windingAmps) => {
    const at = side(terminalId);
    const sum = { re: 0, im: 0 };
    for (const m of motors)
      [
        [m.U1, m.U2],
        [m.V1, m.V2],
        [m.W1, m.W2],
      ].forEach(([start, finish], i) => {
        const amps = windingAmps[m.equipmentId]?.[i];
        if (!amps) return;
        const sign = (side(start) === at ? 1 : 0) - (side(finish) === at ? 1 : 0);
        sum.re += sign * amps.re;
        sum.im += sign * amps.im;
      });
    return sum;
  };

  // Known voltages: every output of a supply that is on, mains first, then inverters whose input
  // is healthy. A group reached by two different outputs is a short circuit.
  const known = new Map<string, Phasor>();
  const owner = new Map<string, string>();
  const shorts: PolyphaseResult['shorts'] = [];
  const starved: PolyphaseResult['starved'] = [];
  const energize = (s: PolyphaseSupply) => {
    const seen = new Map<string, string>();
    for (const o of s.outputs) {
      const g = group(o.terminalId);
      if (seen.has(g) || (owner.has(g) && owner.get(g) !== s.equipmentId)) {
        shorts.push({
          supplyId: s.equipmentId,
          between: [seen.get(g) ?? 'another supply', o.name],
        });
        continue;
      }
      seen.set(g, o.name);
      owner.set(g, s.equipmentId);
      known.set(g, phasor(o.volts, o.degrees));
    }
  };
  supplies.filter((s) => s.on && !s.inputs).forEach(energize);
  for (const s of supplies.filter((x) => x.on && x.inputs)) {
    const fed = s.inputs!.map((t) => known.get(group(t)));
    const live = fed.filter((v): v is Phasor => !!v && magnitude(v) > 1);
    const distinct = new Set(s.inputs!.map(group)).size === 3;
    if (live.length === 3 && distinct) energize(s);
    else
      starved.push({
        supplyId: s.equipmentId,
        reason: `Input sees ${live.length} of 3 live phases${distinct ? '' : ' (two inputs share a phase)'}`,
      });
  }
  const hzOf = new Map(supplies.map((s) => [s.equipmentId, s.hz]));
  // A supply with a short has tripped: the solution below would be meaningless.
  if (shorts.length)
    return {
      windings: zeroWindings(motors),
      shorts,
      starved,
      motorHz: Object.fromEntries(motors.map((m) => [m.equipmentId, 0])),
      voltageAt: (t) => (acGroups.has(group(t)) ? { re: 0, im: 0 } : null),
      currentInto: () => ({ re: 0, im: 0 }),
    };

  // Windings as unit admittances between groups.
  const edges: [string, string][] = motors.flatMap((m) => [
    [group(m.U1), group(m.U2)],
    [group(m.V1), group(m.V2)],
    [group(m.W1), group(m.W2)],
  ]);
  const unknown = [...new Set(edges.flat())].filter((g) => !known.has(g));
  const index = new Map(unknown.map((g, i) => [g, i]));
  // Groups whose winding network never reaches a known voltage carry no current: hold them at 0.
  const reach = new DisjointSet();
  edges.forEach(([a, b]) => reach.union(a, b));
  const live = new Set([...known.keys()].map((g) => reach.find(g)));
  const voltage = new Map<string, Phasor>(known);
  const active = unknown.filter((g) => live.has(reach.find(g)));
  if (active.length) {
    const n = unknown.length;
    const matrix = unknown.map(() => new Array<number>(n).fill(0));
    const rhsRe = new Array<number>(n).fill(0),
      rhsIm = new Array<number>(n).fill(0);
    unknown.forEach((g, i) => {
      if (!live.has(reach.find(g))) matrix[i][i] = 1;
    });
    for (const [a, b] of edges) {
      if (a === b) continue;
      for (const [x, y] of [
        [a, b],
        [b, a],
      ]) {
        const i = index.get(x);
        if (i === undefined || !live.has(reach.find(x))) continue;
        matrix[i][i] += 1;
        const j = index.get(y);
        if (j !== undefined) matrix[i][j] -= 1;
        else {
          rhsRe[i] += known.get(y)!.re;
          rhsIm[i] += known.get(y)!.im;
        }
      }
    }
    const re = solveLinearSystem(matrix, rhsRe);
    const im = solveLinearSystem(matrix, rhsIm);
    unknown.forEach((g, i) => voltage.set(g, { re: re[i], im: im[i] }));
  }
  const v = (g: string) => voltage.get(g) ?? { re: 0, im: 0 };
  const across = (a: string, b: string): Phasor => {
    const x = v(group(a)),
      y = v(group(b));
    return { re: x.re - y.re, im: x.im - y.im };
  };
  return {
    windings: Object.fromEntries(
      motors.map((m) => [
        m.equipmentId,
        [across(m.U1, m.U2), across(m.V1, m.V2), across(m.W1, m.W2)] as [Phasor, Phasor, Phasor],
      ]),
    ),
    shorts,
    starved,
    // The frequency of whichever source the motor's windings reach.
    motorHz: Object.fromEntries(
      motors.map((m) => {
        const root = reach.find(group(m.U1));
        const source = [...owner.entries()].find(([g]) => reach.find(g) === root)?.[1];
        return [m.equipmentId, source ? (hzOf.get(source) ?? 0) : 0];
      }),
    ),
    voltageAt: (t) => (acGroups.has(group(t)) ? v(group(t)) : null),
    currentInto,
  };
}

const zeroWindings = (motors: MotorTerminals[]) =>
  Object.fromEntries(
    motors.map((m) => [
      m.equipmentId,
      [0, 0, 0].map(() => ({ re: 0, im: 0 })) as [Phasor, Phasor, Phasor],
    ]),
  );

export const windingVolts = (w: [Phasor, Phasor, Phasor]) => w.map(magnitude);
