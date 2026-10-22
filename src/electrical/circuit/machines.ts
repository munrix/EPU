import type { Workbench } from '../../domain/models';
import { defaultMachineState, nextPeak } from '../../machines/dcGenerator';
import { benchSolver } from '../solvers/machine-dc';
import { needsTransient } from '../solvers/ngspice/transient';
import { assembleCircuit } from './assemble';

/**
 * Settles the machine side of an edit, as part of that edit (undo restores it with the wiring):
 * - a three-phase breaker trips on a short between its outputs, or on the locked-rotor current
 *   of a motor that cannot start (single phasing), and remembers why;
 * - the generator's pole iron remembers the highest excitation it reached, which lifts the
 *   falling magnetization curve.
 */
export function settleMachines(bench: Workbench): Workbench {
  if (!bench.machines && !bench.threePhase) return bench;
  let current = bench;
  for (let pass = 0; pass < 4; pass++) {
    const circuit = assembleCircuit(current);
    if (needsTransient(circuit)) return current;
    const result = benchSolver.solve(circuit, 0);
    const trips = new Map<string, string>();
    result.polyphaseShorts?.forEach((s) =>
      trips.set(s.supplyId, `Short circuit between ${s.between.join(' and ')}`),
    );
    result.polyphaseOverloads?.forEach((o) => {
      if (!trips.has(o.supplyId)) trips.set(o.supplyId, o.reason);
    });
    if (trips.size) {
      current = {
        ...current,
        threePhase: Object.fromEntries(
          Object.entries(current.threePhase ?? {}).map(([id, s]) => [
            id,
            trips.has(id) ? { on: false, trip: trips.get(id) } : s,
          ]),
        ),
      };
      continue;
    }
    if (!current.machines) return current;
    let changed = false;
    const machines = Object.fromEntries(
      Object.entries(current.machines).map(([id, state]) => {
        const reading = result.machines?.[id];
        if (!reading) return [id, state];
        const peakFieldAmps = nextPeak(state ?? defaultMachineState, reading.excitationAmps);
        if (peakFieldAmps === state.peakFieldAmps) return [id, state];
        changed = true;
        return [id, { ...state, peakFieldAmps }];
      }),
    );
    return changed ? { ...current, machines } : current;
  }
  return current;
}
