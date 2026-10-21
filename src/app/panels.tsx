import type { ReactNode } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Cable as CableIcon,
  Check,
  CheckCircle2,
  FlaskConical,
  Moon,
  Plus,
  RotateCcw,
  Sun,
  Wrench,
} from 'lucide-react';
import type {
  Component,
  Diagnostic,
  ElectricalCircuit,
  SimulationResult,
  Workbench,
} from '../domain/models';
import { cableColors, componentPins } from '../domain/models';
import { describeAttachment } from '../domain/connections';
import { definitionOf } from '../equipment/registry';
import { MAX_OPEN_BENCH_RESISTORS } from '../equipment/commands';
import { RECTIFIER_BOARD_ID, TRANSISTOR_BOARD_ID } from '../equipment/lab';
import { experiments } from '../experiments/catalog';
import type { ExperimentDefinition, ExperimentTable, StepContext } from '../experiments/types';
import { meterDisplay } from '../instruments/multimeter';
import { loadNotebook, type NotebookState } from '../persistence/bench';
import { formatOhms } from '../bench/rendering/EquipmentBody';

export function GuidePanel({
  experiment,
  notebook,
  bench,
  onAddResistor,
  onAddBoard,
  ctx,
  onRecord,
  onClearColumn,
}: {
  experiment: ExperimentDefinition;
  notebook: NotebookState;
  bench: Workbench;
  onAddResistor(): void;
  onAddBoard(definitionId: string, id: string): void;
  ctx: StepContext;
  onRecord(tableId: string): void;
  onClearColumn(tableId: string, column: string): void;
}) {
  const done = new Set(notebook.achieved);
  const total = experiment.steps.length;
  const complete = total > 0 && done.size === total;
  return (
    <>
      <span className="experiment-tag">
        {experiment.code} · {experiment.station ? 'EPU LAB BENCH' : 'DC FUNDAMENTALS'}
      </span>
      <h1>{experiment.title}</h1>
      <p>{experiment.objective}</p>
      {experiment.theory && (
        <div className="theory-note">
          <strong>Theory</strong>
          <p>{experiment.theory}</p>
        </div>
      )}
      {total > 0 && (
        <>
          <div className="progress-track">
            <span style={{ width: `${(done.size / total) * 100}%` }} />
          </div>
          <div className="progress-copy">
            <span>{complete ? 'Experiment complete' : 'Your progress'}</span>
            <span>
              {done.size} / {total}
            </span>
          </div>
          <ol className="steps">
            {experiment.steps.map((step, i) => (
              <li key={step.text} className={done.has(i) ? 'done' : ''}>
                <span className="step-number">{done.has(i) ? <Check size={13} /> : i + 1}</span>
                <span>
                  {step.text}
                  {notebook.records[i] && (
                    <span className="record" data-testid={`record-${i}`}>
                      {notebook.records[i]}
                    </span>
                  )}
                  {!done.has(i) && step.hint && <span className="step-hint">{step.hint}</span>}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
      {experiment.tables?.map((table) => (
        <ResultsTable
          key={table.id}
          table={table}
          cells={notebook.tables?.[table.id] ?? {}}
          current={safe(() => table.column(ctx))}
          onRecord={() => onRecord(table.id)}
          onClear={(column) => onClearColumn(table.id, column)}
        />
      ))}
      {experiment.theoryValues && (
        <div className="theory-values">
          <div className="section-label">THEORY · FROM THE SHEET’S FORMULAS</div>
          <div className="readout-grid">
            {safe(() => experiment.theoryValues!(ctx))?.map((t) => (
              <Row key={t.label} label={t.label}>
                {t.value}
              </Row>
            ))}
          </div>
        </div>
      )}
      {experiment.drawer === 'lab-boards' && (
        <div className="drawer">
          <div className="section-label">PLUG-IN BOARDS</div>
          {[
            {
              id: 'rect',
              definitionId: RECTIFIER_BOARD_ID,
              name: 'Rectifier board',
              note: '6 × 1N4007 · 100 µF · 10 µF · 1 kΩ · 10 kΩ',
            },
            {
              id: 'amp',
              definitionId: TRANSISTOR_BOARD_ID,
              name: 'Transistor board',
              note: 'BC547 NPN · 10 kΩ · 1 kΩ · capacitor',
            },
          ].map((board) => (
            <button
              key={board.id}
              className="drawer-item"
              onClick={() => onAddBoard(board.definitionId, board.id)}
              disabled={bench.equipment.some((e) => e.id === board.id)}
            >
              <Plus size={15} />
              <span>
                {board.name}
                <small>{board.note}</small>
              </span>
            </button>
          ))}
          <p className="small-note">
            Select a board on the bench to remove it. Its leads stay loose where they were.
          </p>
        </div>
      )}
      {experiment.openBench && experiment.drawer !== 'lab-boards' && (
        <div className="drawer">
          <div className="section-label">EQUIPMENT DRAWER</div>
          <button
            className="drawer-item"
            onClick={onAddResistor}
            disabled={
              bench.equipment.filter((e) => e.definitionId === 'resistor-v1').length >=
              MAX_OPEN_BENCH_RESISTORS
            }
          >
            <Plus size={15} />
            <span>
              Resistor module<small>Adjustable 1 Ω – 1 MΩ</small>
            </span>
          </button>
          <p className="small-note">
            Select a module on the bench to remove it. Its leads stay loose where they were.
          </p>
        </div>
      )}
      {complete ? (
        <div className="success-note">
          <CheckCircle2 size={17} /> All steps recorded. Try your own variations, or pick the next
          experiment.
        </div>
      ) : (
        !experiment.openBench && (
          <div className="panel-note">
            <strong>Make it your own.</strong>
            <p>
              Readings are recorded the first time a step is achieved. Mistakes are allowed; the
              bench never corrects your wiring.
            </p>
          </div>
        )
      )}
    </>
  );
}

export function ExperimentsPanel({
  current,
  onSelect,
}: {
  current: string;
  onSelect(id: string): void;
}) {
  return (
    <>
      <p className="small-note first">
        Each experiment keeps its own bench and notebook on this device.
      </p>
      <div className="experiment-list">
        {experiments.map((e) => {
          const nb = e.id === current ? null : loadNotebook(e.id);
          return (
            <button
              key={e.id}
              className={`experiment-row ${e.id === current ? 'chosen' : ''}`}
              aria-current={e.id === current}
              onClick={() => onSelect(e.id)}
            >
              <span className="experiment-code">{e.code}</span>
              <span>
                <strong>{e.title}</strong>
                <small>{e.summary}</small>
              </span>
              {e.steps.length > 0 && nb && nb.achieved.length === e.steps.length && (
                <CheckCircle2 size={15} className="row-check" />
              )}
              {e.id === current && <FlaskConical size={15} className="row-check" />}
            </button>
          );
        })}
      </div>
    </>
  );
}

const volts = (v: number | undefined) => (v === undefined ? '— —' : v.toFixed(2));
const milliamps = (a: number | undefined) =>
  a === undefined ? '— —' : (Math.abs(a) * 1000).toFixed(2);

export function ReadingsPanel({
  bench,
  circuit,
  result,
  experiment,
  onReplaceFuse,
}: {
  bench: Workbench;
  circuit: ElectricalCircuit;
  result: SimulationResult;
  experiment: ExperimentDefinition;
  onReplaceFuse(meterId: string): void;
}) {
  const nodeVolts = (t: string) => result.nodeVoltages[circuit.terminalToNode[t]];
  const across = (c: Component) => {
    const [a, b] = componentPins(c);
    const va = nodeVolts(a),
      vb = nodeVolts(b);
    return va === undefined || vb === undefined ? undefined : va - vb;
  };
  const faults = unique(result.diagnostics);
  return (
    <>
      {bench.equipment
        .filter((e) => definitionOf(e).kind === 'multimeter')
        .map((e) => {
          const m = meterDisplay(e.id, bench.instrumentSettings[e.id], result);
          const blown = bench.instrumentSettings[e.id]?.fuseBlown;
          return (
            <div className="measurement-card" key={e.id}>
              <div className="section-label">MULTIMETER · {m.range.title.toUpperCase()}</div>
              <div className="measurement" data-testid="panel-meter-reading">
                {m.text || 'OFF'}
                <span>{m.unit}</span>
              </div>
              <p>{m.caption}</p>
              <div className={`fuse-row ${blown ? 'blown' : ''}`} data-testid="fuse-status">
                <span>mA input fuse · {blown ? 'Blown' : 'OK'}</span>
                {blown && (
                  <button onClick={() => onReplaceFuse(e.id)}>
                    <Wrench size={13} /> Replace fuse
                  </button>
                )}
              </div>
            </div>
          );
        })}
      {bench.equipment
        .filter((e) => definitionOf(e).kind === 'dc-supply')
        .map((e) => {
          const source = bench.components.find((c) => e.componentIds.includes(c.id));
          if (source?.kind !== 'dc-source') return null;
          const mode = result.sourceModes[source.id];
          return (
            <div className="measurement-card" key={e.id}>
              <div className="section-label">
                SUPPLY OUTPUT · {mode === 'off' || !mode ? 'OFF' : mode}
              </div>
              <div className="readout-grid">
                <span>Voltage</span>
                <strong data-testid="supply-output-volts">
                  {source.enabled ? volts(across(source)) : '0.00'} V
                </strong>
                <span>Current</span>
                <strong data-testid="supply-output-current">
                  {milliamps(source.enabled ? result.componentCurrents[source.id] : 0)} mA
                </strong>
                <span>Limit</span>
                <strong>{(source.currentLimitAmps ?? 0).toFixed(3)} A</strong>
              </div>
            </div>
          );
        })}
      <div className="measurement-card">
        <div className="section-label">SOLVER READOUTS · NOT WIRED INSTRUMENTS</div>
        <div className="readout-grid wide">
          {bench.equipment
            .filter((e) =>
              ['resistor', 'rectifier-board', 'transistor-board'].includes(definitionOf(e).kind),
            )
            .flatMap((e) =>
              bench.components
                .filter((c) => e.componentIds.includes(c.id) && c.kind === 'resistor')
                .map((c) =>
                  definitionOf(e).concealValues && experiment.id === 'dc-ohmmeter' ? (
                    <Row key={c.id} label={e.label ?? 'Load'}>
                      Hidden for this exercise
                    </Row>
                  ) : (
                    <Row
                      key={c.id}
                      label={`${e.label ?? (definitionOf(e).kind === 'resistor' ? 'Load' : c.id.split('.').pop())} · ${c.kind === 'resistor' ? formatOhms(c.resistanceOhms) : ''}`}
                    >
                      <span data-testid={`current-${c.id}`}>
                        {milliamps(result.componentCurrents[c.id])} mA
                      </span>
                      <span className="muted"> · {volts(across(c))} V</span>
                    </Row>
                  ),
                ),
            )}
        </div>
      </div>
      <div
        className={`diagnostic-card ${faults.some((d) => d.severity === 'fault' || d.severity === 'error') ? 'has-fault' : ''}`}
      >
        <strong>{faults.length ? 'Bench check' : 'No issues found'}</strong>
        {faults.length ? (
          <ul className="diagnostic-list">
            {faults.map((d) => (
              <li key={d.message} className={d.severity}>
                {d.message}
              </li>
            ))}
          </ul>
        ) : (
          <p>The solved circuit has no reported faults or warnings.</p>
        )}
      </div>
      <p className="small-note">
        Solver readouts are calculations to help you check your work. Use the multimeter to measure
        like you would on a real bench.
      </p>
    </>
  );
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span>{label}</span>
      <strong>{children}</strong>
    </>
  );
}
export const unique = (diagnostics: Diagnostic[]) =>
  diagnostics.filter((d, i) => diagnostics.findIndex((x) => x.message === d.message) === i);

export function ConnectionsPanel({
  bench,
  selectedId,
  onSelect,
}: {
  bench: Workbench;
  selectedId?: string;
  onSelect(id: string): void;
}) {
  if (bench.cables.length === 0)
    return (
      <div className="empty-state">
        <CableIcon size={28} />
        <strong>No patch leads yet</strong>
        <p>Drag from one socket to another, or click two sockets in sequence.</p>
      </div>
    );
  return (
    <>
      {bench.cables.map((c, i) => (
        <button
          key={c.id}
          className={`connection-row ${selectedId === c.id ? 'chosen' : ''}`}
          onClick={() => onSelect(c.id)}
        >
          <span className="lead-dot" style={{ background: cableColors[c.color] }} />
          <div>
            <strong>Lead {String(i + 1).padStart(2, '0')}</strong>
            {c.plugIds.map((id) => (
              <small key={id}>
                {describeAttachment(bench, bench.plugs.find((p) => p.id === id)!.attachedTo)}
              </small>
            ))}
          </div>
        </button>
      ))}
      <p className="small-note">
        Select a lead to unplug either end, change its color, or remove it. Stacked plugs stay
        attached when lifted.
      </p>
    </>
  );
}

export function NodesPanel({ circuit }: { circuit: ElectricalCircuit }) {
  const nodes = circuit.nodes.filter((n) => !n.internal);
  return (
    <>
      <p className="small-note first">
        Each group is electrically joined by conductors. Crossing leads never creates a connection.
        Unused sockets are their own nets.
      </p>
      {nodes.map((n, i) => (
        <div className="node-row" key={n.id}>
          <span>N{String(i + 1).padStart(2, '0')}</span>
          <code>{n.terminalIds.join('\n') || 'Loose lead assembly'}</code>
          <small>{n.plugIds.length} plug contacts</small>
        </div>
      ))}
    </>
  );
}

export function SettingsPanel({
  tone,
  setTone,
  onImport,
  onExport,
  onReset,
}: {
  tone: 'light' | 'dim';
  setTone(tone: 'light' | 'dim'): void;
  onImport(): void;
  onExport(): void;
  onReset(): void;
}) {
  return (
    <>
      <div className="section-label">WORKSPACE APPEARANCE</div>
      <div className="tone-options">
        <button aria-pressed={tone === 'light'} onClick={() => setTone('light')}>
          <Sun size={18} />
          <span>
            Soft gray<small>Light workspace</small>
          </span>
        </button>
        <button aria-pressed={tone === 'dim'} onClick={() => setTone('dim')}>
          <Moon size={18} />
          <span>
            Slate<small>Dim workspace</small>
          </span>
        </button>
      </div>
      <div className="settings-section">
        <div className="section-label">THIS EXPERIMENT</div>
        <button className="menu-row" onClick={onImport}>
          <ArrowUpFromLine size={16} /> Import bench
        </button>
        <button className="menu-row" onClick={onExport}>
          <ArrowDownToLine size={16} /> Export bench
        </button>
        <button className="menu-row" onClick={onReset}>
          <RotateCcw size={16} /> Reset
        </button>
      </div>
      <div className="panel-note">
        <strong>Saved on this device</strong>
        <p>
          Device values, meter settings, positions, connections and your notebook save
          automatically, separately for each experiment. Export a file to keep a copy.
        </p>
      </div>
      <p className="small-note">
        DT-9205A layout approximated from your reference. DC voltage, DC current and resistance are
        simulated with the meter’s input resistance, shunts and fuse. AC, capacitance, diode and hFE
        modes are marked as not simulated.
      </p>
    </>
  );
}

const safe = <T,>(f: () => T): T | null => {
  try {
    return f();
  } catch {
    return null;
  }
};
const cell = (value: number | null | undefined, decimals = 2) =>
  value === null || value === undefined || !Number.isFinite(value) ? '' : value.toFixed(decimals);

const show = (row: ExperimentTable['rows'][number], value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? ''
    : row.format
      ? row.format(value)
      : cell(value, row.decimals);

/** The sheet's table, transposed so each column (frequency, load) is one row of the panel. */
function ResultsTable({
  table,
  cells,
  current,
  onRecord,
  onClear,
}: {
  table: ExperimentTable;
  cells: Record<string, Record<string, number>>;
  current: string | null;
  onRecord(): void;
  onClear(column: string): void;
}) {
  const button = (
    <button className="record-button" onClick={onRecord} disabled={current === null}>
      {current === null
        ? 'Set up the bench as the sheet describes to record'
        : table.columns.length === 1
          ? 'Record readings'
          : `Record readings at ${current} ${table.columnLabel.replace(/^.*\((.*)\)$/, '$1')}`}
    </button>
  );
  if (table.columns.length === 1) {
    // A single reading set reads better as a list: quantity, value.
    const recorded = cells[table.columns[0]] ?? {};
    return (
      <div className="results-table" data-testid={`table-${table.id}`}>
        <div className="section-label">{table.title.toUpperCase()}</div>
        <table>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r.id} data-testid={`cell-${table.id}-${r.id}`}>
                <th>
                  {r.label}
                  {r.unit ? ` (${r.unit})` : ''}
                </th>
                <td className={r.derive ? 'derived' : ''}>
                  {show(
                    r,
                    r.derive ? safe(() => r.derive!(recorded, table.columns[0])) : recorded[r.id],
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {button}
        {table.note && <p className="small-note">{table.note}</p>}
      </div>
    );
  }
  return (
    <div className="results-table" data-testid={`table-${table.id}`}>
      <div className="section-label">{table.title.toUpperCase()}</div>
      <table>
        <thead>
          <tr>
            <th>{table.columnLabel}</th>
            {table.rows.map((r) => (
              <th key={r.id}>
                {r.label}
                {r.unit && <small>{r.unit}</small>}
              </th>
            ))}
            <th aria-label="Clear" />
          </tr>
        </thead>
        <tbody>
          {table.columns.map((column) => {
            const recorded = cells[column] ?? {};
            return (
              <tr
                key={column}
                className={
                  current !== null && (column === current || column.startsWith(current))
                    ? 'current'
                    : ''
                }
                data-testid={`row-${table.id}-${column}`}
              >
                <th>{column}</th>
                {table.rows.map((r) => (
                  <td key={r.id} className={r.derive ? 'derived' : ''}>
                    {show(r, r.derive ? safe(() => r.derive!(recorded, column)) : recorded[r.id])}
                  </td>
                ))}
                <td>
                  {Object.keys(recorded).length > 0 && (
                    <button
                      className="clear-cell"
                      aria-label={`Clear ${column}`}
                      onClick={() => onClear(column)}
                    >
                      ×
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {button}
      {table.note && <p className="small-note">{table.note}</p>}
    </div>
  );
}
