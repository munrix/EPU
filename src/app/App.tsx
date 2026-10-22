import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BookOpen,
  Cable as CableIcon,
  ChevronDown,
  CircleHelp,
  FlaskConical,
  Layers3,
  Power,
  Settings2,
  Trash2,
  Unplug,
  Wrench,
  X,
} from 'lucide-react';
import type { CableColor, Workbench as BenchModel } from '../domain/models';
import { cableColors } from '../domain/models';
import { deleteCable, removeEquipment, unplug } from '../domain/connections';
import { definitionOf } from '../equipment/registry';
import { addBoard, addResistor } from '../equipment/commands';
import { experimentById } from '../experiments/catalog';
import { stepContext } from '../experiments/context';
import { parseBench } from '../persistence/bench';
import type { MeterSettings } from '../instruments/multimeter';
import { Workbench } from '../bench/Workbench';
import type { ValueField } from '../bench/rendering/EquipmentBody';
import { useWorkbench } from './useWorkbench';
import { useNotebook } from './useNotebook';
import { useScopeSettings } from './useScopeSettings';
import {
  ConnectionsPanel,
  ExperimentsPanel,
  GuidePanel,
  NodesPanel,
  ReadingsPanel,
  SettingsPanel,
  unique,
} from './panels';

type Panel = 'experiments' | 'guide' | 'readings' | 'connections' | 'nodes' | 'settings';
const panels = [
  { key: 'experiments', icon: FlaskConical, label: 'Experiments' },
  { key: 'guide', icon: BookOpen, label: 'Experiment guide' },
  { key: 'readings', icon: Activity, label: 'Readings' },
  { key: 'connections', icon: CableIcon, label: 'Connections' },
  { key: 'nodes', icon: Layers3, label: 'Electrical nodes' },
  { key: 'settings', icon: Settings2, label: 'Workspace settings' },
] as const;
const panelNames: Record<Panel, string> = Object.fromEntries(
  panels.map((p) => [p.key, p.label]),
) as Record<Panel, string>;
function savedTone(): 'light' | 'dim' {
  try {
    return localStorage.getItem('epu-lab.tone') === 'dim' ? 'dim' : 'light';
  } catch {
    return 'light';
  }
}
type Selection = { kind: 'equipment' | 'cable'; id: string } | null;

export default function App() {
  const {
    bench,
    circuit,
    result,
    commit,
    undo,
    redo,
    switchExperiment,
    replaceBench,
    canUndo,
    canRedo,
    saved,
    simulating,
  } = useWorkbench();
  const [scopes, setScopes] = useScopeSettings(bench.experimentId);
  const experiment = experimentById(bench.experimentId)!;
  const ctx = useMemo(() => stepContext(bench, circuit, result), [bench, circuit, result]);
  const { notebook, reset: resetNotebook, record, clearColumn } = useNotebook(experiment, ctx);
  const [color, setColor] = useState<CableColor>('red');
  const [selected, select] = useState<Selection>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [tone, setTone] = useState(savedTone);
  const [message, setMessage] = useState(
    'Drag between sockets to wire. Control values directly on the instruments.',
  );
  const [helpOpen, setHelpOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const supply = bench.equipment.find((e) =>
    ['dc-supply', 'bench-panel', 'function-generator', 'mains-supply', 'variac'].includes(
      definitionOf(e).kind,
    ),
  );
  const supplySource = bench.components.find(
    (c) =>
      (c.kind === 'dc-source' || c.kind === 'ac-source') && supply?.componentIds.includes(c.id),
  );
  const powered =
    (supplySource?.kind === 'dc-source' || supplySource?.kind === 'ac-source') &&
    supplySource.enabled;
  const diagnostics = unique(result.diagnostics);
  const fault = diagnostics.find((d) => d.severity === 'fault' || d.severity === 'error');
  const complete =
    experiment.steps.length > 0 && notebook.achieved.length === experiment.steps.length;
  const cable =
    selected?.kind === 'cable' ? bench.cables.find((c) => c.id === selected.id) : undefined;
  const equipment =
    selected?.kind === 'equipment' ? bench.equipment.find((e) => e.id === selected.id) : undefined;
  const stacks = bench.plugs.filter((p) => p.attachedTo.kind === 'plug-back').length;

  // Protection trips arrive with the edit that caused them. Tell the student what happened.
  const previousFuses = useRef<{ experimentId: string; blown: Record<string, boolean> } | null>(
    null,
  );
  useEffect(() => {
    const blown = Object.fromEntries(
      Object.entries(bench.instrumentSettings).map(([id, s]) => [id, s.fuseBlown]),
    );
    const previous = previousFuses.current;
    if (previous?.experimentId === bench.experimentId) {
      const newly = Object.keys(blown).filter((id) => blown[id] && !previous.blown[id]);
      if (newly.length)
        setMessage(
          'The meter’s 200 mA fuse blew: too much current flowed through the mA socket. Replace it from Readings once the wiring is fixed.',
        );
    }
    previousFuses.current = { experimentId: bench.experimentId, blown };
  }, [bench.instrumentSettings, bench.experimentId]);

  function togglePanel(next: Panel) {
    setPanel((p) => (p === next ? null : next));
  }
  function onValue(componentId: string, field: ValueField, value: number) {
    if (!Number.isFinite(value)) return;
    commit((b) => {
      const owner = b.equipment.find((e) => e.componentIds.includes(componentId));
      if (owner && definitionOf(owner).fixedValues) return b;
      const range = owner ? definitionOf(owner).limits[field] : undefined;
      const clamped = range ? Math.max(range[0], Math.min(range[1], value)) : value;
      return {
        ...b,
        components: b.components.map((c) =>
          c.id === componentId && field in c ? { ...c, [field]: clamped } : c,
        ),
      };
    });
  }
  function onMeter(meterId: string, change: Partial<MeterSettings>) {
    commit((b) => ({
      ...b,
      instrumentSettings: {
        ...b.instrumentSettings,
        [meterId]: { ...b.instrumentSettings[meterId], ...change },
      },
    }));
  }
  function togglePower(supplyId = supply?.id) {
    if (!supplyId) return;
    const target = bench.equipment.find((e) => e.id === supplyId);
    const switched = (c: BenchModel['components'][number]) =>
      (c.kind === 'dc-source' || c.kind === 'ac-source') && target?.componentIds.includes(c.id);
    const on = bench.components.some((c) => switched(c) && 'enabled' in c && c.enabled);
    // One switch: a bench supply's output, or every output on a lab bench panel.
    commit((b) => ({
      ...b,
      components: b.components.map((c) => (switched(c) ? { ...c, enabled: !on } : c)),
    }));
    setMessage(
      on
        ? 'Supply output opened. Your connections remain in place.'
        : 'Supply energized. Readings come from your connections.',
    );
  }
  function removeSelected() {
    if (cable) {
      commit((b) => deleteCable(b, cable.id));
      select(null);
      setMessage('Lead removed. Plugs stacked on it are left loose.');
    } else if (equipment?.removable) {
      commit((b) => removeEquipment(b, equipment.id));
      select(null);
      setMessage(`${equipment.label ?? 'Module'} removed. Its leads were left loose on the bench.`);
    }
  }
  function onAddResistor() {
    try {
      commit((b) => addResistor(b));
      setMessage('Resistor module added. Drag it by its top handle.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not add a module.');
    }
  }
  function onSwitchExperiment(id: string) {
    if (id === bench.experimentId) return setPanel('guide');
    switchExperiment(id);
    select(null);
    setResetKey((k) => k + 1);
    setPanel('guide');
    setMessage(
      `${experimentById(id)!.code}: ${experimentById(id)!.title}. Your bench for it is restored.`,
    );
  }
  function onAddBoard(definitionId: string, id: string) {
    try {
      commit((b) => addBoard(b, definitionId, id));
      setMessage(`${definitionOf({ definitionId }).name} added below the bench.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not add the board.');
    }
  }
  function resetExperiment() {
    commit(() => experiment.createBench());
    resetNotebook();
    select(null);
    setResetKey((k) => k + 1);
    setMessage('Experiment reset. Undo restores your previous bench.');
  }
  useEffect(() => {
    try {
      localStorage.setItem('epu-lab.tone', tone);
    } catch {
      /* Preference saving is optional. */
    }
  }, [tone]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement ||
        helpDialog.current?.open
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        (cable || equipment?.removable)
      ) {
        event.preventDefault();
        removeSelected();
      }
      if (!event.metaKey && !event.ctrlKey && event.key.toLowerCase() === 'g') togglePanel('guide');
      if (event.key === 'Escape') {
        select(null);
        setPanel(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
  useEffect(() => {
    if (helpOpen) helpDialog.current?.showModal();
    else helpDialog.current?.close();
  }, [helpOpen]);
  function exportBench() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(bench, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `epu-${bench.experimentId}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Workbench exported with device settings and plug stacks.');
  }
  async function importBench(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('File is too large.');
      const imported: BenchModel = parseBench(JSON.parse(await file.text()));
      replaceBench(imported);
      select(null);
      setResetKey((k) => k + 1);
      setMessage(
        `Bench restored for ${experimentById(imported.experimentId)!.code}, including device values and meter range.`,
      );
    } catch (error) {
      setMessage(
        `Could not import bench: ${error instanceof Error ? error.message : 'invalid file'}`,
      );
    }
    if (fileInput.current) fileInput.current.value = '';
  }
  const meterOf = (id: string) => bench.instrumentSettings[id];

  return (
    <main className={`app-shell tone-${tone}`}>
      <Workbench
        bench={bench}
        circuit={circuit}
        result={result}
        color={color}
        setColor={setColor}
        commit={commit}
        selected={selected}
        select={select}
        onPower={togglePower}
        onValue={onValue}
        onMeter={onMeter}
        onMessage={setMessage}
        undo={undo}
        redo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        resetKey={resetKey}
        panelOpen={panel !== null}
        panelRef={panelRef}
        caption={`${experiment.code} / ${experiment.title.toUpperCase()}`}
        simulating={simulating}
        scopes={scopes}
        onScope={(id, settings) => setScopes({ ...scopes, [id]: settings })}
      />
      <header className="floating-header">
        <div className="brand-mark">
          <Activity size={23} strokeWidth={1.7} />
        </div>
        <strong className="wordmark">
          EPU<span>LAB</span>
        </strong>
        <span className="header-divider" />
        <button
          className="workspace-name"
          onClick={() => togglePanel('experiments')}
          aria-label="Choose experiment"
        >
          <span>
            {experiment.title}
            <small>
              {experiment.code} · {experiment.station ? 'EPU lab bench' : 'DC circuits'}
            </small>
          </span>
          <ChevronDown size={14} />
        </button>
        <span
          className="save-indicator"
          title={saved ? 'Saved on this device' : 'Local saving unavailable'}
          aria-label={saved ? 'Saved on this device' : 'Local saving unavailable'}
        >
          <span className={saved ? 'saved-dot' : 'unsaved-dot'} />
        </span>
      </header>
      <div className="session-controls">
        <span className="session-label">
          {experiment.station ? 'BENCH' : 'EXPERIMENT'} {experiment.code}
        </span>
        <button
          className="icon-button"
          aria-label="Open workbench help"
          title="Help & shortcuts"
          onClick={() => setHelpOpen(true)}
        >
          <CircleHelp size={19} />
        </button>
        {supply && (
          <button
            className={`power-button ${powered ? 'on' : ''} ${fault ? 'fault' : ''}`}
            aria-pressed={powered}
            onClick={() => togglePower()}
          >
            <Power size={15} />
            {powered ? 'Power on' : 'Power off'}
            <i />
          </button>
        )}
      </div>
      <nav className="panel-rail" aria-label="Workspace panels">
        {panels.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            className={`rail-button ${panel === key ? 'active' : ''}`}
            aria-label={label}
            aria-expanded={panel === key}
            title={label}
            onClick={() => togglePanel(key)}
          >
            <Icon size={19} />
            {key === 'guide' && complete && <span className="complete-dot" />}
          </button>
        ))}
      </nav>
      {panel && (
        <aside ref={panelRef} className="workspace-panel" aria-label={panelNames[panel]}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">YOUR WORKSPACE</span>
              <h2>{panelNames[panel]}</h2>
            </div>
            <button className="icon-button" aria-label="Close panel" onClick={() => setPanel(null)}>
              <X size={18} />
            </button>
          </div>
          <div key={`${panel}:${experiment.id}`} className="panel-content">
            {panel === 'experiments' && (
              <ExperimentsPanel current={bench.experimentId} onSelect={onSwitchExperiment} />
            )}
            {panel === 'guide' && (
              <GuidePanel
                experiment={experiment}
                notebook={notebook}
                bench={bench}
                onAddResistor={onAddResistor}
                onAddBoard={onAddBoard}
                ctx={ctx}
                onRecord={(tableId) => {
                  const { column, rows } = record(tableId);
                  setMessage(
                    rows.length
                      ? `Recorded ${rows.join(', ')} at ${column}.`
                      : 'Nothing to record yet: connect the meter or scope as the sheet describes.',
                  );
                }}
                onClearColumn={clearColumn}
                onPreset={(presetId) => {
                  const preset = experiment.presets?.find((p) => p.id === presetId);
                  if (!preset) return;
                  replaceBench(preset.build());
                  setMessage(
                    `${preset.title} is wired. Switch on the R S T breaker and the supplies to test.`,
                  );
                }}
              />
            )}
            {panel === 'readings' && (
              <ReadingsPanel
                bench={bench}
                circuit={circuit}
                result={result}
                experiment={experiment}
                onReplaceFuse={(id) => {
                  onMeter(id, { fuseBlown: false });
                  setMessage('Fuse replaced. If the wiring is unchanged it will blow again.');
                }}
              />
            )}
            {panel === 'connections' && (
              <ConnectionsPanel
                bench={bench}
                selectedId={cable?.id}
                onSelect={(id) => select({ kind: 'cable', id })}
              />
            )}
            {panel === 'nodes' && <NodesPanel circuit={circuit} />}
            {panel === 'settings' && (
              <SettingsPanel
                tone={tone}
                setTone={setTone}
                onImport={() => fileInput.current?.click()}
                onExport={exportBench}
                onReset={resetExperiment}
              />
            )}
          </div>
        </aside>
      )}
      {cable && (
        <div className="selection-bar">
          <span className="lead-dot" style={{ background: cableColors[cable.color] }} />
          <strong>Patch lead</strong>
          <select
            aria-label="Selected lead color"
            value={cable.color}
            onChange={(e) => {
              const value = e.target.value as CableColor;
              commit((b) => ({
                ...b,
                cables: b.cables.map((c) => (c.id === cable.id ? { ...c, color: value } : c)),
              }));
            }}
          >
            {Object.keys(cableColors).map((c) => (
              <option key={c} value={c}>
                {c[0].toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
          <span className="selection-divider" />
          {cable.plugIds.map((id, i) => (
            <button
              key={id}
              title={`Unplug end ${i + 1}`}
              onClick={() => {
                commit((b) => unplug(b, id));
                setMessage(`End ${i + 1} lifted with its stack. Drag the loose plug to reconnect.`);
              }}
            >
              <Unplug size={14} /> End {i + 1}
            </button>
          ))}
          <button aria-label="Delete selected cable" title="Delete lead" onClick={removeSelected}>
            <Trash2 size={15} />
          </button>
          <button aria-label="Clear selection" title="Close" onClick={() => select(null)}>
            <X size={15} />
          </button>
        </div>
      )}
      {equipment && (equipment.removable || meterOf(equipment.id)?.fuseBlown) && (
        <div className="selection-bar">
          <strong className="always">
            {equipment.label ? `${equipment.label} · ` : ''}
            {definitionOf(equipment).name}
          </strong>
          <span className="selection-divider" />
          {meterOf(equipment.id)?.fuseBlown && (
            <button onClick={() => onMeter(equipment.id, { fuseBlown: false })}>
              <Wrench size={14} /> Replace fuse
            </button>
          )}
          {equipment.removable && (
            <button aria-label="Remove selected module" onClick={removeSelected}>
              <Trash2 size={14} /> Remove
            </button>
          )}
          <button aria-label="Clear selection" title="Close" onClick={() => select(null)}>
            <X size={15} />
          </button>
        </div>
      )}
      {simulating && (
        <div className="simulating-badge" role="status" aria-label="Simulating">
          <i /> ngspice simulating…
        </div>
      )}
      {fault && (
        <div className="fault-banner" role="alert">
          <span />
          <strong>Electrical fault</strong>
          <span>{fault.message}</span>
        </div>
      )}
      <footer className="workspace-footer">
        <div className="live-message" role="status" aria-live="polite">
          {message}
        </div>
        <span>
          {bench.cables.length} leads · {stacks} stacked <span className="footer-separator">/</span>{' '}
          Local workspace
        </span>
      </footer>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => void importBench(e.target.files?.[0])}
      />
      <dialog ref={helpDialog} className="help-dialog" onCancel={() => setHelpOpen(false)}>
        <div className="help-heading">
          <h2>Your bench, your connections.</h2>
          <button
            className="icon-button"
            aria-label="Close help"
            onClick={() => setHelpOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <dl>
          <dt>Wire & stack</dt>
          <dd>
            Drag socket to socket, or click a start and end socket. Start from the rear of an
            existing plug to stack. With a keyboard, focus each socket and press Enter. Escape
            cancels.
          </dd>
          <dt>Device controls</dt>
          <dd>
            Type values on the supply (voltage and current limit) or a resistor. Drag a knob up or
            right to increase, or use its arrow keys. Click the meter’s range labels, or step the
            selector with arrow keys. Its POWER button switches the meter separately.
          </dd>
          <dt>Real meter behavior</dt>
          <dd>
            DC V has a 10 MΩ input. DC A uses the mA socket (fused at 200 mA, with a range shunt) or
            the unfused 20A socket. Ω drives a small test current and must be used on unpowered
            parts. A lead left in a current socket shorts whatever it touches.
          </dd>
          <dt>Bench supply</dt>
          <dd>
            The supply regulates voltage (CV) until the load needs more than the current limit, then
            holds the limit (CC). A short circuit shows CC at 0 V.
          </dd>
          <dt>Move around</dt>
          <dd>
            Drag equipment by its top handle. Drag the background to pan, hold Space to pan from
            equipment, and scroll to zoom. Fit bench brings everything back into view.
          </dd>
          <dt>Experiments & notebook</dt>
          <dd>
            Choose an experiment from the header. Each keeps its own bench. Readings are written to
            the guide’s notebook when a step is first achieved. G toggles the guide.
          </dd>
          <dt>Undo & disconnect</dt>
          <dd>
            Cmd/Ctrl Z undoes an edit, including a fuse it blew; Shift adds redo. Select a lead to
            show numbered end handles. Drag a handle to another socket to reconnect, or drop it on
            the bench to unplug. Esc cancels a drag. Unplugging a base plug lifts its whole stack.
          </dd>
          <dt>Model limits</dt>
          <dd>
            DC only. No AC, capacitance, diode, hFE, transient, heating or 20 A time limits yet.
            Panel artwork is illustrative until real lab references are provided.
          </dd>
        </dl>
        <button className="primary-button" onClick={() => setHelpOpen(false)}>
          Back to the workbench
        </button>
      </dialog>
    </main>
  );
}
