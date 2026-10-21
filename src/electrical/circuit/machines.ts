import type { Workbench } from '../../domain/models';
import { defaultMachineState, nextPeak } from '../../machines/dcGenerator';
import { benchSolver } from '../solvers/machine-dc';
import { needsTransient } from '../solvers/ngspice/transient';
import { assembleCircuit } from './assemble';

/**
 * Records each machine's magnetic history after an edit: the pole iron remembers the highest
 * excitation it reached, which lifts the falling magnetization curve. Part of the same edit, so
 * undo restores it with the wiring.
 */
export function settleMachines(bench: Workbench): Workbench {
  if (!bench.machines || !Object.keys(bench.machines).length) return bench;
  const circuit = assembleCircuit(bench);
  if (needsTransient(circuit)) return bench;
  const readings = benchSolver.solve(circuit, 0).machines ?? {};
  let changed = false;
  const machines = Object.fromEntries(
    Object.entries(bench.machines).map(([id, state]) => {
      const reading = readings[id];
      if (!reading) return [id, state];
      const peakFieldAmps = nextPeak(state ?? defaultMachineState, reading.excitationAmps);
      if (peakFieldAmps === state.peakFieldAmps) return [id, state];
      changed = true;
      return [id, { ...state, peakFieldAmps }];
    }),
  );
  return changed ? { ...bench, machines } : bench;
}
