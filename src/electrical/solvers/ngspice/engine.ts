import type { EngineOutput } from './transient';

/**
 * ngspice compiled to WebAssembly (eecircuit-engine, MIT; ngspice, BSD-3). Loaded on first use
 * so DC-only benches never download it. One simulator instance runs one netlist at a time.
 */
type Engine = {
  setNetList(netlist: string): void;
  runSim(): Promise<{ variableNames: string[]; data: { values: unknown[] }[] }>;
  getError(): string[];
};
let engine: Promise<Engine> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function load(): Promise<Engine> {
  engine ??= import('eecircuit-engine').then(async ({ Simulation }) => {
    const sim = new Simulation();
    await sim.start();
    return sim as unknown as Engine;
  });
  return engine;
}

export function runNetlist(netlist: string): Promise<EngineOutput> {
  const run = queue.then(async () => {
    const sim = await load();
    sim.setNetList(netlist);
    const result = await sim.runSim();
    const errors = sim.getError().filter((e) => /error|singular|abort|too small/i.test(e));
    if (errors.length || !result.data.length) throw new Error(errors.join('\n') || 'No output');
    return {
      variableNames: result.variableNames,
      data: result.data.map((d) => d.values.map(Number)),
    };
  });
  queue = run.catch(() => undefined);
  return run;
}
