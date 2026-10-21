import type { PointerEvent } from 'react';
import type {
  Component,
  ElectricalCircuit,
  Equipment,
  SimulationResult,
  Workbench,
} from '../../domain/models';
import { definitionOf, equipmentComponents } from '../../equipment/registry';
import {
  meterAngle,
  meterDisplay,
  meterRanges,
  type MeterSettings,
} from '../../instruments/multimeter';
import { DeviceValue, ValueKnob } from './DeviceControls';
import { isLabKind, LabEquipmentBody } from './LabEquipment';
import type { ScopeSettings } from '../../instruments/oscilloscope';

export type { ValueField } from '../../domain/models';
import type { ValueField } from '../../domain/models';
interface Props {
  equipment: Equipment;
  bench: Workbench;
  circuit: ElectricalCircuit;
  result: SimulationResult;
  selected: boolean;
  onDrag(event: PointerEvent<SVGGElement>, equipment: Equipment): void;
  onSelect(id: string): void;
  onPower(supplyId: string): void;
  onValue(componentId: string, field: ValueField, value: number): void;
  onMeter(meterId: string, change: Partial<MeterSettings>): void;
  simulating?: boolean;
  scope?: ScopeSettings;
  onScope?(scopeId: string, settings: ScopeSettings): void;
}
function Screw({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="3.5" fill="#aeb6bd" stroke="#939ca3" />
      <path d="M-2 0H2" stroke="#687680" />
    </g>
  );
}
const pressable = (action: () => void) => ({
  role: 'button',
  tabIndex: 0,
  onPointerDown: (e: PointerEvent) => e.stopPropagation(),
  onClick: action,
  onKeyDown: (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  },
});
export const formatOhms = (ohms: number) =>
  ohms >= 1e6
    ? `${+(ohms / 1e6).toPrecision(4)} MΩ`
    : ohms >= 1e3
      ? `${+(ohms / 1e3).toPrecision(4)} kΩ`
      : `${+ohms.toPrecision(4)} Ω`;

export function EquipmentBody(props: Props) {
  const { equipment: e, selected, onDrag, onSelect } = props;
  const definition = definitionOf(e);
  const { width: w, height: h } = definition.size;
  const isMeter = definition.kind === 'multimeter';
  if (isLabKind(definition.kind)) return <LabEquipmentBody {...props} />;
  return (
    <g transform={`translate(${e.position.x} ${e.position.y})`} data-equipment={e.id}>
      <rect x="5" y="10" width={w} height={h} rx={isMeter ? 28 : 12} fill="#1b2938" opacity=".13" />
      {selected && (
        <rect
          x="-8"
          y="-8"
          width={w + 16}
          height={h + 16}
          rx={isMeter ? 31 : 16}
          fill="none"
          stroke="#5c83ad"
          strokeWidth="1.5"
          strokeDasharray="5 4"
        />
      )}
      {isMeter ? (
        <>
          <path
            d="M25 0 Q135 -7 245 0 Q267 4 270 32 L270 427 Q268 456 244 465 Q135 480 26 465 Q3 460 0 433 L0 32 Q2 5 25 0Z"
            fill="url(#meter-case)"
            stroke="#c99536"
            strokeWidth="2"
          />
          <path
            d="M26 16 Q135 9 244 16 L251 426 Q250 439 237 443 Q135 454 34 443 Q19 439 19 425 L19 32 Q20 18 26 16Z"
            fill="#34383b"
            stroke="#24292c"
            strokeWidth="2"
          />
          <path d="M8 70V390M262 70V390" stroke="#e7aa36" strokeWidth="4" strokeLinecap="round" />
        </>
      ) : (
        <>
          <rect x="15" y={h - 4} width="48" height="13" rx="3" fill="#48535d" />
          <rect x={w - 63} y={h - 4} width="48" height="13" rx="3" fill="#48535d" />
          <rect width={w} height={h} rx="10" fill="url(#case)" stroke="#adb7c0" strokeWidth="1.5" />
          <rect x="7" y="7" width={w - 14} height={h - 14} rx="6" fill="#e9edf0" stroke="#cbd2d8" />
          <Screw x={17} y={h - 17} />
          <Screw x={w - 17} y={h - 17} />
        </>
      )}
      <g
        className="equipment-handle"
        role="button"
        aria-label={`Move ${e.label ? `${e.label} ` : ''}${definition.name}`}
        tabIndex={0}
        onPointerDown={(event) => onDrag(event, e)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSelect(e.id);
        }}
      >
        <rect
          x="8"
          y="8"
          width={w - 16}
          height={isMeter ? 24 : 43}
          rx="4"
          fill={isMeter ? 'transparent' : '#dce2e6'}
        />
        {isMeter ? (
          <path d="M119 22H151" stroke="#687077" strokeWidth="2" strokeLinecap="round" />
        ) : (
          <>
            <text x="22" y="34" className="equipment-title">
              {definition.name.toUpperCase()}
            </text>
            <path d={`M${w - 30} 24h10m-10 5h10m-10 5h10`} stroke="#8393a0" strokeWidth="1.5" />
          </>
        )}
      </g>
      {definition.kind === 'dc-supply' && <SupplyPanel {...props} />}
      {definition.kind === 'resistor' && <ResistorPanel {...props} />}
      {isMeter && <MeterPanel {...props} />}
    </g>
  );
}

function SupplyPanel({ equipment: e, bench, circuit, result, onPower, onValue }: Props) {
  const source = equipmentComponents(bench, e).find(
    (c): c is Extract<Component, { kind: 'dc-source' }> => c.kind === 'dc-source',
  );
  if (!source) return null;
  const limits = definitionOf(e).limits;
  const powered = source.enabled;
  const mode = result.sourceModes[source.id] ?? (powered ? undefined : 'off');
  const solved = powered && mode !== undefined && mode !== 'off';
  const v = (t: string) => result.nodeVoltages[circuit.terminalToNode[t]];
  const output = solved ? (v(source.positive) ?? 0) - (v(source.negative) ?? 0) : 0;
  const amps = solved ? -(result.componentCurrents[source.id] ?? 0) : 0;
  const status = !powered ? 'OFF' : !solved ? 'ERR' : mode;
  const limit = source.currentLimitAmps ?? 1;
  return (
    <>
      <rect
        x="22"
        y="65"
        width="246"
        height="98"
        rx="5"
        fill="#202d38"
        stroke="#14202a"
        strokeWidth="3"
      />
      <text x="36" y="84" className="screen-label" fill="#a0bacb">
        {powered ? 'OUTPUT' : 'SET'}
      </text>
      <g
        transform="translate(176 76)"
        aria-label={`Supply mode ${status}`}
        data-testid={`${e.id}-mode`}
      >
        <rect width="28" height="13" rx="2" fill={status === 'CV' ? '#3f8f6a' : '#2b3945'} />
        <text
          x="14"
          y="10"
          textAnchor="middle"
          className="screen-label"
          fill={status === 'CV' ? '#e5fff1' : '#6f8594'}
        >
          CV
        </text>
        <rect x="33" width="28" height="13" rx="2" fill={status === 'CC' ? '#c2543f' : '#2b3945'} />
        <text
          x="47"
          y="10"
          textAnchor="middle"
          className="screen-label"
          fill={status === 'CC' ? '#fff0ea' : '#6f8594'}
        >
          CC
        </text>
      </g>
      <text
        x="224"
        y="120"
        className="digital source-digits"
        textAnchor="end"
        data-testid={`${e.id}-volts`}
      >
        {status === 'ERR' ? '— —' : (powered ? output : source.voltageVolts).toFixed(2)}
      </text>
      <text x="237" y="120" className="screen-unit" fill="#b1d0e5">
        V
      </text>
      <text
        x="222"
        y="148"
        className="digital current-digits"
        textAnchor="end"
        data-testid={`${e.id}-amps`}
      >
        {status === 'ERR' ? '— — —' : (powered ? Math.abs(amps) : limit).toFixed(3)}
      </text>
      <text x="235" y="148" className="screen-label" fill="#b1d0e5">
        A
      </text>
      <DeviceValue
        x={23}
        y={176}
        width={118}
        label="Source voltage"
        value={source.voltageVolts}
        unit="V"
        min={limits.voltageVolts![0]}
        max={limits.voltageVolts![1]}
        onChange={(value) => onValue(source.id, 'voltageVolts', value)}
      />
      <DeviceValue
        x={149}
        y={176}
        width={118}
        label="Current limit"
        value={limit}
        unit="A"
        min={limits.currentLimitAmps![0]}
        max={limits.currentLimitAmps![1]}
        onChange={(value) => onValue(source.id, 'currentLimitAmps', value)}
      />
      <g
        {...pressable(() => onPower(e.id))}
        aria-label={powered ? 'Turn supply off' : 'Turn supply on'}
        className="power-switch"
      >
        <rect
          x="29"
          y="224"
          width="47"
          height="27"
          rx="4"
          fill={powered ? '#477295' : '#b8c2ca'}
          stroke="#8a9baa"
        />
        <path
          d="M52 229v8m-5-5a7 7 0 1 0 10 0"
          fill="none"
          stroke={powered ? '#edf3fa' : '#4b5e6e'}
          strokeWidth="1.8"
        />
      </g>
      <text x="52" y="263" className="panel-label" textAnchor="middle">
        OUTPUT
      </text>
      <ValueKnob
        x={175}
        y={226}
        small
        label="Voltage knob"
        value={source.voltageVolts}
        min={limits.voltageVolts![0]}
        max={limits.voltageVolts![1]}
        step={0.5}
        onChange={(value) => onValue(source.id, 'voltageVolts', value)}
      />
      <ValueKnob
        x={243}
        y={226}
        small
        label="Current limit knob"
        value={limit}
        min={limits.currentLimitAmps![0]}
        max={limits.currentLimitAmps![1]}
        step={0.05}
        onChange={(value) => onValue(source.id, 'currentLimitAmps', value)}
      />
      <text x="175" y="259" className="panel-label" textAnchor="middle">
        VOLTAGE
      </text>
      <text x="243" y="259" className="panel-label" textAnchor="middle">
        CURRENT
      </text>
      <text x="145" y="318" className="panel-footnote" textAnchor="middle">
        DC POWER SUPPLY · 0–60 V · 0–5 A
      </text>
    </>
  );
}

function ResistorPanel({ equipment: e, bench, result, onValue }: Props) {
  const definition = definitionOf(e);
  const resistor = equipmentComponents(bench, e).find(
    (c): c is Extract<Component, { kind: 'resistor' }> => c.kind === 'resistor',
  );
  if (!resistor) return null;
  const limits = definition.limits.resistanceOhms!;
  const hot = Math.abs(result.componentCurrents[resistor.id] ?? 0) > 1e-9;
  return (
    <>
      {e.label && (
        <g transform="translate(182 65)">
          <rect x="-22" y="-12" width="44" height="22" rx="5" fill="#34495d" />
          <text y="4" textAnchor="middle" className="module-label">
            {e.label}
          </text>
        </g>
      )}
      {definition.concealValues ? (
        <g transform="translate(44 64)">
          <rect width="104" height="30" rx="5" fill="#f7f9fa" stroke="#c4ccd3" />
          <text x="52" y="20" textAnchor="middle" className="concealed-value">
            ? Ω
          </text>
        </g>
      ) : (
        <DeviceValue
          x={30}
          y={64}
          width={122}
          label={`${e.label ?? 'Load'} resistance`}
          value={resistor.resistanceOhms}
          unit="Ω"
          min={limits[0]}
          max={limits[1]}
          onChange={(value) => onValue(resistor.id, 'resistanceOhms', value)}
        />
      )}
      {definition.concealValues ? (
        <g transform="translate(112 142)">
          <rect x="-42" y="-13" width="84" height="26" rx="4" fill="#d9c6a1" stroke="#a8916a" />
          {[-24, -12, 2, 20].map((x, i) => (
            <rect
              key={x}
              x={x}
              y="-13"
              width="6"
              height="26"
              fill={['#e0c341', '#7a4ec2', '#c53b32', '#c9a45a'][i]}
            />
          ))}
        </g>
      ) : (
        <ValueKnob
          x={112}
          y={142}
          label={`${e.label ?? 'Load'} resistance knob`}
          value={resistor.resistanceOhms}
          min={limits[0]}
          max={limits[1]}
          step={100}
          onChange={(value) => onValue(resistor.id, 'resistanceOhms', value)}
        />
      )}
      {!definition.concealValues && (
        <path
          d="M60 149a55 55 0 0 1 104 0"
          stroke="#9eabb7"
          fill="none"
          strokeDasharray="1 6"
          strokeWidth="4"
        />
      )}
      <circle cx="112" cy="188" r="4" fill={hot ? '#e0a53a' : '#c3cbd2'} stroke="#8e9aa4">
        <title>{hot ? 'Current flowing' : 'No current'}</title>
      </circle>
      <text x="112" y="226" className="panel-footnote" textAnchor="middle">
        {definition.concealValues ? 'UNKNOWN RESISTOR · MEASURE ME' : 'ADJUSTABLE RESISTIVE LOAD'}
      </text>
    </>
  );
}

function MeterPanel({ equipment: e, bench, result, onMeter }: Props) {
  const settings = bench.instrumentSettings[e.id];
  const meter = meterDisplay(e.id, settings, result);
  const occupied = (socket: string) =>
    bench.plugs.some(
      (p) => p.attachedTo.kind === 'terminal' && p.attachedTo.terminalId === `${e.id}.${socket}`,
    );
  const currentSocketHint =
    meter.settings.powered &&
    meter.range.mode === 'dc-current' &&
    (occupied('V') || occupied('mA') || occupied('20A') || occupied('COM')) &&
    (!occupied('COM') || !occupied(meter.range.jack!))
      ? `Use ${meter.range.jack} + COM in series · check leads`
      : null;
  const meterIndex = meterRanges.findIndex((r) => r.id === meter.settings.rangeId);
  const change = (next: Partial<MeterSettings>) => onMeter(e.id, next);
  return (
    <>
      <rect
        x="32"
        y="35"
        width="206"
        height="103"
        rx="4"
        fill="#1e2529"
        stroke="#51575b"
        strokeWidth="2"
      />
      <rect
        x="40"
        y="43"
        width="190"
        height="75"
        rx="3"
        fill="#aebc9a"
        stroke="#76856b"
        strokeWidth="2"
      />
      <text x="216" y="61" textAnchor="end" className="screen-label" fill="#41513c">
        {meter.settings.powered
          ? meter.range.mode === 'dc-voltage'
            ? 'DC V'
            : meter.range.mode === 'dc-current'
              ? 'DC A'
              : meter.range.mode === 'resistance'
                ? 'Ω'
                : meter.range.mode.toUpperCase()
          : ''}
      </text>
      <text
        x={meter.text === '1' ? 58 : 216}
        y="101"
        textAnchor={meter.text === '1' ? 'start' : 'end'}
        className={`digital meter-digits ${meter.text.length > 5 ? 'compact-digits' : ''}`}
        fill="#293a24"
        data-testid="meter-reading"
      >
        {meter.text}
      </text>
      {meter.settings.powered && meter.unit && meter.text !== '1' && (
        <text
          x="218"
          y="117"
          textAnchor="end"
          fontSize="14"
          fontWeight="700"
          fill="#293a24"
          data-testid="meter-unit"
        >
          {meter.unit}
        </text>
      )}
      <text
        x="223"
        y="132"
        textAnchor="end"
        fill="#fafafa"
        fontSize="15"
        fontWeight="700"
        fontStyle="italic"
      >
        DT-9205A
      </text>
      <g
        {...pressable(() => change({ powered: !meter.settings.powered }))}
        aria-label={meter.settings.powered ? 'Turn multimeter off' : 'Turn multimeter on'}
        className="power-switch"
      >
        <ellipse
          cx="50"
          cy="156"
          rx="13"
          ry="7"
          fill={meter.settings.powered ? '#798583' : '#161e23'}
          stroke="#9aa29f"
        />
        <text x="50" y="174" textAnchor="middle" className="meter-print">
          POWER
        </text>
      </g>
      <g transform="translate(220 157)">
        {Array.from({ length: 8 }, (_, i) => (
          <circle
            key={i}
            cx={(i % 2) * 7}
            cy={Math.floor(i / 2) * 6}
            r="1.6"
            fill="#171d22"
            stroke="#767d7b"
            strokeWidth=".5"
          />
        ))}
        <text x="3" y="30" textAnchor="middle" className="meter-print">
          hFE
        </text>
      </g>
      <text x="100" y="153" textAnchor="middle" className="meter-mode">
        Ω
      </text>
      <text x="240" y="213" textAnchor="middle" className="meter-mode">
        V⎓
      </text>
      <text x="226" y="315" textAnchor="middle" className="meter-mode ac-print">
        V~
      </text>
      <text x="123" y="363" textAnchor="middle" className="meter-mode">
        F
      </text>
      <text x="34" y="308" textAnchor="middle" className="meter-mode ac-print">
        A~
      </text>
      <text x="31" y="228" textAnchor="middle" className="meter-mode">
        A⎓
      </text>
      <circle cx="135" cy="253" r="75" fill="#262c31" stroke="#141a1e" strokeWidth="2" />
      {meterRanges.map((range, index) => {
        const angle = (meterAngle(index) * Math.PI) / 180;
        const x = 135 + Math.cos(angle) * 88,
          y = 253 + Math.sin(angle) * 88;
        return (
          <g
            key={range.id}
            className="range-stop"
            {...pressable(() => change({ rangeId: range.id }))}
            aria-label={`Select ${range.title}`}
            aria-pressed={index === meterIndex}
          >
            <title>
              {range.title}
              {range.simulated ? '' : ' — not simulated yet'}
            </title>
            <circle cx={x} cy={y} r="10" fill={index === meterIndex ? '#f4c465' : 'transparent'} />
            <text
              x={x}
              y={y + 3}
              textAnchor="middle"
              className={`range-print ${range.mode.startsWith('ac') ? 'ac-print' : ''}`}
              style={index === meterIndex ? { fill: '#26313a', fontWeight: 700 } : {}}
            >
              {range.label}
            </text>
            <circle
              cx={135 + Math.cos(angle) * 77}
              cy={253 + Math.sin(angle) * 77}
              r="1.8"
              fill="#d4d7d4"
            />
          </g>
        );
      })}
      <g
        transform="translate(135 253)"
        className="meter-selector"
        role="slider"
        aria-label="Multimeter range selector"
        aria-valuemin={0}
        aria-valuemax={meterRanges.length - 1}
        aria-valuenow={meterIndex}
        aria-valuetext={meter.range.title}
        tabIndex={0}
        onPointerDown={(ev) => ev.stopPropagation()}
        onClick={() => change({ rangeId: meterRanges[(meterIndex + 1) % meterRanges.length].id })}
        onKeyDown={(ev) => {
          if (['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown'].includes(ev.key)) {
            ev.preventDefault();
            ev.stopPropagation();
            const delta = ['ArrowRight', 'ArrowUp'].includes(ev.key) ? 1 : -1;
            change({
              rangeId:
                meterRanges[(meterIndex + delta + meterRanges.length) % meterRanges.length].id,
            });
          }
        }}
      >
        <title>
          Click a range around the dial. Click the knob or use arrow keys to step through ranges.
        </title>
        <circle r="60" fill="url(#knob)" stroke="#5d656a" strokeWidth="2" />
        <circle r="49" fill="#2b3339" />
        <g transform={`rotate(${meterAngle(meterIndex)})`}>
          <path
            d="M-51 -10Q0 -20 57 -10L62 0L57 10Q0 19 -51 10Z"
            fill="#50595f"
            stroke="#161e24"
            strokeWidth="2"
          />
          <path d="M-42 -7L44 -7" stroke="#7c8589" strokeWidth="2" />
          <path d="M47 -5L58 0L47 5Z" fill="#efc777" />
        </g>
      </g>
      <text x="134" y="376" textAnchor="middle" className="meter-print">
        Cx
      </text>
      <text x="75" y="424" textAnchor="middle" className="meter-print fuse-print">
        {meter.settings.fuseBlown ? 'FUSE ✕' : 'F200mA'}
      </text>
      <text x="136" y="449" textAnchor="middle" className="meter-print">
        DIGITAL MULTIMETER
      </text>
      <path d="M43 427v9h62v-9m60 0v9h60v-9" fill="none" stroke="#969e9e" strokeWidth="1" />
      <text
        x="135"
        y="490"
        textAnchor="middle"
        className={`meter-caption ${currentSocketHint || ['unsupported', 'over-range', 'energized'].includes(meter.status) ? 'attention' : ''}`}
        data-testid="meter-caption"
      >
        {currentSocketHint ?? meter.caption}
      </text>
    </>
  );
}
