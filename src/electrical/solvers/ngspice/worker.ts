/// <reference lib="webworker" />
import { runNetlist } from './engine';

self.onmessage = async (event: MessageEvent<{ id: number; netlist: string }>) => {
  const { id, netlist } = event.data;
  try {
    self.postMessage({ id, output: await runNetlist(netlist) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
