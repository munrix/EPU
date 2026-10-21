import type { ElectricalCircuit, SimulationResult } from '../../../domain/models';
import { interpretTransient, planTransient, type EngineOutput } from './transient';

/**
 * Browser-side transient adapter. Requests carry the circuit revision; while a run is in
 * progress only the newest waiting request is kept, and results for older revisions are
 * never delivered, so a slow run can never overwrite a newer bench.
 */
let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (value: EngineOutput | null) => void>();
let busy = false;
let waiting: {
  circuit: ElectricalCircuit;
  revision: number;
  resolve(r: SimulationResult | null): void;
} | null = null;
let latestRevision = -1;

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (
      event: MessageEvent<{ id: number; output?: EngineOutput; error?: string }>,
    ) => {
      const resolve = pending.get(event.data.id);
      pending.delete(event.data.id);
      resolve?.(event.data.output ?? null);
    };
  }
  return worker;
}
/** A run that never returns (the engine can lock up on a pathological circuit) is abandoned. */
const WATCHDOG_MS = 10000;
function run(netlist: string): Promise<EngineOutput | null> {
  const id = nextId++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      worker?.terminate();
      worker = null;
      resolve(null);
    }, WATCHDOG_MS);
    pending.set(id, (value) => {
      clearTimeout(timer);
      resolve(value);
    });
    getWorker().postMessage({ id, netlist });
  });
}

async function drain(
  circuit: ElectricalCircuit,
  revision: number,
  resolve: (r: SimulationResult | null) => void,
) {
  busy = true;
  const plan = planTransient(circuit);
  const output = plan.runnable ? await run(plan.netlist) : null;
  busy = false;
  resolve(revision === latestRevision ? interpretTransient(circuit, plan, output, revision) : null);
  if (waiting) {
    const next = waiting;
    waiting = null;
    void drain(next.circuit, next.revision, next.resolve);
  }
}

/** Resolves with the result, or null when a newer revision superseded this request. */
export function solveTransient(
  circuit: ElectricalCircuit,
  revision: number,
): Promise<SimulationResult | null> {
  latestRevision = revision;
  return new Promise((resolve) => {
    if (busy) {
      waiting?.resolve(null);
      waiting = { circuit, revision, resolve };
    } else void drain(circuit, revision, resolve);
  });
}
