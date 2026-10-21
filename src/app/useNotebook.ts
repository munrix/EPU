import { useCallback, useEffect, useState } from 'react';
import type { ExperimentDefinition, StepContext } from '../experiments/types';
import { loadNotebook, saveNotebook, type NotebookState } from '../persistence/bench';

type Notebook = NotebookState & { id: string };

/**
 * Lab notebook for the active experiment. A step is marked achieved the first time its check
 * passes against the solved bench, and its reading is recorded at that moment. Tables are filled
 * only when the student presses Record, like writing a reading onto the sheet. Later rewiring
 * does not erase what the student already observed; Reset clears the notebook.
 */
export function useNotebook(experiment: ExperimentDefinition, ctx: StepContext) {
  const [state, setState] = useState<Notebook>(() => ({
    id: experiment.id,
    ...loadNotebook(experiment.id),
  }));
  const notebook: Notebook =
    state.id === experiment.id ? state : { id: experiment.id, ...loadNotebook(experiment.id) };
  const store = useCallback(
    (next: Notebook) => {
      setState(next);
      saveNotebook(experiment.id, next);
    },
    [experiment.id],
  );
  useEffect(() => {
    const achieved = new Set(notebook.achieved);
    const records = { ...notebook.records };
    let changed = notebook !== state;
    experiment.steps.forEach((step, i) => {
      if (achieved.has(i)) return;
      let passed = false;
      try {
        passed = step.check(ctx);
      } catch {
        passed = false;
      }
      if (!passed) return;
      achieved.add(i);
      if (step.record) records[i] = step.record(ctx);
      changed = true;
    });
    if (!changed) return;
    store({ ...notebook, achieved: [...achieved].sort((a, b) => a - b), records });
  }, [ctx, experiment]);

  /** Copies every row measurable right now into the table's current column. */
  const record = useCallback(
    (tableId: string): { column: string | null; rows: string[] } => {
      const table = experiment.tables?.find((t) => t.id === tableId);
      const wanted = table?.column(ctx) ?? null;
      if (!table || wanted === null) return { column: wanted, rows: [] };
      // A prefix (e.g. "R") fills the next empty slot of R₁, R₂…, then keeps updating the last.
      const slots = table.columns.filter((col) => col.startsWith(wanted));
      const filled = (col: string) =>
        Object.keys(notebook.tables?.[tableId]?.[col] ?? {}).length > 0;
      const keyRow = table.slotKey ? table.rows.find((r) => r.id === table.slotKey) : undefined;
      const key = keyRow?.capture?.(ctx) ?? null;
      const same = slots.find(
        (col) => key !== null && notebook.tables?.[tableId]?.[col]?.[table.slotKey!] === key,
      );
      const column = table.columns.includes(wanted)
        ? wanted
        : (same ?? slots.find((col) => !filled(col)) ?? slots.at(-1) ?? null);
      if (column === null) return { column, rows: [] };
      const cells: Record<string, number> = { ...(notebook.tables?.[tableId]?.[column] ?? {}) };
      const recorded: string[] = [];
      for (const row of table.rows) {
        let value: number | null = null;
        try {
          value = row.capture?.(ctx) ?? null;
        } catch {
          value = null;
        }
        if (value === null || !Number.isFinite(value)) continue;
        cells[row.id] = value;
        recorded.push(row.label);
      }
      if (recorded.length)
        store({
          ...notebook,
          tables: {
            ...notebook.tables,
            [tableId]: { ...notebook.tables?.[tableId], [column]: cells },
          },
        });
      return { column, rows: recorded };
    },
    [ctx, experiment, notebook, store],
  );
  const clearColumn = useCallback(
    (tableId: string, column: string) => {
      const table = { ...notebook.tables?.[tableId] };
      delete table[column];
      store({ ...notebook, tables: { ...notebook.tables, [tableId]: table } });
    },
    [notebook, store],
  );
  const reset = useCallback(() => {
    store({ id: experiment.id, achieved: [], records: {}, tables: {} });
  }, [experiment.id, store]);
  return { notebook, reset, record, clearColumn };
}
