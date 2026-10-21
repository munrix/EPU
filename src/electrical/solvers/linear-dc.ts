import type {
  Component,
  Diagnostic,
  ElectricalCircuit,
  SimulationResult,
  SolverAdapter,
} from '../../domain/models';
import { DisjointSet } from '../connectivity/buildCircuit';

type Source = Extract<Component, { kind: 'dc-source' }>;
type Resistor = Extract<Component, { kind: 'resistor' }>;
type Linear = Source | Resistor;

export function solveLinearSystem(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  const scale = Math.max(1, ...matrix.flat().map(Math.abs));
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
    }
    if (Math.abs(a[pivot][column]) < 1e-15 * scale)
      throw new Error('Singular or ill-conditioned DC circuit');
    [a[column], a[pivot]] = [a[pivot], a[column]];
    const divisor = a[column][column];
    for (let j = column; j <= n; j++) a[column][j] /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === column) continue;
      const factor = a[row][column];
      if (factor === 0) continue;
      for (let j = column; j <= n; j++) a[row][j] -= factor * a[column][j];
    }
  }
  const solution = a.map((row) => row[n]);
  if (solution.some((v) => !Number.isFinite(v))) throw new Error('Non-finite DC solution');
  return solution;
}

/** A regulated source is either holding its voltage (CV) or its current limit (CC). */
type Regulation = { mode: 'CV' } | { mode: 'CC'; deliveredAmps: number };

interface DomainSolution {
  voltages: Map<string, number>;
  /** Branch current into the positive terminal of each CV source. */
  sourceCurrents: Map<string, number>;
}

function solveDomain(
  nodes: string[],
  reference: string,
  resistors: Resistor[],
  sources: Source[],
  regulation: Map<string, Regulation>,
  node: (id: string) => string,
): DomainSolution {
  const unknowns = nodes.filter((n) => n !== reference);
  const index = new Map(unknowns.map((n, i) => [n, i]));
  // Sources whose terminals share a net add no constraint: a 0 V source bypassed by a lead,
  // or a current-limited supply holding its limit into a dead short.
  const voltageSources = sources.filter(
    (c) => regulation.get(c.id)?.mode !== 'CC' && node(c.positive) !== node(c.negative),
  );
  const size = unknowns.length + voltageSources.length;
  const matrix = Array.from({ length: size }, () => Array<number>(size).fill(0));
  const rhs = Array<number>(size).fill(0);
  const stamp = (a: number | undefined, b: number | undefined, value: number) => {
    if (a !== undefined && b !== undefined) matrix[a][b] += value;
  };
  resistors.forEach((c) => {
    const a = index.get(node(c.a)),
      b = index.get(node(c.b));
    const conductance = 1 / Math.max(c.resistanceOhms, 1e-6);
    stamp(a, a, conductance);
    stamp(b, b, conductance);
    stamp(a, b, -conductance);
    stamp(b, a, -conductance);
  });
  sources.forEach((c) => {
    const r = regulation.get(c.id);
    if (r?.mode !== 'CC') return;
    // Delivered current leaves the positive terminal into the external circuit.
    const p = index.get(node(c.positive)),
      n = index.get(node(c.negative));
    if (p !== undefined) rhs[p] += r.deliveredAmps;
    if (n !== undefined) rhs[n] -= r.deliveredAmps;
  });
  voltageSources.forEach((c, i) => {
    const branch = unknowns.length + i;
    const a = index.get(node(c.positive)),
      b = index.get(node(c.negative));
    stamp(a, branch, 1);
    stamp(branch, a, 1);
    stamp(b, branch, -1);
    stamp(branch, b, -1);
    rhs[branch] = c.voltageVolts;
  });
  const solution = size ? solveLinearSystem(matrix, rhs) : [];
  const voltages = new Map<string, number>([[reference, 0]]);
  unknowns.forEach((n, i) => voltages.set(n, solution[i]));
  const sourceCurrents = new Map<string, number>();
  voltageSources.forEach((c, i) => sourceCurrents.set(c.id, solution[unknowns.length + i]));
  return { voltages, sourceCurrents };
}

const formatAmps = (a: number) => (a >= 1 ? `${a.toFixed(2)} A` : `${(a * 1000).toFixed(0)} mA`);

export const linearDcSolver: SolverAdapter = {
  id: 'linear-dc-v2',
  solve(circuit: ElectricalCircuit, revision: number): SimulationResult {
    const result: SimulationResult = {
      revision,
      nodeVoltages: {},
      componentCurrents: {},
      sourceModes: {},
      measurements: {},
      diagnostics: [],
    };
    const push = (d: Diagnostic) => result.diagnostics.push(d);
    const node = (id: string) => circuit.terminalToNode[id];
    const ends = (c: Linear): [string, string] =>
      c.kind === 'resistor' ? [node(c.a), node(c.b)] : [node(c.positive), node(c.negative)];
    const pins = (c: Linear) => (c.kind === 'resistor' ? [c.a, c.b] : [c.positive, c.negative]);
    const isInstrument = (c: Component) => c.origin === 'instrument';
    // This adapter only models resistors and DC sources; other circuits go to the transient adapter.
    const active = circuit.components.filter(
      (c): c is Linear => c.kind === 'resistor' || (c.kind === 'dc-source' && c.enabled),
    );
    const energized = (c: Component) => c.kind === 'dc-source' && c.enabled && c.voltageVolts !== 0;

    // Electrically coupled domains. Every domain receives its own mathematical reference.
    const domains = new DisjointSet();
    active.forEach((c) => domains.union(...ends(c)));
    // Paths outside instruments. A voltmeter lead needs one to have a meaningful reference.
    const external = new DisjointSet();
    active.filter((c) => !isInstrument(c)).forEach((c) => external.union(...ends(c)));

    const groups = new Map<string, string[]>();
    circuit.nodes.forEach((n) => {
      const key = domains.find(n.id);
      groups.set(key, [...(groups.get(key) ?? []), n.id]);
    });
    const faults = new Set<string>(),
      errors = new Set<string>();
    for (const [domain, nodes] of groups) {
      const components = active.filter((c) => domains.find(ends(c)[0]) === domain);
      const sources = components.filter((c): c is Source => c.kind === 'dc-source');
      const resistors = components.filter((c): c is Resistor => c.kind === 'resistor');
      const invalid = components.some((c) =>
        c.kind === 'resistor'
          ? !Number.isFinite(c.resistanceOhms) || c.resistanceOhms < 0
          : !Number.isFinite(c.voltageVolts) ||
            (c.currentLimitAmps !== undefined &&
              (!Number.isFinite(c.currentLimitAmps) || c.currentLimitAmps <= 0)),
      );
      if (invalid) {
        errors.add(domain);
        push({
          code: 'invalid-parameter',
          severity: 'error',
          message: 'A component has an invalid electrical value.',
          terminalIds: [],
        });
        continue;
      }
      const shorted = sources.filter(
        (c) => node(c.positive) === node(c.negative) && c.voltageVolts !== 0,
      );
      const idealShorts = shorted.filter((c) => c.currentLimitAmps === undefined);
      if (idealShorts.length) {
        faults.add(domain);
        idealShorts.forEach((c) =>
          push({
            code: 'short-circuit',
            severity: 'fault',
            message:
              'Supply output is shorted. This ideal source has no finite current solution. Remove the shorting lead.',
            terminalIds: [c.positive, c.negative],
          }),
        );
        continue;
      }
      const regulation = new Map<string, Regulation>(
        sources.map((c) => [
          c.id,
          shorted.includes(c)
            ? { mode: 'CC', deliveredAmps: Math.sign(c.voltageVolts) * c.currentLimitAmps! }
            : { mode: 'CV' },
        ]),
      );
      const referenceSource = sources.find((c) => !isInstrument(c)) ?? sources[0];
      const reference = referenceSource ? node(referenceSource.negative) : nodes[0];
      let solution: DomainSolution | null = null;
      try {
        // Piecewise-linear regulation: a supply that would exceed its limit switches to CC,
        // and a CC supply whose output would exceed its set voltage returns to CV.
        for (let iteration = 0; iteration <= sources.length * 2 + 1; iteration++) {
          const attempt = solveDomain(nodes, reference, resistors, sources, regulation, node);
          let changed = false;
          for (const c of sources) {
            const r = regulation.get(c.id)!;
            if (c.currentLimitAmps === undefined || shorted.includes(c)) continue;
            if (r.mode === 'CV') {
              const delivered = -(attempt.sourceCurrents.get(c.id) ?? 0);
              if (Math.abs(delivered) > c.currentLimitAmps * (1 + 1e-9)) {
                regulation.set(c.id, {
                  mode: 'CC',
                  deliveredAmps: Math.sign(delivered) * c.currentLimitAmps,
                });
                changed = true;
              }
            } else {
              const output =
                attempt.voltages.get(node(c.positive))! - attempt.voltages.get(node(c.negative))!;
              if (Math.abs(output) > Math.abs(c.voltageVolts) * (1 + 1e-9) + 1e-12) {
                regulation.set(c.id, { mode: 'CV' });
                changed = true;
              }
            }
          }
          if (!changed) {
            solution = attempt;
            break;
          }
        }
        if (!solution) throw new Error('Supply regulation did not settle');
      } catch {
        errors.add(domain);
        push({
          code: 'solver-error',
          severity: 'error',
          message:
            'The DC equations have no unique numerical solution. Check conflicting ideal sources or unsupported values.',
          terminalIds: components.filter((c) => !isInstrument(c)).flatMap(pins),
        });
        continue;
      }
      solution.voltages.forEach((v, n) => {
        result.nodeVoltages[n] = v;
      });
      sources.forEach((c) => {
        const r = regulation.get(c.id)!;
        result.sourceModes[c.id] = r.mode;
        result.componentCurrents[c.id] =
          r.mode === 'CC' ? -r.deliveredAmps : (solution!.sourceCurrents.get(c.id) ?? 0);
      });
      resistors.forEach((c) => {
        result.componentCurrents[c.id] =
          (result.nodeVoltages[node(c.a)] - result.nodeVoltages[node(c.b)]) /
          Math.max(c.resistanceOhms, 1e-6);
      });
      shorted.forEach((c) =>
        push({
          code: 'short-circuit',
          severity: 'fault',
          message: `Supply output is shorted. The supply is holding its ${formatAmps(c.currentLimitAmps!)} current limit at 0 V. Remove the shorting lead.`,
          terminalIds: [c.positive, c.negative],
        }),
      );
      sources
        .filter(
          (c) => !shorted.includes(c) && regulation.get(c.id)!.mode === 'CC' && !isInstrument(c),
        )
        .forEach((c) =>
          push({
            code: 'current-limit',
            severity: 'warning',
            message: `The supply reached its ${formatAmps(c.currentLimitAmps!)} current limit (CC). Its output voltage dropped below the setting. Check for a very low resistance or a misplaced ammeter.`,
            terminalIds: [c.positive, c.negative],
          }),
        );
      const equipmentSources = sources.filter((c) => !isInstrument(c) && energized(c));
      if (equipmentSources.length) {
        sources.filter(isInstrument).forEach((c) =>
          push({
            code: 'ohmmeter-energized',
            severity: 'warning',
            message:
              'The ohmmeter is connected to a powered circuit. Resistance readings are only valid with the supply off, and a real meter can be damaged.',
            terminalIds: [c.positive, c.negative],
          }),
        );
        resistors
          .filter((c) => !isInstrument(c))
          .forEach((c) => {
            const alternate = new DisjointSet();
            components
              .filter((o) => o.id !== c.id && !(o.kind === 'resistor' && o.measurementInput))
              .forEach((o) => alternate.union(...ends(o)));
            if (alternate.find(node(c.a)) !== alternate.find(node(c.b)))
              push({
                code: 'open-load',
                severity: 'warning',
                message:
                  'A load has no closed current path. Check both return and supply connections.',
                terminalIds: [c.a, c.b],
              });
          });
      }
    }
    circuit.components
      .filter((c) => c.kind === 'dc-source' && !c.enabled)
      .forEach((c) => {
        result.componentCurrents[c.id] = 0;
        result.sourceModes[c.id] = 'off';
      });
    const domainState = (n: string) => {
      const d = domains.find(n);
      return faults.has(d) ? 'fault' : errors.has(d) ? 'error' : null;
    };
    circuit.measurements.forEach((m) => {
      if (m.kind === 'current') {
        const c = active.find((x) => x.id === m.componentId);
        const state = c ? domainState(ends(c)[0]) : null;
        // A removed branch (for example behind a blown fuse) carries no current.
        const value = c ? (result.componentCurrents[c.id] ?? 0) : 0;
        result.measurements[m.id] = state
          ? { value: null, status: state }
          : { value: Math.abs(value) < 1e-15 ? 0 : value, status: 'valid' };
        return;
      }
      const a = node(m.positiveTerminalId),
        b = node(m.negativeTerminalId);
      const state = domainState(a) ?? domainState(b);
      if (state) result.measurements[m.id] = { value: null, status: state };
      else if (
        domains.find(a) !== domains.find(b) ||
        (m.requireExternalReference && external.find(a) !== external.find(b))
      ) {
        result.measurements[m.id] = { value: null, status: 'floating' };
        push({
          code: 'floating-meter',
          severity: 'warning',
          message:
            'Meter leads do not share an electrical reference. Connect V and COM across the part you are measuring.',
          terminalIds: [m.positiveTerminalId, m.negativeTerminalId],
        });
      } else {
        const value = result.nodeVoltages[a] - result.nodeVoltages[b];
        result.measurements[m.id] = { value: Math.abs(value) < 1e-10 ? 0 : value, status: 'valid' };
      }
    });
    return result;
  },
};
