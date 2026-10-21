import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { Hand, Maximize, Minus, MousePointer2, Plus, Undo2, Redo2 } from 'lucide-react';
import type {
  CableColor,
  ConnectionTarget,
  ElectricalCircuit,
  Equipment,
  Point,
  SimulationResult,
  Workbench as BenchModel,
} from '../domain/models';
import { cableColors } from '../domain/models';
import {
  attachPlug,
  connectCable,
  exposedTarget,
  moveLoosePlug,
  sameAttachment,
} from '../domain/connections';
import { attachmentPosition } from '../domain/positions';
import { cablePath } from './geometry/coordinates';
import { definitionOf, equipmentRegistry } from '../equipment/registry';
import type { MeterSettings } from '../instruments/multimeter';
import type { ScopeSettings } from '../instruments/oscilloscope';
import { EquipmentBody, type ValueField } from './rendering/EquipmentBody';
import { machineLabKinds } from './rendering/MachineLabEquipment';

type Gesture =
  | { kind: 'wire'; start: ConnectionTarget; point: Point; origin: Point }
  | { kind: 'loose'; plugId: string; point: Point }
  | { kind: 'equipment'; equipment: Equipment; origin: Point; point: Point }
  | { kind: 'pan'; origin: Point; camera: Point };
interface Props {
  bench: BenchModel;
  circuit: ElectricalCircuit;
  result: SimulationResult;
  color: CableColor;
  setColor(color: CableColor): void;
  commit(change: (bench: BenchModel) => BenchModel): void;
  selected: { kind: 'equipment' | 'cable'; id: string } | null;
  select(selection: Props['selected']): void;
  onPower(supplyId: string): void;
  onValue(componentId: string, field: ValueField, value: number): void;
  onMeter(meterId: string, change: Partial<MeterSettings>): void;
  panelOpen: boolean;
  panelRef: RefObject<HTMLElement | null>;
  onMessage(message: string): void;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  resetKey: number;
  caption: string;
  simulating?: boolean;
  scopes?: Record<string, ScopeSettings>;
  onScope?(scopeId: string, settings: ScopeSettings): void;
}

export function Workbench({
  bench,
  circuit,
  result,
  color,
  setColor,
  commit,
  selected,
  select,
  onPower,
  onValue,
  onMeter,
  panelOpen,
  panelRef,
  onMessage,
  undo,
  redo,
  canUndo,
  canRedo,
  resetKey,
  caption,
  simulating,
  scopes,
  onScope,
}: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const scene = useRef<SVGGElement>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [keyboardStart, setKeyboardStart] = useState<ConnectionTarget | null>(null);
  const spaceHeld = useRef(false);
  const [holdingSpace, setHoldingSpace] = useState(false);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [mode, setMode] = useState<'wire' | 'pan'>('wire');
  const updateGesture = (next: Gesture | null) => {
    gestureRef.current = next;
    setGesture(next);
  };
  const cancel = () => {
    updateGesture(null);
    setKeyboardStart(null);
  };
  // A new or reset bench is framed beside any open panel, never under it.
  useEffect(() => {
    const inView = bench.equipment.every((e) => {
      const { width, height } = equipmentRegistry[e.definitionId].size;
      return (
        e.position.x >= 0 &&
        e.position.y >= 0 &&
        e.position.x + width <= 1280 &&
        e.position.y + height <= 800
      );
    });
    if (!panelOpen && inView) {
      cancel();
      setCamera({ x: 0, y: 0, zoom: 1 });
    } else fitBench(1);
  }, [resetKey]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.defaultPrevented
      )
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        spaceHeld.current = true;
        setHoldingSpace(true);
      }
      if (event.key === 'Escape') {
        cancel();
        onMessage('Connection cancelled.');
      }
    };
    const release = () => {
      spaceHeld.current = false;
      setHoldingSpace(false);
    };
    const keyup = (e: KeyboardEvent) => {
      if (e.code === 'Space') release();
    };
    window.addEventListener('keydown', escape);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', escape);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', release);
    };
  }, []);
  function coordinates(clientX: number, clientY: number, world = true): Point {
    const matrix = (world ? scene.current : svg.current)?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  }
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest('input,select')) return;
      event.preventDefault();
      if (gestureRef.current) return;
      const point = coordinates(event.clientX, event.clientY, false);
      setCamera((previous) => {
        const zoom = Math.max(
          0.45,
          Math.min(2.5, previous.zoom * Math.exp(-event.deltaY * 0.0015)),
        );
        const scale = zoom / previous.zoom;
        return {
          zoom,
          x: point.x - (point.x - previous.x) * scale,
          y: point.y - (point.y - previous.y) * scale,
        };
      });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  let displayBench = bench;
  if (gesture?.kind === 'equipment')
    displayBench = {
      ...bench,
      equipment: bench.equipment.map((e) =>
        e.id === gesture.equipment.id
          ? {
              ...e,
              position: {
                x: gesture.equipment.position.x + gesture.point.x - gesture.origin.x,
                y: gesture.equipment.position.y + gesture.point.y - gesture.origin.y,
              },
            }
          : e,
      ),
    };
  if (gesture?.kind === 'loose') displayBench = moveLoosePlug(bench, gesture.plugId, gesture.point);

  function nearestTarget(point: Point): ConnectionTarget | null {
    const targetBench = gestureRef.current?.kind === 'loose' ? displayBench : bench;
    const candidates: ConnectionTarget[] = [
      ...bench.terminals.map((t) => ({ kind: 'terminal' as const, terminalId: t.id })),
      ...bench.plugs.map((p) => ({ kind: 'plug-back' as const, plugId: p.id })),
    ];
    let target: ConnectionTarget | null = null;
    let distance = 25;
    for (const candidate of candidates) {
      const exposed = exposedTarget(targetBench, candidate);
      if (gestureRef.current?.kind === 'loose') {
        try {
          attachPlug(targetBench, gestureRef.current.plugId, exposed);
        } catch {
          continue;
        }
      }
      const pos = attachmentPosition(targetBench, candidate);
      const d = Math.hypot(pos.x - point.x, pos.y - point.y);
      if (d < distance) {
        distance = d;
        target = candidate;
      }
    }
    return target ? exposedTarget(targetBench, target) : null;
  }
  const hovered =
    gesture?.kind === 'wire' || gesture?.kind === 'loose' ? nearestTarget(gesture.point) : null;
  function startWire(event: ReactPointerEvent, target: ConnectionTarget) {
    if (event.button !== 0) return;
    if (mode === 'pan' || spaceHeld.current) return;
    event.stopPropagation();
    event.preventDefault();
    const start = keyboardStart ?? exposedTarget(bench, target);
    const point = coordinates(event.clientX, event.clientY);
    setKeyboardStart(null);
    updateGesture({ kind: 'wire', start, point, origin: point });
    svg.current?.setPointerCapture(event.pointerId);
  }
  function keyboardWire(target: ConnectionTarget) {
    if (!keyboardStart) {
      setKeyboardStart(exposedTarget(bench, target));
      onMessage('Starting socket selected. Focus another socket and press Enter to connect.');
      return;
    }
    finishCable(keyboardStart, target);
    setKeyboardStart(null);
  }
  function finishCable(start: ConnectionTarget, target: ConnectionTarget) {
    try {
      const next = connectCable(bench, start, target, color);
      commit(() => next);
      select({ kind: 'cable', id: next.cables[next.cables.length - 1].id });
      onMessage('Lead connected. Drag from its rear socket to stack another.');
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Connection could not be made.');
    }
  }
  function pointerMove(event: ReactPointerEvent) {
    const active = gestureRef.current;
    if (!active) {
      if (keyboardStart) setCursor(coordinates(event.clientX, event.clientY));
      return;
    }
    if (active.kind === 'pan') {
      const point = coordinates(event.clientX, event.clientY, false);
      setCamera((c) => ({
        ...c,
        x: active.camera.x + point.x - active.origin.x,
        y: active.camera.y + point.y - active.origin.y,
      }));
    } else updateGesture({ ...active, point: coordinates(event.clientX, event.clientY) });
  }
  function pointerUp(event: ReactPointerEvent) {
    const active = gestureRef.current;
    if (!active) return;
    const point = coordinates(event.clientX, event.clientY);
    if (active.kind === 'wire') {
      const target = nearestTarget(point);
      if (target && !sameAttachment(exposedTarget(bench, active.start), target))
        finishCable(active.start, target);
      else if (Math.hypot(point.x - active.origin.x, point.y - active.origin.y) < 4) {
        setKeyboardStart(active.start);
        setCursor(point);
        onMessage('Start socket selected. Click another socket to connect, or Esc to cancel.');
      } else onMessage('No socket at the drop point. Connection cancelled.');
    } else if (active.kind === 'equipment') {
      const delta = { x: point.x - active.origin.x, y: point.y - active.origin.y };
      if (Math.hypot(delta.x, delta.y) > 1)
        commit((b) => ({
          ...b,
          equipment: b.equipment.map((e) =>
            e.id === active.equipment.id
              ? {
                  ...e,
                  position: {
                    x: active.equipment.position.x + delta.x,
                    y: active.equipment.position.y + delta.y,
                  },
                }
              : e,
          ),
        }));
    } else if (active.kind === 'loose') {
      const target = nearestTarget(point);
      try {
        const next = target
          ? attachPlug(moveLoosePlug(bench, active.plugId, point), active.plugId, target)
          : moveLoosePlug(bench, active.plugId, point);
        commit(() => next);
        onMessage(target ? 'Plug reconnected.' : 'Plug left loose on the bench.');
      } catch (error) {
        onMessage(error instanceof Error ? error.message : 'Invalid attachment.');
      }
    }
    updateGesture(null);
    if (svg.current?.hasPointerCapture(event.pointerId))
      svg.current.releasePointerCapture(event.pointerId);
  }
  function zoomBy(factor: number) {
    cancel();
    setCamera((c) => {
      const zoom = Math.max(0.45, Math.min(2.5, c.zoom * factor));
      return {
        zoom,
        x: 640 - ((640 - c.x) * zoom) / c.zoom,
        y: 400 - ((400 - c.y) * zoom) / c.zoom,
      };
    });
  }
  function fitBench(maxZoom = 1.5) {
    cancel();
    const bounds = bench.equipment.map((e) => ({
      ...e.position,
      ...equipmentRegistry[e.definitionId].size,
    }));
    if (!bounds.length) return setCamera({ x: 0, y: 0, zoom: 1 });
    const loose = bench.plugs
      .filter((p) => p.attachedTo.kind === 'loose')
      .map((p) => ({
        ...attachmentPosition(bench, { kind: 'plug-back', plugId: p.id }),
        width: 30,
        height: 30,
      }));
    const all = [...bounds, ...loose];
    const left = Math.min(...all.map((b) => b.x)) - 35,
      top = Math.min(...all.map((b) => b.y)) - 30;
    const right = Math.max(...all.map((b) => b.x + b.width)) + 35,
      bottom = Math.max(...all.map((b) => b.y + b.height)) + 85;
    const viewport = svg.current?.getBoundingClientRect();
    if (!viewport) return;
    const panelBounds = panelOpen ? panelRef.current?.getBoundingClientRect() : undefined;
    // CSS panels use screen pixels; the SVG camera uses viewBox coordinates.
    // Convert the available rectangle so narrow previews reserve the actual panel width.
    const start = coordinates(
      panelBounds ? panelBounds.right + 20 : viewport.left + 82,
      viewport.top + 110,
      false,
    );
    const end = coordinates(viewport.right - 24, viewport.bottom - 160, false);
    const zoom = Math.max(
      0.15,
      Math.min(
        maxZoom,
        Math.max(100, end.x - start.x) / (right - left),
        Math.max(100, end.y - start.y) / (bottom - top),
      ),
    );
    setCamera({
      zoom,
      x: (start.x + end.x) / 2 - ((left + right) / 2) * zoom,
      y: (start.y + end.y) / 2 - ((top + bottom) / 2) * zoom,
    });
  }
  const meterEquipment = new Set(
    bench.equipment.filter((e) => definitionOf(e).kind === 'multimeter').map((e) => e.id),
  );
  // Machine-lab equipment has black knurled binding posts with labels printed on its panel.
  const postEquipment = new Set(
    bench.equipment.filter((e) => machineLabKinds.includes(definitionOf(e).kind)).map((e) => e.id),
  );
  const faultTerminals = new Set(
    result.diagnostics.filter((d) => d.severity === 'fault').flatMap((d) => d.terminalIds),
  );
  return (
    <section className="workbench-area" aria-label="Interactive laboratory workbench">
      <div className="bench-toolbar">
        <div className="tool-group">
          <button
            className={`icon-button ${mode === 'wire' ? 'active' : ''}`}
            title="Wire and select"
            aria-label="Wire and select"
            aria-pressed={mode === 'wire'}
            onClick={() => {
              cancel();
              setMode('wire');
            }}
          >
            <MousePointer2 size={17} />
          </button>
          <button
            className={`icon-button ${mode === 'pan' ? 'active' : ''}`}
            title="Pan bench"
            aria-label="Pan bench"
            aria-pressed={mode === 'pan'}
            onClick={() => {
              cancel();
              setMode('pan');
            }}
          >
            <Hand size={17} />
          </button>
        </div>
        <span className="toolbar-divider" />
        <span className="toolbar-label">PATCH LEAD</span>
        <div className="color-picker" role="group" aria-label="Cable color">
          {Object.entries(cableColors).map(([name, hex]) => (
            <button
              key={name}
              aria-label={`${name} cable`}
              aria-pressed={color === name}
              className={`color-button ${color === name ? 'selected' : ''}`}
              style={{ '--cable-color': hex } as React.CSSProperties}
              title={`${name} cable`}
              onClick={() => setColor(name as CableColor)}
            />
          ))}
        </div>
        <span className="toolbar-divider" />
        <div className="tool-group">
          <button
            className="icon-button"
            title="Undo (⌘Z)"
            aria-label="Undo"
            disabled={!canUndo}
            onClick={undo}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-button"
            title="Redo (⌘⇧Z)"
            aria-label="Redo"
            disabled={!canRedo}
            onClick={redo}
          >
            <Redo2 size={17} />
          </button>
        </div>
        <div className="zoom-tools">
          <button className="icon-button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.15)}>
            <Minus size={16} />
          </button>
          <span data-testid="zoom-level">{Math.round(camera.zoom * 100)}%</span>
          <button className="icon-button" aria-label="Zoom in" onClick={() => zoomBy(1.15)}>
            <Plus size={16} />
          </button>
          <button
            className="icon-button"
            title="Fit all equipment in view"
            aria-label="Fit bench"
            onClick={() => fitBench()}
          >
            <Maximize size={16} />
          </button>
        </div>
      </div>
      <div className="canvas-wrap">
        <div className="bench-meta">
          <span>
            <i /> BENCH 01
          </span>
          <span>{caption}</span>
        </div>
        <svg
          ref={svg}
          className={`bench-svg ${mode === 'pan' || holdingSpace ? 'pan-mode' : ''}`}
          viewBox="0 0 1280 800"
          aria-label="Physical wiring canvas"
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={cancel}
          onPointerDown={(event) => {
            if (event.button !== 0 && event.button !== 1) return;
            event.preventDefault();
            select(null);
            setKeyboardStart(null);
            updateGesture({
              kind: 'pan',
              origin: coordinates(event.clientX, event.clientY, false),
              camera,
            });
            svg.current?.setPointerCapture(event.pointerId);
          }}
        >
          <defs>
            <linearGradient id="case" x2="0" y2="1">
              <stop stopColor="#f4f6f8" />
              <stop offset="1" stopColor="#cdd4db" />
            </linearGradient>
            <linearGradient id="steel" x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#cfd3d5" />
              <stop offset=".55" stopColor="#bfc4c7" />
              <stop offset="1" stopColor="#aeb4b8" />
            </linearGradient>
            <linearGradient id="knob" x2="1" y2="1">
              <stop stopColor="#717d85" />
              <stop offset="1" stopColor="#28323a" />
            </linearGradient>
            <linearGradient id="meter-case" x2="1" y2="1">
              <stop stopColor="#f0c769" />
              <stop offset=".5" stopColor="#dda63c" />
              <stop offset="1" stopColor="#edb648" />
            </linearGradient>
            <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r=".85" className="grid-dot" />
            </pattern>
          </defs>
          <g ref={scene} transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
            <rect x="-10000" y="-10000" width="20000" height="20000" fill="url(#grid)" />
            {displayBench.equipment.map((e) => (
              <EquipmentBody
                key={e.id}
                equipment={e}
                bench={displayBench}
                circuit={circuit}
                result={result}
                selected={selected?.kind === 'equipment' && selected.id === e.id}
                onSelect={(id) => select({ kind: 'equipment', id })}
                onPower={onPower}
                onValue={onValue}
                onMeter={onMeter}
                simulating={simulating}
                scope={scopes?.[e.id]}
                onScope={onScope}
                onCommit={commit}
                onDrag={(event, equipment) => {
                  if (mode === 'pan' || spaceHeld.current) return;
                  event.stopPropagation();
                  event.preventDefault();
                  select({ kind: 'equipment', id: equipment.id });
                  if (!equipment.movable) return;
                  const point = coordinates(event.clientX, event.clientY);
                  updateGesture({ kind: 'equipment', equipment, origin: point, point });
                  svg.current?.setPointerCapture(event.pointerId);
                }}
              />
            ))}
            {displayBench.cables.map((c, i) => {
              const a = attachmentPosition(displayBench, {
                kind: 'plug-back',
                plugId: c.plugIds[0],
              });
              const b = attachmentPosition(displayBench, {
                kind: 'plug-back',
                plugId: c.plugIds[1],
              });
              const path = cablePath(a, b, c.routing.slack);
              const active = selected?.kind === 'cable' && selected.id === c.id;
              return (
                <g
                  key={c.id}
                  data-cable={c.id}
                  className="cable"
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${c.color} cable ${i + 1}`}
                  onPointerDown={(event) => {
                    if (mode === 'pan' || spaceHeld.current) return;
                    event.stopPropagation();
                    select({ kind: 'cable', id: c.id });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') select({ kind: 'cable', id: c.id });
                  }}
                >
                  <path d={path} fill="none" stroke="transparent" strokeWidth="22" />
                  {active && <path d={path} fill="none" stroke="#f7faf0" strokeWidth="12" />}
                  <path
                    d={path}
                    fill="none"
                    stroke="#253326"
                    strokeWidth="8"
                    opacity=".14"
                    transform="translate(1 3)"
                  />
                  <path
                    d={path}
                    fill="none"
                    stroke={cableColors[c.color]}
                    strokeWidth="6"
                    strokeLinecap="round"
                  />
                  <path
                    d={path}
                    fill="none"
                    stroke="#fff"
                    strokeWidth="1.2"
                    opacity=".22"
                    transform="translate(-1 -1)"
                  />
                </g>
              );
            })}
            {displayBench.terminals.map((t) => {
              const position = attachmentPosition(displayBench, {
                kind: 'terminal',
                terminalId: t.id,
              });
              const target: ConnectionTarget = { kind: 'terminal', terminalId: t.id };
              const exposed = exposedTarget(bench, target);
              const highlight =
                (hovered && sameAttachment(hovered, exposed)) ||
                (keyboardStart && sameAttachment(keyboardStart, exposed));
              const stackCount = (() => {
                let n = 0;
                let current: ConnectionTarget = target;
                while (true) {
                  const child = bench.plugs.find((p) => sameAttachment(p.attachedTo, current));
                  if (!child) return n;
                  n++;
                  current = { kind: 'plug-back', plugId: child.id };
                }
              })();
              return (
                <g
                  key={t.id}
                  transform={`translate(${position.x} ${position.y})`}
                  className={`terminal ${meterEquipment.has(t.equipmentId) ? 'meter-terminal' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${t.id} socket${stackCount ? `, ${stackCount} plugs stacked` : ''}`}
                  data-terminal={t.id}
                  onPointerDown={(event) => startWire(event, target)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      keyboardWire(target);
                    }
                  }}
                >
                  <circle r="23" fill="transparent" />
                  {(highlight || faultTerminals.has(t.id)) && (
                    <circle
                      r="22"
                      fill="none"
                      stroke={faultTerminals.has(t.id) ? '#c74339' : '#5a87b8'}
                      strokeWidth="2"
                      strokeDasharray="4 3"
                    />
                  )}
                  {postEquipment.has(t.equipmentId) ? (
                    <BindingPost small={/\.TG[12]$/.test(t.id)} />
                  ) : (
                    <>
                      <circle r="16" fill="#a8b2bb" stroke="#7e8a95" />
                      <circle
                        r="12"
                        fill={cableColors[t.color]}
                        stroke="#394137"
                        strokeWidth=".7"
                      />
                      <circle r="6" fill="#1f271f" stroke="#909585" strokeWidth="1.5" />
                      <text y="31" textAnchor="middle" className="terminal-label">
                        {t.label}
                      </text>
                    </>
                  )}
                  {stackCount > 0 && (
                    <g transform="translate(25 -20)">
                      <rect x="-8" y="-9" width="17" height="16" rx="5" fill="#4e6985" />
                      <text textAnchor="middle" y="3" className="stack-count">
                        {stackCount}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
            {displayBench.plugs.map((p) => {
              const position = attachmentPosition(displayBench, {
                kind: 'plug-back',
                plugId: p.id,
              });
              const cable = bench.cables.find((c) => c.id === p.cableId)!;
              const target: ConnectionTarget = { kind: 'plug-back', plugId: p.id };
              const isLoose = p.attachedTo.kind === 'loose';
              return (
                <g
                  key={p.id}
                  transform={`translate(${position.x} ${position.y})`}
                  className="plug"
                  role="button"
                  tabIndex={0}
                  aria-label={
                    isLoose ? `Reconnect loose ${cable.color} plug` : `Stack on ${cable.color} plug`
                  }
                  data-plug={p.id}
                  data-loose={isLoose || undefined}
                  onPointerDown={(event) => {
                    if (mode === 'pan' || spaceHeld.current) return;
                    if (isLoose) {
                      event.stopPropagation();
                      event.preventDefault();
                      updateGesture({
                        kind: 'loose',
                        plugId: p.id,
                        point: coordinates(event.clientX, event.clientY),
                      });
                      svg.current?.setPointerCapture(event.pointerId);
                    } else startWire(event, target);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      keyboardWire(target);
                    }
                  }}
                >
                  <circle r="17" fill="transparent" />
                  <path
                    d="M-6 9L-10 23Q0 27 7 21L6 8"
                    fill={cableColors[cable.color]}
                    stroke="#2d352e"
                    strokeWidth="1"
                  />
                  <circle r="11" fill={cableColors[cable.color]} stroke="#f0ece0" strokeWidth="2" />
                  <circle r="4.5" fill="#253027" stroke="#acb2a2" strokeWidth="1.4" />
                  {isLoose && (
                    <text y="41" textAnchor="middle" className="loose-label">
                      LOOSE
                    </text>
                  )}
                </g>
              );
            })}
            {selected?.kind === 'cable' &&
              displayBench.cables
                .find((c) => c.id === selected.id)
                ?.plugIds.map((plugId, i) => {
                  const point = attachmentPosition(displayBench, { kind: 'plug-back', plugId });
                  return (
                    <g
                      key={`move-${plugId}`}
                      transform={`translate(${point.x} ${point.y + 35})`}
                      role="button"
                      tabIndex={0}
                      aria-label={`Move cable end ${i + 1}`}
                      style={{ cursor: 'grab' }}
                      onPointerDown={(event) => {
                        if (event.button !== 0 || mode === 'pan' || spaceHeld.current) return;
                        event.stopPropagation();
                        event.preventDefault();
                        setKeyboardStart(null);
                        updateGesture({ kind: 'loose', plugId, point });
                        svg.current?.setPointerCapture(event.pointerId);
                        onMessage(
                          'Drop this end onto a socket, or onto the bench to unplug. Esc cancels.',
                        );
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        commit((b) => moveLoosePlug(b, plugId, { x: point.x, y: point.y + 65 }));
                        onMessage('End unplugged. Drag the loose plug to reconnect.');
                      }}
                    >
                      <title>Drag end {i + 1} to reconnect · stacked plugs move together</title>
                      <path d="M0 -23V-12" stroke="#eaf2fa" strokeWidth="2" />
                      <circle r="15" fill="#344e68" stroke="#eaf2fa" strokeWidth="2" />
                      <text
                        textAnchor="middle"
                        y="5"
                        fill="white"
                        fontSize="13"
                        fontWeight="700"
                        pointerEvents="none"
                      >
                        {i + 1}
                      </text>
                    </g>
                  );
                })}
            {keyboardStart && cursor && !gesture && (
              <path
                d={cablePath(attachmentPosition(displayBench, keyboardStart), cursor, 45)}
                fill="none"
                stroke={cableColors[color]}
                strokeWidth="5"
                opacity=".7"
                pointerEvents="none"
              />
            )}
            {gesture?.kind === 'wire' && (
              <path
                d={cablePath(attachmentPosition(displayBench, gesture.start), gesture.point, 45)}
                fill="none"
                stroke={cableColors[color]}
                strokeWidth="6"
                strokeLinecap="round"
                opacity=".85"
                pointerEvents="none"
              />
            )}
            {hovered && gesture?.kind !== 'equipment' && (
              <circle
                cx={attachmentPosition(displayBench, hovered).x}
                cy={attachmentPosition(displayBench, hovered).y}
                r="20"
                fill="none"
                stroke="#5a87b8"
                strokeWidth="2"
                pointerEvents="none"
              />
            )}
          </g>
        </svg>
        <div className="canvas-hint">
          <MousePointer2 size={13} />
          <span>
            {keyboardStart
              ? 'Click the next socket or press Enter · Esc to cancel'
              : gesture?.kind === 'wire'
                ? 'Drop onto a socket or the back of a plug · Esc to cancel'
                : 'Drag to wire · Space + drag to pan · Scroll to zoom'}
          </span>
        </div>
        <div className="bench-scale">
          <span /> VIRTUAL WORKBENCH
        </div>
      </div>
    </section>
  );
}

/** Black knurled 4 mm binding post seen from above (the small TG sockets are recessed). */
function BindingPost({ small }: { small: boolean }) {
  if (small)
    return (
      <>
        <circle r="10" fill="#9aa1a6" stroke="#6c757b" />
        <circle r="5.5" fill="#15181a" />
      </>
    );
  return (
    <>
      <circle r="16" fill="#151719" stroke="#000" />
      {Array.from({ length: 16 }, (_, i) => (
        <path
          key={i}
          d="M0 -15.5V-11"
          stroke="#5b6166"
          strokeWidth="1.6"
          transform={`rotate(${i * 22.5})`}
        />
      ))}
      <circle r="10" fill="#202326" />
      <circle r="5.5" fill="#050606" stroke="#3a3f43" />
    </>
  );
}
