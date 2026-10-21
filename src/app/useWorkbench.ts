import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SimulationResult, Workbench } from '../domain/models';
import { experimentById } from '../experiments/catalog';
import { assembleCircuit } from '../electrical/circuit/assemble';
import { applyTrips, settleProtection, transientTrips } from '../electrical/circuit/protection';
import { linearDcSolver } from '../electrical/solvers/linear-dc';
import { needsTransient } from '../electrical/solvers/ngspice/transient';
import { solveTransient } from '../electrical/solvers/ngspice/client';
import { lastExperimentId, loadBench, saveBench } from '../persistence/bench';

interface History {
  past: Workbench[];
  present: Workbench;
  future: Workbench[];
}
const initialBench = (experimentId: string) =>
  loadBench(experimentId) ?? experimentById(experimentId)!.createBench();

export function useWorkbench() {
  const [history, setHistory] = useState<History>(() => ({
    past: [],
    present: settleProtection(initialBench(lastExperimentId())).bench,
    future: [],
  }));
  const [saved, setSaved] = useState(true);
  const bench = history.present;
  /** Every edit settles protection devices, so a blown fuse is part of the edit that caused it. */
  const commit = useCallback((change: (b: Workbench) => Workbench) => {
    setHistory((h) => {
      const next = change(h.present);
      if (next === h.present) return h;
      return {
        past: [...h.past.slice(-49), h.present],
        present: settleProtection(next).bench,
        future: [],
      };
    });
  }, []);
  const undo = useCallback(
    () =>
      setHistory((h) =>
        h.past.length
          ? {
              past: h.past.slice(0, -1),
              present: h.past[h.past.length - 1],
              future: [h.present, ...h.future],
            }
          : h,
      ),
    [],
  );
  const redo = useCallback(
    () =>
      setHistory((h) =>
        h.future.length
          ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
          : h,
      ),
    [],
  );
  /** Switching experiments swaps benches. Each experiment keeps its own saved bench. */
  const switchExperiment = useCallback((experimentId: string) => {
    setHistory((h) => {
      if (h.present.experimentId === experimentId) return h;
      saveBench(h.present);
      return { past: [], present: settleProtection(initialBench(experimentId)).bench, future: [] };
    });
  }, []);
  /** Imports replace the bench. Another experiment's file switches to that experiment. */
  const replaceBench = useCallback((next: Workbench) => {
    setHistory((h) => {
      const present = settleProtection(next).bench;
      if (next.experimentId === h.present.experimentId)
        return { past: [...h.past.slice(-49), h.present], present, future: [] };
      saveBench(h.present);
      return { past: [], present, future: [] };
    });
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setSaved(saveBench(bench)), 250);
    return () => clearTimeout(timer);
  }, [bench]);
  // Visual changes (equipment positions, cable color/routing) do not change this signature.
  const electricalKey = JSON.stringify({
    components: bench.components,
    instruments: bench.instrumentSettings,
    terminals: bench.terminals.map((t) => t.id),
    internalLinks: bench.internalLinks,
    cables: bench.cables.map((c) => c.plugIds),
    plugs: bench.plugs.map((p) => ({
      id: p.id,
      attachedTo: p.attachedTo.kind === 'loose' ? { kind: 'loose' } : p.attachedTo,
    })),
  });
  // Circuit solving is synchronous and bounded. Future adapters use revision-tagged jobs.
  const circuit = useMemo(() => assembleCircuit(bench), [electricalKey]); // explicit electrical dependency
  const transient = needsTransient(circuit);
  const dcResult = useMemo(
    () => (transient ? null : linearDcSolver.solve(circuit, 0)),
    [circuit, transient],
  );
  // Transient benches are simulated by ngspice in a worker. Each request carries a revision;
  // superseded results are discarded. The last result stays on screen while the next runs.
  const [transientResult, setTransientResult] = useState<SimulationResult | null>(null);
  const [simulating, setSimulating] = useState(false);
  const revision = useRef(0);
  useEffect(() => {
    if (!transient) {
      setSimulating(false);
      return;
    }
    const current = ++revision.current;
    setSimulating(true);
    const timer = setTimeout(() => {
      void solveTransient(circuit, current).then((r) => {
        if (!r || r.revision !== revision.current) return;
        setTransientResult(r);
        setSimulating(false);
        // A fuse blown by this circuit is folded into the edit that caused it.
        const trips = transientTrips(circuit, r);
        if (trips.length) setHistory((h) => ({ ...h, present: applyTrips(h.present, trips) }));
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [circuit, transient]);
  useEffect(() => setTransientResult(null), [bench.experimentId]);
  const result: SimulationResult =
    dcResult ?? transientResult ?? pendingResult(circuit.measurements.map((m) => m.id));
  return {
    bench,
    circuit,
    result,
    simulating: transient && simulating,
    commit,
    undo,
    redo,
    switchExperiment,
    replaceBench,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    saved,
  };
}

function pendingResult(measurementIds: string[]): SimulationResult {
  return {
    revision: -1,
    nodeVoltages: {},
    componentCurrents: {},
    sourceModes: {},
    measurements: Object.fromEntries(
      measurementIds.map((id) => [id, { value: null, status: 'pending' }]),
    ),
    diagnostics: [],
    analysis: 'transient',
  };
}
