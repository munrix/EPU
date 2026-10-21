import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { Workbench } from '../../domain/models';
import { definitionOf, equipmentComponents } from '../../equipment/registry';
import {
  MG_PANEL,
  RHEOSTATS,
  sectionOhms,
  sliderPosition,
  SWITCH_CLOSED_OHMS,
  SWITCH_OPEN_OHMS,
} from '../../equipment/machineLab';
import { defaultMachineState, GENERATOR, type MachineState } from '../../machines/dcGenerator';
import { DeviceValue, ValueKnob } from './DeviceControls';
import type { LabProps } from './LabEquipment';

/** Equipment of the DC machine lab, drawn from the photos in references/machine-lab. */
export const machineLabKinds = ['mg-set', 'slide-rheostat', 'supply-console', 'load-switch'];

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
function Screw({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="4.5" fill="#c9ced1" stroke="#858d92" />
      <path d="M-2.6 0H2.6" stroke="#5f686e" strokeWidth="1.2" />
    </g>
  );
}

export function MachineLabBody({ kind, w, h }: { kind: string; w: number; h: number }) {
  if (kind === 'mg-set')
    return (
      <>
        <rect width={w} height={h} rx="8" fill="#e7e9ea" stroke="#b9c0c4" />
        <rect x="20" y="258" width={w - 40} height="26" rx="3" fill="#a9b2b8" />
      </>
    );
  if (kind === 'slide-rheostat')
    return <rect width={w} height={h} rx="6" fill="#eef0f0" stroke="#c3c8cb" />;
  if (kind === 'supply-console')
    return <rect width={w} height={h} rx="8" fill="#3f5f80" stroke="#2c4660" strokeWidth="2" />;
  return <rect width={w} height={h} rx="6" fill="#d6d9da" stroke="#9aa2a6" strokeWidth="1.5" />;
}

export function MachineLabArt(props: LabProps): ReactNode {
  const kind = definitionOf(props.equipment).kind;
  if (kind === 'mg-set') return <MgSet {...props} />;
  if (kind === 'slide-rheostat') return <SlideRheostat {...props} />;
  if (kind === 'supply-console') return <SupplyConsole {...props} />;
  if (kind === 'load-switch') return <LoadSwitch {...props} />;
  return null;
}

const machineState = (bench: Workbench, id: string): MachineState =>
  bench.machines?.[id] ?? defaultMachineState;
const setMachine =
  (id: string, change: Partial<MachineState>) =>
  (b: Workbench): Workbench => ({
    ...b,
    machines: { ...b.machines, [id]: { ...machineState(b, id), ...change } },
  });

/** Esselte Studium motor–generator set: DC machine, coupling, prime mover, terminal panel. */
function MgSet({ equipment: e, bench, result, onCommit }: LabProps) {
  const state = machineState(bench, e.id);
  const reading = result.machines?.[e.id];
  const rpm = reading?.rpm ?? 0;
  const commit = (change: Partial<MachineState>) => onCommit?.(setMachine(e.id, change));
  const P = MG_PANEL;
  // Speed meter: 0–30 (×100 r/min) over a 140° arc. In the MOTOR position the needle is driven
  // the wrong way for a generator and rests on its zero stop.
  const reads = state.meterMode === 'generator' ? Math.min(3000, rpm) : 0;
  const needle = 200 + (reads / 3000) * 140;
  const spin = rpm > 1 ? Math.max(0.12, 240 / rpm) : 0;
  const blue = '#5f86a8',
    blueDark = '#486d8e';
  return (
    <g>
      {/* DC machine (generator), cradle-mounted */}
      <g pointerEvents="none">
        <rect
          x="58"
          y="64"
          width="410"
          height="186"
          rx="34"
          fill={blue}
          stroke={blueDark}
          strokeWidth="2"
        />
        {[78, 384].map((x) => (
          <g key={x}>
            <rect x={x} y="86" width="70" height="142" rx="6" fill={blueDark} />
            {Array.from({ length: 11 }, (_, i) => (
              <path
                key={i}
                d={`M${x + 8} ${96 + i * 12}H${x + 62}`}
                stroke="#2f4a63"
                strokeWidth="3"
              />
            ))}
          </g>
        ))}
        <rect x="228" y="78" width="96" height="30" rx="2" fill="#e4e1d6" stroke="#9e9a8c" />
        <text x="276" y="97" textAnchor="middle" fontSize="11" fontWeight="800" fill="#2a2a2a">
          ASEA
        </text>
        <rect x="240" y="168" width="58" height="56" rx="4" fill={blueDark} />
        <text x="263" y="240" textAnchor="middle" className="scope-print" fill="#e8eef3">
          DC MACHINE
        </text>
        {/* Bearing pedestal and shaft */}
        <rect x="468" y="132" width="52" height="66" rx="8" fill="#3d4246" />
        <rect x="470" y="150" width="150" height="20" fill="#9ca5ab" />
      </g>
      {/* Coupling: disc and rubber elements, turning with the shaft */}
      <g transform="translate(560 160)" pointerEvents="none">
        <g>
          {spin > 0 && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0"
              to="360"
              dur={`${spin}s`}
              repeatCount="indefinite"
            />
          )}
          <circle r="40" fill="#e9ecee" stroke="#8d969c" strokeWidth="2" />
          <rect x="-6" y="-40" width="12" height="80" fill="#24292d" />
          <rect x="-40" y="-6" width="80" height="12" fill="#d96f2b" />
        </g>
        <circle r="7" fill="#5a636a" />
      </g>
      {/* Prime mover: fan-cooled motor with its terminal box on top */}
      <g pointerEvents="none">
        <rect
          x="612"
          y="74"
          width="270"
          height="176"
          rx="26"
          fill={blue}
          stroke={blueDark}
          strokeWidth="2"
        />
        {Array.from({ length: 9 }, (_, i) => (
          <path
            key={i}
            d={`M632 ${96 + i * 17}H866`}
            stroke={blueDark}
            strokeWidth="5"
            strokeLinecap="round"
          />
        ))}
        <rect
          x="870"
          y="86"
          width="72"
          height="152"
          rx="30"
          fill="#4c7397"
          stroke="#36597a"
          strokeWidth="2"
        />
        <rect x="660" y="30" width="150" height="46" rx="5" fill={blueDark} />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <circle cx={692 + i * 44} cy="44" r="7" fill="#1e2124" />
            <circle cx={692 + i * 44} cy="64" r="7" fill="#1e2124" />
          </g>
        ))}
        <text x="747" y="22" textAnchor="middle" className="scope-print">
          PRIME MOVER · supplied internally (wiring not photographed)
        </text>
      </g>

      {/* Terminal panel on the front of the bed */}
      <rect
        x={P.x}
        y={P.y}
        width={P.width}
        height={P.height}
        rx="4"
        fill="#c8cdd0"
        stroke="#949ca1"
        pointerEvents="none"
      />
      {[
        [P.x + 14, P.y + 14],
        [P.x + P.width - 14, P.y + 14],
        [P.x + 14, P.y + P.height - 14],
        [P.x + P.width - 14, P.y + P.height - 14],
        [680, P.y + 40],
        [520, P.y + P.height - 16],
      ].map(([x, y]) => (
        <Screw key={`${x}-${y}`} x={x} y={y} />
      ))}
      <g transform={`translate(${P.x + 40} ${P.y + 22})`} pointerEvents="none">
        <rect width="156" height="150" rx="4" fill="#dcd6bf" stroke="#9c9478" strokeWidth="3" />
        <rect x="8" y="8" width="140" height="134" fill="#efe9d2" />
        {Array.from({ length: 31 }, (_, i) => {
          const a = ((200 + (i / 30) * 140) * Math.PI) / 180;
          const r2 = i % 5 ? 56 : 50;
          return (
            <path
              key={i}
              d={`M${78 + Math.cos(a) * 62} ${100 + Math.sin(a) * 62}L${78 + Math.cos(a) * r2} ${100 + Math.sin(a) * r2}`}
              stroke="#2b2b2b"
              strokeWidth={i % 5 ? 0.8 : 1.4}
            />
          );
        })}
        {[0, 10, 20, 30].map((v) => {
          const a = ((200 + (v / 30) * 140) * Math.PI) / 180;
          return (
            <text
              key={v}
              x={78 + Math.cos(a) * 40}
              y={104 + Math.sin(a) * 40}
              textAnchor="middle"
              fontSize="12"
              fill="#2b2b2b"
            >
              {v}
            </text>
          );
        })}
        <text x="78" y="122" textAnchor="middle" fontSize="12" fill="#2b2b2b">
          r/min
        </text>
        <text x="78" y="134" textAnchor="middle" fontSize="8" fill="#2b2b2b">
          ×100
        </text>
        <g
          transform={`translate(78 100) rotate(${needle})`}
          style={{ transition: 'transform .6s ease-out' }}
        >
          <path d="M0 0H58" stroke="#1d1d1d" strokeWidth="2.2" strokeLinecap="round" />
        </g>
        <circle cx="78" cy="100" r="7" fill="#f2f2f2" stroke="#666" />
      </g>
      <text
        x={P.x + 118}
        y={P.y + 190}
        textAnchor="middle"
        className="scope-print"
        data-testid={`${e.id}-rpm`}
      >
        {Math.round(rpm)} rpm
      </text>
      {/* MOTOR / GENERATOR toggle */}
      <g
        transform={`translate(${P.x + 270} ${P.y + 96})`}
        {...press(
          () => commit({ meterMode: state.meterMode === 'generator' ? 'motor' : 'generator' }),
          `Speed meter switch: ${state.meterMode === 'generator' ? 'GENERATOR' : 'MOTOR'}`,
        )}
        className="power-switch"
      >
        <title>MOTOR (+) / GENERATOR (−). Sets which way the speed meter reads.</title>
        <text y="-46" textAnchor="middle" fontSize="11" fill="#2b2b2b">
          MOTOR
        </text>
        <text y="-32" textAnchor="middle" fontSize="13" fill="#2b2b2b">
          +
        </text>
        <circle r="13" fill="#d9dcde" stroke="#7c858b" strokeWidth="2" />
        <path
          d={state.meterMode === 'generator' ? 'M0 0L4 26' : 'M0 0L4 -26'}
          stroke="#e6e9eb"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <circle r="5" fill="#8a9298" />
        <text y="44" textAnchor="middle" fontSize="13" fill="#2b2b2b">
          −
        </text>
        <text y="58" textAnchor="middle" fontSize="11" fill="#2b2b2b">
          GENERATOR
        </text>
      </g>
      {/* Socket columns: raised strips, joining lines and winding symbols as printed */}
      <g pointerEvents="none">
        {[520, 620].map((x, i) => (
          <path
            key={x}
            d={`M${x - 18} ${P.y + 18 + i * 16}L${x + 18} ${P.y + 18 + i * 16}L${x + 18} ${P.y + 186}L${x - 18} ${P.y + 186}Z`}
            fill="#b2b9be"
          />
        ))}
        {(['F', 'A', 'D', 'TG'] as const).map((w, n) => {
          const y1 = P.y + 38 + n * 46 - (w === 'TG' ? 6 : 0);
          const y2 = P.y + 38 + n * 46 + (w === 'TG' ? 6 : 16);
          const mx = 570,
            my = (y1 + y2) / 2;
          return (
            <g key={w}>
              <path d={`M520 ${y1}L620 ${y2}`} stroke="#1f1f1f" strokeWidth="1.6" />
              {w === 'A' && (
                <circle cx={mx} cy={my} r="11" fill="#c8cdd0" stroke="#1f1f1f" strokeWidth="1.6" />
              )}
              {(w === 'F' || w === 'D') && (
                <rect
                  x={mx - 13}
                  y={my - 5}
                  width="26"
                  height="10"
                  fill="#1f1f1f"
                  transform={`rotate(9 ${mx} ${my})`}
                />
              )}
              {w === 'TG' && (
                <g>
                  <circle
                    cx={mx}
                    cy={my}
                    r="11"
                    fill="#c8cdd0"
                    stroke="#1f1f1f"
                    strokeWidth="1.4"
                  />
                  <text x={mx} y={my + 4} textAnchor="middle" fontSize="9" fill="#1f1f1f">
                    TG
                  </text>
                </g>
              )}
              {w !== 'TG' && (
                <>
                  <text
                    x={w === 'F' ? 520 : 498}
                    y={y1 - 20}
                    textAnchor="middle"
                    fontSize="13"
                    fill="#1f1f1f"
                  >
                    {w}1
                  </text>
                  <text
                    x={w === 'F' ? 620 : 598}
                    y={y2 - 20}
                    textAnchor="middle"
                    fontSize="13"
                    fill="#1f1f1f"
                  >
                    {w}2
                  </text>
                </>
              )}
            </g>
          );
        })}
        <text
          x="690"
          y={P.y + P.height - 30}
          fontSize="12"
          fontWeight="700"
          fill="#1f1f1f"
          letterSpacing=".5"
        >
          ⊗ ESSELTE STUDIUM
        </text>
        <text x="690" y={P.y + P.height - 17} fontSize="7" fill="#1f1f1f">
          MADE IN SWEDEN
        </text>
      </g>
      {/* Prime-mover control. The real speed control is not photographed: this is a stand-in. */}
      <g transform={`translate(${P.x + 680} ${P.y + 16})`}>
        <rect
          width="200"
          height="118"
          rx="6"
          fill="#eef1f2"
          stroke="#6f7a81"
          strokeDasharray="5 3"
        />
        <text x="10" y="16" fontSize="10" fontWeight="700" fill="#33414c">
          PRIME MOVER SPEED (stand-in)
        </text>
        <g
          {...press(() => commit({ running: true }), 'Start the prime mover')}
          className="power-switch"
        >
          <rect
            x="10"
            y="26"
            width="52"
            height="24"
            rx="4"
            fill={state.running ? '#2f7a4a' : '#22272b'}
          />
          <text x="36" y="42" textAnchor="middle" fontSize="10" fill="#fff">
            START
          </text>
        </g>
        <g
          {...press(() => commit({ running: false }), 'Stop the prime mover')}
          className="power-switch"
        >
          <rect x="10" y="56" width="52" height="24" rx="4" fill="#c2382f" />
          <text x="36" y="72" textAnchor="middle" fontSize="10" fill="#fff">
            STOP
          </text>
        </g>
        <ValueKnob
          x={94}
          y={58}
          small
          label="Prime mover speed setting (rpm)"
          value={state.speedSetRpm}
          min={0}
          max={GENERATOR.maxRpm}
          step={10}
          onChange={(v) => commit({ speedSetRpm: v })}
        />
        <DeviceValue
          x={124}
          y={44}
          width={86}
          label="Speed setting"
          value={state.speedSetRpm}
          unit="rpm"
          min={0}
          max={GENERATOR.maxRpm}
          onChange={(v) => commit({ speedSetRpm: v })}
        />
        <text x="10" y="106" fontSize="9" fill="#4c5a64">
          {state.running ? 'running' : 'stopped'} · set {state.speedSetRpm} rpm
        </text>
      </g>
    </g>
  );
}

/** Slide rheostat: perforated cover, slider on the top rail, A and B at the ends, C on the rail. */
function SlideRheostat({ equipment: e, bench, result, onCommit }: LabProps) {
  const parts = equipmentComponents(bench, e);
  const ac = parts.find((c) => c.id === `${e.id}.ac`);
  const cb = parts.find((c) => c.id === `${e.id}.cb`);
  const spec = RHEOSTATS[e.definitionId as keyof typeof RHEOSTATS];
  const [preview, setPreview] = useState<number | null>(null);
  const drag = useRef<{ toLocal: (x: number) => number } | null>(null);
  if (ac?.kind !== 'resistor' || cb?.kind !== 'resistor' || !spec) return null;
  const position = preview ?? sliderPosition(ac.resistanceOhms, cb.resistanceOhms);
  const railX = 92,
    railW = 370;
  const set = (x: number) => {
    const s = sectionOhms(spec.ohms, x);
    onCommit?.((b) => ({
      ...b,
      components: b.components.map((c) =>
        c.id === ac.id && c.kind === 'resistor'
          ? { ...c, resistanceOhms: s.ac }
          : c.id === cb.id && c.kind === 'resistor'
            ? { ...c, resistanceOhms: s.cb }
            : c,
      ),
    }));
  };
  const amps = Math.max(
    Math.abs(result.componentCurrents[ac.id] ?? 0),
    Math.abs(result.componentCurrents[cb.id] ?? 0),
  );
  const overload = amps > spec.amps;
  const sx = railX + position * railW;
  return (
    <g>
      <defs>
        <pattern id={`perf-${e.id}`} width="11" height="11" patternUnits="userSpaceOnUse">
          <circle cx="5.5" cy="5.5" r="3" fill="#3c4246" />
        </pattern>
      </defs>
      <g pointerEvents="none">
        <rect x="8" y="146" width="524" height="18" rx="3" fill="#b8bec2" stroke="#8f979c" />
        {[22, 506].map((x) => (
          <rect key={x} x={x - 10} y="150" width="22" height="9" rx="4.5" fill="#7d868c" />
        ))}
        <rect
          x="56"
          y="54"
          width="428"
          height="94"
          rx="14"
          fill="#c9ced1"
          stroke="#8f979c"
          strokeWidth="2"
        />
        <rect
          x="64"
          y="62"
          width="412"
          height="80"
          rx="10"
          fill={`url(#perf-${e.id})`}
          opacity=".75"
        />
        {overload && (
          <rect x="56" y="54" width="428" height="94" rx="14" fill="#ff5a2e" opacity=".35" />
        )}
        <rect x="10" y="66" width="48" height="82" rx="3" fill="#b3b9bd" stroke="#8f979c" />
        <rect x="482" y="66" width="48" height="82" rx="3" fill="#b3b9bd" stroke="#8f979c" />
        <rect
          x={railX - 14}
          y="38"
          width={railW + 28}
          height="10"
          rx="2"
          fill="#9aa2a7"
          stroke="#6f777c"
        />
        <rect x="196" y="88" width="148" height="30" rx="3" fill="#e9ebec" stroke="#8f979c" />
        <text x="270" y="108" textAnchor="middle" fontSize="12" fontWeight="700" fill="#2b3236">
          {spec.name.toUpperCase()}
        </text>
        <text x="270" y="172" textAnchor="middle" className="scope-print">
          {spec.ohms >= 1000 ? `${spec.ohms / 1000} kΩ` : `${spec.ohms} Ω`} · {spec.amps} A (plate
          not photographed)
        </text>
        {overload && (
          <text x="270" y="30" textAnchor="middle" fontSize="11" fontWeight="700" fill="#b8321f">
            Overloaded: {amps.toFixed(2)} A through a {spec.amps} A winding
          </text>
        )}
      </g>
      <g
        transform={`translate(${sx} 43)`}
        className="value-knob"
        role="slider"
        tabIndex={0}
        aria-label={`${spec.name} slider`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position * 100)}
        onPointerDown={(ev) => {
          if (ev.button !== 0) return;
          ev.stopPropagation();
          ev.preventDefault();
          const ctm = (ev.currentTarget.parentNode as SVGGraphicsElement).getScreenCTM();
          if (!ctm) return;
          drag.current = { toLocal: (clientX) => (clientX - ctm.e) / ctm.a };
          ev.currentTarget.setPointerCapture(ev.pointerId);
        }}
        onPointerMove={(ev) => {
          if (!drag.current) return;
          ev.stopPropagation();
          const x = (drag.current.toLocal(ev.clientX) - railX) / railW;
          setPreview(Math.min(1, Math.max(0, x)));
        }}
        onPointerUp={(ev) => {
          ev.stopPropagation();
          if (drag.current && preview !== null) set(preview);
          drag.current = null;
          setPreview(null);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setPreview(null);
        }}
        onKeyDown={(ev) => {
          const step = ev.shiftKey ? 0.1 : 0.01;
          if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') set(position + step);
          else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') set(position - step);
          else return;
          ev.preventDefault();
          ev.stopPropagation();
        }}
      >
        <title>Drag the slider along the rail (arrow keys: 1 %, with Shift: 10 %)</title>
        <rect
          x="-20"
          y="-16"
          width="40"
          height="34"
          rx="6"
          fill="#f1ede1"
          stroke="#9b9682"
          strokeWidth="1.5"
        />
        <rect x="-12" y="-8" width="24" height="12" rx="2" fill="#d9d3c1" />
        {preview !== null && (
          <g>
            <rect x="-26" y="-44" width="52" height="20" rx="4" fill="#243849" />
            <text y="-30" textAnchor="middle" fill="#fff" fontSize="12">
              {Math.round(preview * 100)} %
            </text>
          </g>
        )}
      </g>
    </g>
  );
}

/** Control and power supply console: front (meters, knob) and side panel side by side. */
function SupplyConsole({ equipment: e, bench, circuit, result, onPower, onValue }: LabProps) {
  const parts = equipmentComponents(bench, e);
  const variable = parts.find((c) => c.id === `${e.id}.var`);
  if (variable?.kind !== 'dc-source') return null;
  const on = variable.enabled;
  const v = (t: string) => result.nodeVoltages[circuit.terminalToNode[t]] ?? 0;
  const volts = on ? Math.max(0, v(variable.positive) - v(variable.negative)) : 0;
  const amps = on ? Math.max(0, -(result.componentCurrents[variable.id] ?? 0)) : 0;
  const percent = Math.round((variable.voltageVolts / 220) * 100);
  const meter = (
    x: number,
    y: number,
    w: number,
    h: number,
    value: number,
    full: number,
    unit: string,
    ticks: number[],
    face: string,
  ) => {
    const angle = -130 + Math.min(1, Math.max(0, value / full)) * 80;
    return (
      <g transform={`translate(${x} ${y})`} pointerEvents="none">
        <rect width={w} height={h} rx="3" fill="#cfd3d5" stroke="#7d868b" strokeWidth="3" />
        <rect x="7" y="7" width={w - 14} height={h - 14} fill={face} />
        {ticks.map((t) => {
          const a = ((-130 + (t / full) * 80) * Math.PI) / 180;
          return (
            <text
              key={t}
              x={w / 2 + Math.cos(a) * (h - 30)}
              y={h - 14 + Math.sin(a) * (h - 30)}
              textAnchor="middle"
              fontSize="10"
              fill="#2b2b2b"
            >
              {t}
            </text>
          );
        })}
        <text x={w - 22} y={22} fontSize="14" fontWeight="700" fill="#2b2b2b">
          {unit}
        </text>
        <text x={w - 26} y={h - 18} fontSize="9" fill="#2b2b2b">
          DC
        </text>
        <g
          transform={`translate(${w / 2} ${h - 14}) rotate(${angle})`}
          style={{ transition: 'transform .6s ease-out' }}
        >
          <path d={`M0 0H${h - 22}`} stroke="#1d1d1d" strokeWidth="2.4" strokeLinecap="round" />
        </g>
        <circle cx={w / 2} cy={h - 14} r="6" fill="#ddd" stroke="#666" />
      </g>
    );
  };
  const post = (x: number, y: number, title: string) => (
    <g key={`${x}-${y}`} transform={`translate(${x} ${y})`} opacity=".55">
      <title>{title}</title>
      <circle r="13" fill="#1b1d1f" />
      <circle r="5" fill="#000" />
    </g>
  );
  return (
    <g>
      {/* Front: sloped grey panel */}
      <rect
        x="12"
        y="12"
        width="376"
        height="446"
        rx="4"
        fill="#c5c9cb"
        stroke="#868e93"
        pointerEvents="none"
      />
      {meter(84, 40, 200, 120, volts, 250, 'V', [0, 50, 100, 150, 200, 250], '#ece4c8')}
      {meter(84, 178, 200, 120, amps, 10, 'A', [0, 2, 4, 6, 8, 10], '#f3f2ee')}
      <text
        x="300"
        y="250"
        fontSize="8"
        fill="#2b2b2b"
        transform="rotate(90 300 250)"
        pointerEvents="none"
      >
        A-METER
      </text>
      <text x="46" y="68" textAnchor="middle" className="scope-print" pointerEvents="none">
        0–220 V
      </text>
      {post(46, 214, 'Not used by the generator sheets; its function is not known yet.')}
      {post(46, 262, 'Not used by the generator sheets; its function is not known yet.')}
      <g transform="translate(200 382)">
        <circle r="62" fill="#e7e2d3" stroke="#9a957f" pointerEvents="none" />
        {Array.from({ length: 11 }, (_, i) => {
          const a = ((-225 + i * 27) * Math.PI) / 180;
          return (
            <text
              key={i}
              x={Math.cos(a) * 52}
              y={Math.sin(a) * 52 + 3}
              textAnchor="middle"
              fontSize="8"
              fill="#333"
              pointerEvents="none"
            >
              {i * 10}
            </text>
          );
        })}
        <ValueKnob
          x={0}
          y={0}
          label="Console output (0–100 % of 220 V)"
          value={percent}
          min={0}
          max={100}
          step={1}
          onChange={(p) => onValue(variable.id, 'voltageVolts', Math.round(p * 2.2 * 10) / 10)}
        />
      </g>
      <DeviceValue
        x={290}
        y={420}
        width={92}
        label="Console output voltage"
        value={variable.voltageVolts}
        unit="V"
        min={0}
        max={220}
        onChange={(x) => onValue(variable.id, 'voltageVolts', x)}
      />
      {/* Side panel, unfolded to the right of the front */}
      <rect
        x="410"
        y="12"
        width="298"
        height="446"
        rx="4"
        fill="#4d6f91"
        stroke="#2c4660"
        pointerEvents="none"
      />
      <g pointerEvents="none">
        <rect x="436" y="28" width="86" height="120" rx="8" fill="#e6dfcc" stroke="#a69f8a" />
        {[58, 112].map((y) => (
          <g key={y}>
            <circle cx="479" cy={y} r="20" fill="#d4ccb4" />
            <circle cx="471" cy={y} r="3.5" fill="#3a3a3a" />
            <circle cx="487" cy={y} r="3.5" fill="#3a3a3a" />
          </g>
        ))}
        <text x="479" y="162" textAnchor="middle" className="scope-print" fill="#e8eef3">
          220 V AC outlet
        </text>
      </g>
      <circle cx="560" cy="48" r="11" fill={'#f2c230'} stroke="#7d6a1d" pointerEvents="none">
        <title>Mains</title>
      </circle>
      <circle
        cx="560"
        cy="84"
        r="11"
        fill={on ? '#ff4a3a' : '#7a2a24'}
        stroke="#4d1a16"
        pointerEvents="none"
      >
        <title>Outputs on</title>
      </circle>
      <g
        {...press(() => on && onPower(e.id), 'STOP: switch the console outputs off')}
        className="power-switch"
      >
        <circle cx="560" cy="124" r="14" fill="#d23a2e" stroke="#7d1f18" strokeWidth="2" />
        <text x="590" y="128" fontSize="9" fill="#e8eef3">
          STOP
        </text>
      </g>
      <g
        {...press(() => !on && onPower(e.id), 'START: switch the console outputs on')}
        className="power-switch"
      >
        <rect
          x="610"
          y="34"
          width="44"
          height="40"
          rx="4"
          fill="#1f2326"
          stroke="#0e1011"
          strokeWidth="2"
        />
        <text x="632" y="90" textAnchor="middle" fontSize="9" fill="#e8eef3">
          START
        </text>
      </g>
      <g pointerEvents="none">
        <text x="492" y="222" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
          220 V
        </text>
        <text x="560" y="222" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
          110 V
        </text>
        <text x="526" y="238" textAnchor="middle" fontSize="9" fill="#dbe6ef">
          DC
        </text>
        <rect x="612" y="250" width="40" height="40" rx="4" fill="#1f2326" />
        <path d="M676 300V430" stroke="#d7dde1" strokeWidth="8" strokeLinecap="round" />
      </g>
      {[358, 406].flatMap((y) => [
        post(492, y, 'Not used by the generator sheets; its function is not known yet.'),
        post(560, y, 'Not used by the generator sheets; its function is not known yet.'),
      ])}
      {post(526, 446, 'Not used by the generator sheets; its function is not known yet.')}
    </g>
  );
}

/** "LASTBRYTARE / LOAD SWITCH 380V ~ 16A": three-pole rotary switch, 0 / I. */
function LoadSwitch({ equipment: e, bench, onCommit }: LabProps) {
  const poles = equipmentComponents(bench, e).filter((c) => c.kind === 'resistor');
  const closed = poles.some((c) => c.kind === 'resistor' && c.resistanceOhms < 1);
  const toggle = () =>
    onCommit?.((b) => ({
      ...b,
      components: b.components.map((c) =>
        e.componentIds.includes(c.id) && c.kind === 'resistor'
          ? { ...c, resistanceOhms: closed ? SWITCH_OPEN_OHMS : SWITCH_CLOSED_OHMS }
          : c,
      ),
    }));
  return (
    <g>
      <g pointerEvents="none">
        <rect x="8" y="8" width="244" height="414" rx="3" fill="#cfd3d4" stroke="#8d969b" />
        {[
          [20, 20],
          [240, 20],
          [20, 410],
          [240, 410],
        ].map(([x, y]) => (
          <Screw key={`${x}-${y}`} x={x} y={y} />
        ))}
        <text x="30" y="40" fontSize="10" fontWeight="700" fill="#2b2b2b" letterSpacing=".5">
          LASTBRYTARE
        </text>
        <text x="30" y="53" fontSize="10" fontWeight="700" fill="#2b2b2b" letterSpacing=".5">
          LOAD SWITCH
        </text>
        <text x="148" y="53" fontSize="10" fontWeight="700" fill="#2b2b2b">
          380V ~ 16A
        </text>
        <rect x="64" y="70" width="132" height="132" rx="8" fill="#e6e1cf" stroke="#a49e88" />
        <rect x="74" y="80" width="112" height="112" rx="4" fill="#1d2023" />
        <text x="130" y="98" textAnchor="middle" fontSize="11" fill="#e6e6e6">
          I
        </text>
        <text x="172" y="140" textAnchor="middle" fontSize="11" fill="#e6e6e6">
          0
        </text>
        <rect x="204" y="150" width="30" height="44" rx="2" fill="#e8c43a" />
        {['1', '3', '5'].map((n, i) => (
          <text key={n} x="22" y={242 + i * 46} fontSize="10" fill="#2b2b2b">
            {n}
          </text>
        ))}
        {['2', '4', '6'].map((n, i) => (
          <text key={n} x="226" y={308 + i * 46} fontSize="10" fill="#2b2b2b">
            {n}
          </text>
        ))}
      </g>
      <g
        transform={`translate(130 136) rotate(${closed ? -90 : 0})`}
        style={{ transition: 'transform .25s' }}
        {...press(toggle, closed ? 'Load switch to 0 (open)' : 'Load switch to I (closed)')}
        className="power-switch"
      >
        <title>Turn the switch: 0 (open) / I (closed, all three poles)</title>
        <circle r="40" fill="#2b2f33" />
        <path d="M-38 -9H38V9H-38Z" fill="#3a3f44" />
        <path d="M0 -9H38V9H0Z" fill="#c5cbd0" />
      </g>
      <text x="130" y="224" textAnchor="middle" className="scope-print" pointerEvents="none">
        {closed ? 'I · closed' : '0 · open'}
      </text>
    </g>
  );
}
