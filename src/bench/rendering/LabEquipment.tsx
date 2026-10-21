import { useEffect, useState, type PointerEvent, type ReactNode } from 'react';
import type {
  ElectricalCircuit,
  Equipment,
  SimulationResult,
  Workbench,
} from '../../domain/models';
import { definitionOf, equipmentComponents } from '../../equipment/registry';
import {
  autoset,
  channelTrace,
  coupled,
  DIVISIONS,
  formatTime,
  formatVolts,
  measureChannel,
  phaseBetween,
  SECONDS_PER_DIV,
  triggerStart,
  VOLTS_PER_DIV,
  defaultScopeSettings,
  type ScopeSettings,
} from '../../instruments/oscilloscope';
import { DeviceValue, ValueKnob } from './DeviceControls';
import { Lamp, Load, MachineBox, MainsSupply, PanelMeter, Variac } from './NetworkEquipment';
import type { ValueField } from '../../domain/models';
import { decadeDials } from '../../equipment/lab';

export interface LabProps {
  equipment: Equipment;
  bench: Workbench;
  circuit: ElectricalCircuit;
  result: SimulationResult;
  selected: boolean;
  simulating?: boolean;
  scope?: ScopeSettings;
  onDrag(event: PointerEvent<SVGGElement>, equipment: Equipment): void;
  onSelect(id: string): void;
  onPower(equipmentId: string): void;
  onValue(componentId: string, field: ValueField, value: number): void;
  onScope?(scopeId: string, settings: ScopeSettings): void;
}

const press = (action: () => void, label: string) => ({
  role: 'button',
  tabIndex: 0,
  'aria-label': label,
  onPointerDown: (e: PointerEvent) => e.stopPropagation(),
  onClick: action,
  onKeyDown: (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  },
});
function Screw({ x, y, r = 5 }: { x: number; y: number; r?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill="#d5d9dc" stroke="#8f989e" />
      <path
        d={`M${-r * 0.6} 0H${r * 0.6}M0 ${-r * 0.6}V${r * 0.6}`}
        stroke="#6f7a81"
        strokeWidth="1.2"
      />
    </g>
  );
}

export function LabEquipmentBody(props: LabProps) {
  const { equipment: e, selected, onDrag, onSelect } = props;
  const definition = definitionOf(e);
  const { width: w, height: h } = definition.size;
  const drag = {
    className: 'equipment-handle',
    onPointerDown: (event: PointerEvent<SVGGElement>) => onDrag(event, e),
  };
  const art: Record<string, ReactNode> = {
    'bench-panel': <BenchPanel {...props} />,
    'rectifier-board': <RectifierBoard />,
    'transistor-board': <TransistorBoard />,
    oscilloscope: <Oscilloscope {...props} />,
    'function-generator': <FunctionGenerator {...props} />,
    'decade-box': <DecadeBox {...props} />,
    'mains-supply': <MainsSupply {...props} />,
    wattmeter: <PanelMeter {...props} />,
    'pf-meter': <PanelMeter {...props} />,
    'ac-ammeter': <PanelMeter {...props} />,
    'ac-voltmeter': <PanelMeter {...props} />,
    load: <Load {...props} />,
    'dc-machine': <MachineBox />,
    lamp: <Lamp {...props} />,
    variac: <Variac {...props} />,
  };
  return (
    <g transform={`translate(${e.position.x} ${e.position.y})`} data-equipment={e.id}>
      <rect x="6" y="10" width={w} height={h} rx="10" fill="#1b2938" opacity=".14" />
      {selected && (
        <rect
          x="-8"
          y="-8"
          width={w + 16}
          height={h + 16}
          rx="14"
          fill="none"
          stroke="#5c83ad"
          strokeWidth="1.5"
          strokeDasharray="5 4"
        />
      )}
      {/* The whole body is the handle; sockets and controls sit above it. */}
      <g
        {...drag}
        role="button"
        tabIndex={0}
        aria-label={`Move ${definition.name}`}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSelect(e.id);
        }}
      >
        <Body kind={definition.kind} w={w} h={h} />
      </g>
      {art[definition.kind]}
    </g>
  );
}

function Body({ kind, w, h }: { kind: string; w: number; h: number }) {
  if (kind === 'bench-panel')
    return (
      <>
        <rect width={w} height={h} rx="4" fill="url(#steel)" stroke="#8d969c" />
        <rect y={h - 14} width={w} height="14" fill="#3b3430" />
      </>
    );
  if (kind === 'function-generator')
    return (
      <>
        <rect width={w} height={h} rx="12" fill="#e9ebe6" stroke="#b9bcb4" strokeWidth="2" />
        <rect x="10" y="10" width={w - 20} height="26" rx="5" fill="#2f5b8a" />
      </>
    );
  if (['wattmeter', 'pf-meter', 'ac-ammeter', 'ac-voltmeter'].includes(kind))
    return (
      <>
        <rect width={w} height={h} rx="8" fill="#b9bcbc" stroke="#7e8384" strokeWidth="1.5" />
        <rect x="6" y="150" width={w - 12} height={h - 156} rx="4" fill="#6c7072" />
      </>
    );
  if (kind === 'mains-supply')
    return <rect width={w} height={h} rx="6" fill="url(#steel)" stroke="#8d969c" />;
  if (kind === 'dc-machine' || kind === 'variac')
    return <rect width={w} height={h} rx="10" fill="#cfc6b4" stroke="#8c8270" />;
  if (kind === 'lamp') return <rect width={w} height={h} rx="8" fill="#e9eaeb" stroke="#9aa0a4" />;
  if (kind === 'load') return <rect width={w} height={h} rx="8" fill="#dcdfe0" stroke="#8d969c" />;
  if (kind === 'decade-box')
    return (
      <>
        <rect width={w} height={h} rx="6" fill="#9aa1a7" stroke="#6f777d" />
        <rect x="8" y="8" width={w - 16} height={h - 16} rx="4" fill="#c4c9cc" />
      </>
    );
  if (kind === 'oscilloscope')
    return <rect width={w} height={h} rx="16" fill="#f1efe8" stroke="#c9c6bb" strokeWidth="2" />;
  return (
    <>
      <rect x="-6" y="-4" width={w + 12} height={h + 8} rx="4" fill="#e6dccb" stroke="#bfb29c" />
      <rect width={w} height={h} rx="3" fill="#fbfbf8" stroke="#d2d0c8" />
    </>
  );
}

function BenchPanel({ equipment: e, bench, circuit, result, onPower, onValue }: LabProps) {
  const parts = equipmentComponents(bench, e);
  const variable = parts.find((c) => c.id === `${e.id}.var`);
  const on = parts.some((c) => (c.kind === 'dc-source' || c.kind === 'ac-source') && c.enabled);
  const v = (t: string) => result.nodeVoltages[circuit.terminalToNode[t]];
  const output =
    variable?.kind === 'dc-source' && variable.enabled
      ? Math.max(0, (v(variable.positive) ?? 0) - (v(variable.negative) ?? 0))
      : 0;
  const needle = -140 + (Math.min(60, output) / 60) * 100;
  const ink = '#1c2227';
  return (
    <g>
      {[20, 620, 1220].map((x) => (
        <Screw key={x} x={x} y={18} />
      ))}
      <Screw x={20} y={228} />
      <Screw x={1220} y={228} />
      {/* Variable DC supply with its analog voltmeter */}
      <g transform="translate(70 22)">
        <rect width="170" height="138" rx="8" fill="#15181a" />
        <rect x="12" y="12" width="146" height="112" rx="3" fill="#ece6d4" />
        <path d="M34 98 A62 62 0 0 1 136 98" fill="none" stroke={ink} strokeWidth="1" />
        {Array.from({ length: 13 }, (_, i) => {
          const a = ((-140 + i * (100 / 12)) * Math.PI) / 180;
          const r1 = 62,
            r2 = i % 2 ? 56 : 52;
          return (
            <g key={i}>
              <path
                d={`M${85 + Math.cos(a) * r1} ${122 + Math.sin(a) * r1}L${85 + Math.cos(a) * r2} ${122 + Math.sin(a) * r2}`}
                stroke={ink}
              />
              {i % 4 === 0 && (
                <text
                  x={85 + Math.cos(a) * 44}
                  y={125 + Math.sin(a) * 44}
                  textAnchor="middle"
                  fontSize="9"
                  fill={ink}
                >
                  {i * 5}
                </text>
              )}
            </g>
          );
        })}
        <text x="28" y="38" fontSize="13" fontWeight="700" fill={ink}>
          V
        </text>
        <g
          transform={`translate(85 122) rotate(${needle + 90})`}
          style={{ transition: 'transform .35s ease-out' }}
        >
          <path d="M0 0V-66" stroke={ink} strokeWidth="1.6" />
        </g>
        <circle cx="85" cy="122" r="7" fill="#3a3f43" />
      </g>
      {variable?.kind === 'dc-source' && (
        <ValueKnob
          x={155}
          y={188}
          small
          label="Variable supply voltage knob"
          value={variable.voltageVolts}
          min={0}
          max={30}
          step={0.5}
          onChange={(value) => onValue(variable.id, 'voltageVolts', value)}
        />
      )}
      <text x="155" y="249" textAnchor="middle" className="bench-print">
        0–30 V D.C
      </text>
      {/* ON/OFF */}
      <g transform="translate(330 70)">
        <circle cx="0" cy="0" r="6" fill={on ? '#e2453a' : '#5a2320'} stroke="#401614">
          {on && (
            <animate attributeName="opacity" values="1;.85;1" dur="2s" repeatCount="indefinite" />
          )}
        </circle>
        <text y="30" textAnchor="middle" className="bench-print strong">
          OFF
        </text>
        <g
          {...press(() => onPower(e.id), on ? 'Switch bench off' : 'Switch bench on')}
          className="power-switch"
        >
          <rect x="-16" y="40" width="32" height="46" rx="5" fill="#9aa1a6" stroke="#6c757b" />
          <circle cx="0" cy="63" r="8" fill="#cfd4d7" stroke="#6c757b" />
          <path
            d={on ? 'M0 63L0 80' : 'M0 63L0 46'}
            stroke="#2b3034"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </g>
        <text y="104" textAnchor="middle" className="bench-print strong">
          ON
        </text>
      </g>
      {/* Fixed ±12 V outputs with the drawn common */}
      {[
        { x: 470, key: 'dc1' },
        { x: 640, key: 'dc2' },
      ].map((s) => (
        <g key={s.key}>
          <text x={s.x} y="160" textAnchor="middle" className="bench-print big">
            12 V
          </text>
          <text x={s.x} y="226" textAnchor="middle" className="bench-print strong">
            D.C
          </text>
        </g>
      ))}
      <path
        d="M510 244V250H600V244M555 250V258M545 258H565M548 262H562M552 266H558"
        fill="none"
        stroke="#3c4a5a"
        strokeWidth="1.3"
      />
      {/* Three-phase transformer secondary */}
      <text x="875" y="86" textAnchor="middle" className="bench-print big">
        T.R 12 V
      </text>
      <text x="875" y="102" textAnchor="middle" className="bench-print">
        A.C · 50 Hz
      </text>
      {/* Mains indicators and fuses */}
      {[
        { x: 1060, fill: '#c9302c', label: 'R' },
        { x: 1120, fill: '#e0a526', label: 'S' },
        { x: 1180, fill: '#3fa152', label: 'T' },
      ].map((lamp) => (
        <g key={lamp.label} transform={`translate(${lamp.x} 110)`}>
          <circle r="24" fill="#aab0b4" />
          <circle r="20" fill={lamp.fill} opacity=".9" />
          <rect x="-12" y="-7" width="24" height="14" rx="2" fill="#2a1e1a" opacity=".55" />
          <text y="4" textAnchor="middle" fontSize="9" fontFamily="var(--mono)" fill="#ffe9c8">
            230
          </text>
          <circle cy="52" r="12" fill="#23272a" />
          <text y="55" textAnchor="middle" fontSize="6" fill="#bfc5c9">
            FUSE
          </text>
          <text y="92" textAnchor="middle" className="bench-print strong">
            {lamp.label}
          </text>
        </g>
      ))}
    </g>
  );
}

function Diode({ x, top, bottom }: { x: number; top: number; bottom: number }) {
  const mid = (top + bottom) / 2;
  return (
    <g stroke="#1f2328" strokeWidth="1.6" fill="none">
      <path d={`M${x} ${top + 16}V${mid - 9}M${x} ${mid + 9}V${bottom - 16}`} />
      <path d={`M${x - 9} ${mid + 7}L${x + 9} ${mid + 7}L${x} ${mid - 7}Z`} fill="#1f2328" />
      <path d={`M${x - 9} ${mid - 8}H${x + 9}`} strokeWidth="2.2" />
    </g>
  );
}
function Resistor({
  x,
  top,
  bottom,
  label,
}: {
  x: number;
  top: number;
  bottom: number;
  label: string;
}) {
  const mid = (top + bottom) / 2;
  return (
    <g stroke="#1f2328" strokeWidth="1.6" fill="none">
      <path
        d={`M${x} ${top + 16}V${mid - 24}l-7 4 14 8 -14 8 14 8 -14 8 14 8 -7 4V${bottom - 16}`}
      />
      <text x={x + 12} y={mid + 4} className="board-print" stroke="none" fill="#1f2328">
        {label}
      </text>
    </g>
  );
}
function Capacitor({
  x,
  top,
  bottom,
  label,
}: {
  x: number;
  top: number;
  bottom: number;
  label: string;
}) {
  const mid = (top + bottom) / 2;
  return (
    <g stroke="#1f2328" strokeWidth="1.6" fill="none">
      <path
        d={`M${x} ${top + 16}V${mid - 5}M${x - 12} ${mid - 5}H${x + 12}M${x - 12} ${mid + 5}H${x + 12}M${x} ${mid + 5}V${bottom - 16}`}
      />
      <text x={x - 16} y={mid - 10} className="board-print" stroke="none" fill="#1f2328">
        +
      </text>
      <text x={x + 8} y={mid - 14} className="board-print" stroke="none" fill="#1f2328">
        {label}
      </text>
    </g>
  );
}

function RectifierBoard() {
  const xs = [75, 147, 212, 275, 335, 400, 465];
  return (
    <g pointerEvents="none">
      {[
        [18, 18],
        [512, 18],
        [18, 352],
        [512, 352],
      ].map(([x, y]) => (
        <Screw key={`${x}${y}`} x={x} y={y} r={7} />
      ))}
      {xs.slice(0, 3).map((x) => (
        <g key={x}>
          <Diode x={x} top={40} bottom={145} />
          <Diode x={x} top={220} bottom={330} />
        </g>
      ))}
      <Capacitor x={xs[3]} top={40} bottom={330} label="100µF" />
      <Capacitor x={xs[4]} top={40} bottom={330} label="10µF" />
      <Resistor x={xs[5]} top={40} bottom={330} label="1kΩ" />
      <Resistor x={xs[6]} top={40} bottom={330} label="10kΩ" />
    </g>
  );
}

function TransistorBoard() {
  return (
    <g pointerEvents="none" stroke="#1f2328" strokeWidth="1.6" fill="none">
      {[
        [18, 18],
        [472, 18],
        [18, 332],
        [472, 332],
      ].map(([x, y]) => (
        <Screw key={`${x}${y}`} x={x} y={y} r={7} />
      ))}
      <path d="M151 170H184M184 156V184M196 156V184M196 170H229" />
      <path d="M151 245H160l4 -8 8 16 8 -16 8 16 8 -16 8 16 8 -16 4 8H229" />
      <text x="170" y="228" className="board-print" stroke="none" fill="#1f2328">
        10kΩ
      </text>
      <path d="M405 66V74l-7 4 14 8 -14 8 14 8 -14 8 7 4V119" />
      <text x="420" y="98" className="board-print" stroke="none" fill="#1f2328">
        1kΩ
      </text>
      {/* NPN: base bar, collector up, emitter arrow down */}
      <path d="M341 250H370M370 228V272M370 238L405 216M370 262L405 284" />
      <path d="M396 274L405 284L392 285Z" fill="#1f2328" />
    </g>
  );
}

const TRACE = { ch1: '#f2d23c', ch2: '#3cc4e8' } as const;
function Oscilloscope({ equipment: e, circuit, result, scope, onScope, simulating }: LabProps) {
  const s = scope ?? defaultScopeSettings;
  const set = (next: ScopeSettings) => onScope?.(e.id, next);
  const traces = {
    ch1: channelTrace(e.id, 'ch1', circuit, result),
    ch2: channelTrace(e.id, 'ch2', circuit, result),
  };
  const screen = { x: 22, y: 58, w: 320, h: 256 };
  const div = { x: screen.w / DIVISIONS.x, y: screen.h / DIVISIONS.y };
  const span = s.secondsPerDiv * DIVISIONS.x;
  const trig = traces[s.trigger.source];
  const trigValues = coupled(trig.values, s[s.trigger.source].coupling);
  const { start, triggered } = triggerStart(trig.time, trigValues, s.trigger.level, span);
  const path = (ch: 'ch1' | 'ch2') => {
    const t = traces[ch];
    const values = coupled(t.values, s[ch].coupling);
    const points: string[] = [];
    const stride = Math.max(1, Math.floor(t.time.length / 900));
    for (let i = 0; i < t.time.length; i += stride) {
      const dt = t.time[i] - start;
      if (dt < -1e-9 || dt > span + 1e-9) continue;
      const x = screen.x + (dt / s.secondsPerDiv) * div.x;
      const y = screen.y + screen.h / 2 - (values[i] / s[ch].voltsPerDiv + s[ch].position) * div.y;
      points.push(
        `${x.toFixed(1)},${Math.max(screen.y - 4, Math.min(screen.y + screen.h + 4, y)).toFixed(1)}`,
      );
    }
    return points.length ? `M${points.join('L')}` : '';
  };
  const step = <T,>(list: T[], value: T, delta: number) =>
    list[Math.max(0, Math.min(list.length - 1, list.indexOf(value) + delta))];
  // AUTO acts on the live signal: pressed while a simulation runs, it applies to the result.
  const [autoArmed, setAutoArmed] = useState(false);
  useEffect(() => {
    if (!autoArmed || simulating) return;
    setAutoArmed(false);
    set(autoset(s, traces));
  }, [autoArmed, simulating]);
  const selected = s.selected ?? 'ch1';
  const ch = s[selected];
  const button = (
    x: number,
    y: number,
    label: string,
    action: () => void,
    active = false,
    wide = 50,
  ) => (
    <g
      transform={`translate(${x} ${y})`}
      {...press(action, `Scope ${label}`)}
      className="scope-button"
    >
      <rect
        width={wide}
        height="20"
        rx="3"
        fill={active ? '#dfe7d0' : '#fbfaf6'}
        stroke="#8e8b80"
      />
      <text x={wide / 2} y="13.5" textAnchor="middle" className="scope-print">
        {label}
      </text>
    </g>
  );
  const stepper = (x: number, y: number, label: string, down: () => void, up: () => void) => (
    <g transform={`translate(${x} ${y})`}>
      <text y="-20" textAnchor="middle" className="scope-print small">
        {label}
      </text>
      <circle r="15" fill="#f7f6f1" stroke="#a9a69a" strokeWidth="2" />
      <circle r="9" fill="#ebe9e1" />
      <g {...press(down, `${label} down`)}>
        <circle cx="-24" r="8" fill="#e2e0d8" stroke="#a9a69a" />
        <text x="-24" y="3.5" textAnchor="middle" className="scope-print">
          −
        </text>
      </g>
      <g {...press(up, `${label} up`)}>
        <circle cx="24" r="8" fill="#e2e0d8" stroke="#a9a69a" />
        <text x="24" y="3.5" textAnchor="middle" className="scope-print">
          +
        </text>
      </g>
    </g>
  );
  const measures = (['ch1', 'ch2'] as const)
    .filter((c) => s[c].on && traces[c].connected)
    .map((c) => ({
      c,
      m: measureChannel(traces[c].time, coupled(traces[c].values, s[c].coupling)),
    }));
  const phase =
    s.measure && s.ch1.on && s.ch2.on && traces.ch1.connected && traces.ch2.connected
      ? phaseBetween(
          traces.ch1.time,
          coupled(traces.ch1.values, 'AC'),
          coupled(traces.ch2.values, 'AC'),
        )
      : null;
  const unreferenced = (['ch1', 'ch2'] as const).filter(
    (c) => s[c].on && traces[c].connected && !traces[c].referenced,
  );
  return (
    <g>
      <rect x="10" y="10" width="560" height="26" rx="4" fill="#f3e7b8" />
      <rect x="18" y="14" width="56" height="18" fill="#d8262c" />
      <text x="46" y="27.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff">
        UNI-T
      </text>
      <text x="84" y="28" fontSize="12" fontStyle="italic" fill="#3a3a36">
        UTD2052CL
      </text>
      <text x="170" y="28" fontSize="9" fill="#3a3a36">
        50MHz 500MS/s · DIGITAL STORAGE OSCILLOSCOPE
      </text>
      <rect x="14" y="48" width="336" height="276" rx="6" fill="#dcd9cf" />
      <g aria-label="Oscilloscope screen" data-testid={`${e.id}-screen`}>
        <rect x={screen.x} y={screen.y} width={screen.w} height={screen.h} fill="#0d1419" />
        <clipPath id={`${e.id}-clip`}>
          <rect x={screen.x} y={screen.y} width={screen.w} height={screen.h} />
        </clipPath>
        {Array.from({ length: DIVISIONS.x + 1 }, (_, i) => (
          <path
            key={`x${i}`}
            d={`M${screen.x + i * div.x} ${screen.y}V${screen.y + screen.h}`}
            stroke="#2b3a44"
            strokeDasharray={i % 5 ? '1 3' : undefined}
          />
        ))}
        {Array.from({ length: DIVISIONS.y + 1 }, (_, i) => (
          <path
            key={`y${i}`}
            d={`M${screen.x} ${screen.y + i * div.y}H${screen.x + screen.w}`}
            stroke="#2b3a44"
            strokeDasharray={i % 4 ? '1 3' : undefined}
          />
        ))}
        <g clipPath={`url(#${e.id}-clip)`}>
          {(['ch1', 'ch2'] as const).map(
            (c) =>
              s[c].on && (
                <g key={c}>
                  <path
                    d={`M${screen.x} ${screen.y + screen.h / 2 - s[c].position * div.y}h8`}
                    stroke={TRACE[c]}
                    strokeWidth="2"
                  />
                  {traces[c].connected && (
                    <path
                      d={path(c)}
                      fill="none"
                      stroke={TRACE[c]}
                      strokeWidth="1.4"
                      data-testid={`${e.id}-${c}-trace`}
                    />
                  )}
                </g>
              ),
          )}
        </g>
        <text x={screen.x + 4} y={screen.y + 11} className="scope-screen" fill="#9fb3bf">
          {s.running ? (triggered ? 'Trig’d' : 'Auto') : 'STOP'}
          {simulating ? ' · computing' : ''}
        </text>
        <text
          x={screen.x + screen.w - 4}
          y={screen.y + 11}
          textAnchor="end"
          className="scope-screen"
          fill="#9fb3bf"
        >
          M {formatTime(s.secondsPerDiv)} {s.trigger.source.toUpperCase()} ↑{' '}
          {formatVolts(s.trigger.level)}
        </text>
        {(['ch1', 'ch2'] as const).map(
          (c, i) =>
            s[c].on && (
              <text
                key={c}
                x={screen.x + 4 + i * 110}
                y={screen.y + screen.h - 5}
                className="scope-screen"
                fill={TRACE[c]}
              >
                {c.toUpperCase()}{' '}
                {s[c].coupling === 'DC' ? '⎓' : s[c].coupling === 'AC' ? '~' : '⏚'}{' '}
                {formatVolts(s[c].voltsPerDiv)}
              </text>
            ),
        )}
        {s.measure &&
          measures.map(({ c, m }, i) => (
            <text
              key={c}
              x={screen.x + 4}
              y={screen.y + 26 + i * 12}
              className="scope-screen"
              fill={TRACE[c]}
              data-testid={`${e.id}-${c}-measure`}
            >
              Vpp={formatVolts(m.vpp)} Mean={formatVolts(m.mean)} RMS={formatVolts(m.rms)}
              {m.frequency ? ` F=${m.frequency.toFixed(1)}Hz` : ''}
            </text>
          ))}
        {phase && (
          <text
            x={screen.x + 4}
            y={screen.y + 26 + measures.length * 12}
            className="scope-screen"
            fill="#e6e6e6"
            data-testid={`${e.id}-phase`}
          >
            CH2 vs CH1: φ={phase.degrees >= 0 ? '+' : ''}
            {phase.degrees.toFixed(1)}° Δt={formatTime(Math.abs(phase.delaySeconds))}
          </text>
        )}
        {unreferenced.length > 0 && (
          <text
            x={screen.x + screen.w / 2}
            y={screen.y + screen.h - 22}
            textAnchor="middle"
            className="scope-screen"
            fill="#f39b7f"
          >
            Probe ground is not connected to this circuit
          </text>
        )}
      </g>
      {/* Soft key F1 cycles the selected channel's coupling, as in the CH menu */}
      {button(
        356,
        70,
        `F1 ${ch.coupling}`,
        () =>
          set({
            ...s,
            [selected]: {
              ...ch,
              coupling: ch.coupling === 'DC' ? 'AC' : ch.coupling === 'AC' ? 'GND' : 'DC',
            },
          }),
        false,
        44,
      )}
      {button(410, 50, 'MEASURE', () => set({ ...s, measure: !s.measure }), s.measure, 58)}
      {button(
        474,
        50,
        'AUTO',
        () => (simulating ? setAutoArmed(true) : set(autoset(s, traces))),
        autoArmed,
        42,
      )}
      {button(
        522,
        50,
        s.running ? 'RUN' : 'STOP',
        () => set({ ...s, running: !s.running }),
        !s.running,
        42,
      )}
      {(['ch1', 'ch2'] as const).map((c, i) =>
        button(
          410 + i * 60,
          84,
          c.toUpperCase(),
          () =>
            set(
              selected === c && s[c].on
                ? { ...s, [c]: { ...s[c], on: false } }
                : { ...s, selected: c, [c]: { ...s[c], on: true } },
            ),
          selected === c && s[c].on,
          52,
        ),
      )}
      {stepper(
        440,
        150,
        `${selected.toUpperCase()} VOLTS/DIV`,
        () =>
          set({
            ...s,
            [selected]: { ...ch, voltsPerDiv: step(VOLTS_PER_DIV, ch.voltsPerDiv, -1) },
          }),
        () =>
          set({ ...s, [selected]: { ...ch, voltsPerDiv: step(VOLTS_PER_DIV, ch.voltsPerDiv, 1) } }),
      )}
      {stepper(
        530,
        150,
        'SEC/DIV',
        () => set({ ...s, secondsPerDiv: step(SECONDS_PER_DIV, s.secondsPerDiv, -1) }),
        () => set({ ...s, secondsPerDiv: step(SECONDS_PER_DIV, s.secondsPerDiv, 1) }),
      )}
      {stepper(
        440,
        222,
        'POSITION',
        () => set({ ...s, [selected]: { ...ch, position: Math.max(-4, ch.position - 0.5) } }),
        () => set({ ...s, [selected]: { ...ch, position: Math.min(4, ch.position + 0.5) } }),
      )}
      {stepper(
        530,
        222,
        'TRIG LEVEL',
        () =>
          set({
            ...s,
            trigger: { ...s.trigger, level: s.trigger.level - s[s.trigger.source].voltsPerDiv / 2 },
          }),
        () =>
          set({
            ...s,
            trigger: { ...s.trigger, level: s.trigger.level + s[s.trigger.source].voltsPerDiv / 2 },
          }),
      )}
      {/* BNC inputs with banana adapters */}
      {[
        { x: 400, label: 'CH1  X' },
        { x: 500, label: 'CH2  Y' },
      ].map((bnc) => (
        <g key={bnc.x}>
          <text x={bnc.x} y="280" textAnchor="middle" className="scope-print">
            {bnc.label}
          </text>
          <rect
            x={bnc.x - 36}
            y="296"
            width="72"
            height="44"
            rx="10"
            fill="#5b1f22"
            opacity=".85"
          />
          <circle
            cx={bnc.x}
            cy="318"
            r="30"
            fill="none"
            stroke="#b9b7ad"
            strokeWidth="2"
            opacity=".6"
          />
        </g>
      ))}
      <text x="485" y="262" textAnchor="middle" className="scope-print small">
        1MΩ ≈ 24pF · 400Vpk CAT II · grounds earthed
      </text>
    </g>
  );
}

export const isLabKind = (kind: string) =>
  [
    'bench-panel',
    'rectifier-board',
    'transistor-board',
    'oscilloscope',
    'function-generator',
    'decade-box',
    'mains-supply',
    'wattmeter',
    'pf-meter',
    'ac-ammeter',
    'ac-voltmeter',
    'load',
    'dc-machine',
    'lamp',
    'variac',
  ].includes(kind);

const formatHz = (f: number) =>
  f >= 1000 ? `${+(f / 1000).toPrecision(4)} kHz` : `${+f.toPrecision(4)} Hz`;
function FunctionGenerator({ equipment: e, bench, onPower, onValue }: LabProps) {
  const source = equipmentComponents(bench, e).find((c) => c.kind === 'ac-source');
  if (source?.kind !== 'ac-source') return null;
  const vpp = source.rmsVolts * 2 * Math.SQRT2;
  const limits = definitionOf(e).limits;
  const setFrequency = (f: number) =>
    onValue(
      source.id,
      'frequencyHz',
      Math.max(limits.frequencyHz![0], Math.min(limits.frequencyHz![1], f)),
    );
  return (
    <g>
      <text x="22" y="28" fontSize="12" fontWeight="700" fill="#fff" letterSpacing="1">
        FUNCTION GENERATOR
      </text>
      <text x="398" y="28" textAnchor="end" fontSize="9" fill="#cfe0f2">
        SINE · 50 Ω OUT
      </text>
      <rect x="22" y="48" width="220" height="62" rx="4" fill="#1f2a22" />
      <text x="34" y="66" className="scope-screen" fill="#8fe39b">
        ∿ SINE {source.enabled ? '· OUTPUT ON' : '· OUTPUT OFF'}
      </text>
      <text
        x="232"
        y="90"
        textAnchor="end"
        className="digital"
        fontSize="22"
        fill="#b9f5c1"
        data-testid={`${e.id}-frequency`}
      >
        {formatHz(source.frequencyHz)}
      </text>
      <text
        x="232"
        y="104"
        textAnchor="end"
        className="scope-screen"
        fill="#8fe39b"
        data-testid={`${e.id}-amplitude`}
      >
        {vpp.toFixed(2)} Vpp (open circuit)
      </text>
      <text x="262" y="60" className="scope-print">
        FREQUENCY (Hz)
      </text>
      <DeviceValue
        x={258}
        y={64}
        width={140}
        label="Generator frequency"
        value={+source.frequencyHz.toPrecision(6)}
        unit="Hz"
        min={limits.frequencyHz![0]}
        max={limits.frequencyHz![1]}
        onChange={setFrequency}
      />
      <g {...press(() => setFrequency(source.frequencyHz / 10), 'Frequency ÷10')}>
        <rect x="258" y="102" width="66" height="18" rx="3" fill="#fbfaf6" stroke="#8e8b80" />
        <text x="291" y="115" textAnchor="middle" className="scope-print">
          RANGE ÷10
        </text>
      </g>
      <g {...press(() => setFrequency(source.frequencyHz * 10), 'Frequency ×10')}>
        <rect x="332" y="102" width="66" height="18" rx="3" fill="#fbfaf6" stroke="#8e8b80" />
        <text x="365" y="115" textAnchor="middle" className="scope-print">
          RANGE ×10
        </text>
      </g>
      <text x="26" y="136" className="scope-print">
        AMPLITUDE (Vpp)
      </text>
      <DeviceValue
        x={22}
        y={140}
        width={120}
        label="Generator amplitude"
        value={+vpp.toFixed(3)}
        unit="Vpp"
        min={0}
        max={10}
        onChange={(v) => onValue(source.id, 'rmsVolts', v / (2 * Math.SQRT2))}
      />
      <g
        {...press(
          () => onPower(e.id),
          source.enabled ? 'Generator output off' : 'Generator output on',
        )}
        className="power-switch"
      >
        <rect
          x="170"
          y="142"
          width="80"
          height="30"
          rx="5"
          fill={source.enabled ? '#2f7a4a' : '#d5d8d2'}
          stroke="#7e847b"
        />
        <circle cx="186" cy="157" r="5" fill={source.enabled ? '#9dff9d' : '#58605a'} />
        <text
          x="220"
          y="161"
          textAnchor="middle"
          className="scope-print"
          fill={source.enabled ? '#fff' : '#3a3a36'}
        >
          OUTPUT
        </text>
      </g>
      <rect x="300" y="160" width="106" height="52" rx="10" fill="#5b1f22" opacity=".85" />
    </g>
  );
}

const formatValue = (value: number, unit: string) => {
  if (unit === 'Ω')
    return value >= 1000 ? `${+(value / 1000).toPrecision(5)} kΩ` : `${+value.toPrecision(5)} Ω`;
  if (unit === 'H') return `${+(value * 1000).toPrecision(4)} mH`;
  return value >= 1e-6
    ? `${+(value * 1e6).toPrecision(4)} µF`
    : `${+(value * 1e9).toPrecision(4)} nF`;
};
function DecadeBox({ equipment: e, bench, onValue }: LabProps) {
  const dials = decadeDials[e.definitionId];
  const part = equipmentComponents(bench, e)[0];
  if (!dials || !part) return null;
  const value = (part as unknown as Record<string, number>)[dials.field] ?? 0;
  // Digits are read back from the value; the epsilon absorbs floating-point steps (0.5e-6 / 1e-7).
  const digits = dials.steps.map((step) => Math.floor(value / step + 1e-6) % 10);
  const total = (next: number[]) => next.reduce((sum, d, i) => sum + d * dials.steps[i], 0);
  const set = (i: number, digit: number) => {
    const next = [...digits];
    next[i] = (digit + 10) % 10;
    onValue(part.id, dials.field, +total(next).toPrecision(8));
  };
  const spacing = 320 / dials.steps.length;
  return (
    <g>
      <text x="22" y="30" fontSize="11" fontWeight="700" fill="#2c3338" letterSpacing="1">
        {definitionOf(e).name.toUpperCase()}
      </text>
      <text
        x="378"
        y="30"
        textAnchor="end"
        className="digital"
        fontSize="14"
        fill="#1f2a30"
        data-testid={`${e.id}-value`}
      >
        {formatValue(value, dials.unit)}
      </text>
      {dials.steps.map((_, i) => {
        const x = 40 + spacing / 2 + i * spacing;
        return (
          <g key={i} transform={`translate(${x} 82)`}>
            <circle r="24" fill="#e7e9ea" stroke="#8b9296" />
            {Array.from({ length: 10 }, (_, d) => {
              const a = ((-90 + d * 36) * Math.PI) / 180;
              return (
                <text
                  key={d}
                  x={Math.cos(a) * 32}
                  y={Math.sin(a) * 32 + 3}
                  textAnchor="middle"
                  fontSize="7"
                  fill="#394146"
                >
                  {d}
                </text>
              );
            })}
            <g
              {...press(() => set(i, digits[i] + 1), `${dials.labels[i]} dial`)}
              aria-valuenow={digits[i]}
            >
              <circle r="17" fill="#23282b" />
              <path
                d="M0 0V-15"
                stroke="#f3f3f0"
                strokeWidth="3"
                strokeLinecap="round"
                transform={`rotate(${digits[i] * 36})`}
              />
            </g>
            <g {...press(() => set(i, digits[i] - 1), `${dials.labels[i]} down`)}>
              <circle cx="-16" cy="42" r="8" fill="#e2e0d8" stroke="#8b9296" />
              <text x="-16" y="45.5" textAnchor="middle" className="scope-print">
                −
              </text>
            </g>
            <g {...press(() => set(i, digits[i] + 1), `${dials.labels[i]} up`)}>
              <circle cx="16" cy="42" r="8" fill="#e2e0d8" stroke="#8b9296" />
              <text x="16" y="45.5" textAnchor="middle" className="scope-print">
                +
              </text>
            </g>
            <text y="66" textAnchor="middle" fontSize="8" fill="#394146">
              {dials.labels[i]}
            </text>
          </g>
        );
      })}
    </g>
  );
}
