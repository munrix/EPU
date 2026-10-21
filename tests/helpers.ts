import { connectCable } from '../src/domain/connections';
import type { CableColor, Workbench } from '../src/domain/models';
import { firstCircuit } from '../src/experiments/catalog';
import { assembleCircuit } from '../src/electrical/circuit/assemble';
import { linearDcSolver } from '../src/electrical/solvers/linear-dc';
import type { MeterSettings } from '../src/instruments/multimeter';

export const createBench = () => firstCircuit.createBench();
export const wire = (
  bench: Workbench,
  a: string,
  b: string,
  id: string,
  color: CableColor = 'red',
) =>
  connectCable(
    bench,
    { kind: 'terminal', terminalId: a },
    { kind: 'terminal', terminalId: b },
    color,
    id,
  );
export const power = (b: Workbench, enabled = true): Workbench => ({
  ...b,
  components: b.components.map((c) => (c.kind === 'dc-source' ? { ...c, enabled } : c)),
});
export const setMeter = (
  b: Workbench,
  change: Partial<MeterSettings>,
  id = 'meter',
): Workbench => ({
  ...b,
  instrumentSettings: { ...b.instrumentSettings, [id]: { ...b.instrumentSettings[id], ...change } },
});
export const setValue = (b: Workbench, componentId: string, change: Record<string, number>) => ({
  ...b,
  components: b.components.map((c) => (c.id === componentId ? { ...c, ...change } : c)),
});
export function wiredBench(powered = true) {
  let b = power(createBench(), powered);
  b = wire(b, 'supply.positive', 'load.A', 'supply-lead');
  b = wire(b, 'load.B', 'supply.negative', 'return-lead', 'black');
  b = wire(b, 'load.A', 'meter.V', 'meter-positive');
  return wire(b, 'load.B', 'meter.COM', 'meter-negative', 'black');
}
export const solve = (b: Workbench) => linearDcSolver.solve(assembleCircuit(b), 7);
/** Physical nets that contain at least one equipment socket in use or a named socket. */
export const netsOf = (b: Workbench, terminals: string[]) =>
  new Set(terminals.map((t) => assembleCircuit(b).terminalToNode[t])).size;
