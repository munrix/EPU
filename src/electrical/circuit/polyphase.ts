import type { ElectricalCircuit } from '../../domain/models';
import { isActive } from '../../domain/models';
import { magnitude, phasor, type Phasor } from '../../machines/inductionMotor';
import { DisjointSet } from '../connectivity/buildCircuit';
import { solveLinearSystem } from '../solvers/linear-dc';

/** A three-phase R S T N supply on the bench (380 V line, 220 V phase, 50 Hz). */
export interface PolyphaseSupply {
  equipmentId: string;
  on: boolean;
  /** Terminal IDs of R, S, T and N. */
  terminals: { R: string; S: string; T: string; N: string };
}
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
  for (const c of circuit.components)
    if (c.kind === 'resistor' && isActive(c) && c.resistanceOhms < SOLID_OHMS)
      solid.union(circuit.terminalToNode[c.a], circuit.terminalToNode[c.b]);
  const group = (terminalId: string) => solid.find(circuit.terminalToNode[terminalId]);

  // Known voltages: every output of a supply that is on. A group reached by two different
  // outputs is a short circuit.
  const known = new Map<string, Phasor>();
  const owner = new Map<string, string>();
  const shorts: PolyphaseResult['shorts'] = [];
  for (const s of supplies) {
    if (!s.on) continue;
    const seen = new Map<string, string>();
    for (const phase of ['R', 'S', 'T', 'N'] as const) {
      const g = group(s.terminals[phase]);
      if (seen.has(g) || (owner.has(g) && owner.get(g) !== s.equipmentId)) {
        shorts.push({ supplyId: s.equipmentId, between: [seen.get(g) ?? 'another supply', phase] });
        continue;
      }
      seen.set(g, phase);
      owner.set(g, s.equipmentId);
      known.set(g, phasor(PHASE_VOLTS, PHASE_ANGLE[phase]));
    }
  }
  // A supply with a short has tripped: the solution below would be meaningless.
  if (shorts.length) return { windings: zeroWindings(motors), shorts };

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
