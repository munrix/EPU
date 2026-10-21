import type { SolverAdapter, Workbench } from '../../domain/models';
import { benchSolver } from '../solvers/machine-dc';
import { needsTransient } from '../solvers/ngspice/transient';
import { assembleCircuit } from './assemble';

export interface ProtectionTrip {
  equipmentId: string;
  kind: 'fuse' | 'breaker';
  componentId: string;
  amps: number;
  ratingAmps: number;
}

/**
 * Applies protection trips caused by a bench state. A fuse that carries more than its rating
 * opens, which changes the circuit, so the bench is re-solved until no further device trips.
 * Trips are part of the same edit, so undo restores the wiring and the fuse together.
 */
export function settleProtection(
  bench: Workbench,
  solver: SolverAdapter = benchSolver,
): { bench: Workbench; trips: ProtectionTrip[] } {
  const trips: ProtectionTrip[] = [];
  let current = bench;
  for (let pass = 0; pass < 8; pass++) {
    const circuit = assembleCircuit(current);
    // Transient benches are settled asynchronously from their simulation result.
    if (needsTransient(circuit)) break;
    const result = solver.solve(circuit, 0);
    const tripped = circuit.protections.filter((p) => {
      const amps = result.componentCurrents[p.componentId];
      return amps !== undefined && Math.abs(amps) > p.ratingAmps;
    });
    if (!tripped.length) break;
    tripped.forEach((p) => {
      trips.push({
        equipmentId: p.equipmentId,
        kind: p.kind,
        componentId: p.componentId,
        amps: Math.abs(result.componentCurrents[p.componentId]),
        ratingAmps: p.ratingAmps,
      });
    });
    current = applyTrips(current, trips);
  }
  return { bench: current, trips };
}

/** Fuses that a transient result shows carrying more than their rating (RMS). */
export function transientTrips(
  circuit: ReturnType<typeof assembleCircuit>,
  result: { rmsCurrents?: Record<string, number> },
): ProtectionTrip[] {
  return circuit.protections.flatMap((p) => {
    const amps = result.rmsCurrents?.[p.componentId];
    return amps !== undefined && amps > p.ratingAmps
      ? [
          {
            equipmentId: p.equipmentId,
            kind: p.kind,
            componentId: p.componentId,
            amps,
            ratingAmps: p.ratingAmps,
          },
        ]
      : [];
  });
}

/** A blown fuse opens its meter input; a tripped breaker switches its supply off. */
export function applyTrips(bench: Workbench, trips: ProtectionTrip[]): Workbench {
  if (!trips.length) return bench;
  const fuses = new Set(trips.filter((t) => t.kind === 'fuse').map((t) => t.equipmentId));
  const breakers = new Set(trips.filter((t) => t.kind === 'breaker').map((t) => t.componentId));
  return {
    ...bench,
    instrumentSettings: Object.fromEntries(
      Object.entries(bench.instrumentSettings).map(([id, s]) => [
        id,
        fuses.has(id) ? { ...s, fuseBlown: true } : s,
      ]),
    ),
    components: bench.components.map((c) =>
      breakers.has(c.id) && (c.kind === 'ac-source' || c.kind === 'dc-source')
        ? { ...c, enabled: false }
        : c,
    ),
  };
}
