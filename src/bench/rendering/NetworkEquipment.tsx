import type { PointerEvent } from 'react';
import type {
  ElectricalCircuit,
  Equipment,
  SimulationResult,
  ValueField,
  Workbench,
} from '../../domain/models';
import { definitionOf, equipmentComponents } from '../../equipment/registry';
import { MAINS_BREAKER_AMPS } from '../../equipment/network';
import { ammeterReading, coilMeterReading, voltmeterReading } from '../../instruments/panelMeters';
import { DeviceValue } from './DeviceControls';

interface Props {
  equipment: Equipment;
  bench: Workbench;
  circuit: ElectricalCircuit;
  result: SimulationResult;
  onPower(equipmentId: string): void;
  onValue(componentId: string, field: ValueField, value: number): void;
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

export function MainsSupply({ equipment: e, bench, onPower }: Props) {
  const source = equipmentComponents(bench, e)[0];
  const on = source?.kind === 'ac-source' && source.enabled;
  return (
    <g>
      <text x="150" y="36" textAnchor="middle" className="bench-print big">
        AC OUTPUT
      </text>
      <text x="150" y="54" textAnchor="middle" className="bench-print">
        220 V ~ 50 Hz · single phase
      </text>
      {/* Lindner LMS/M 6.3 A miniature breaker, as on the bench */}
      <g
        transform="translate(95 72)"
        {...press(() => onPower(e.id), on ? 'Open the breaker' : 'Close the breaker')}
        className="power-switch"
      >
        <rect width="110" height="84" rx="4" fill="#f4f3ee" stroke="#9a9a90" />
        <rect x="14" y="10" width="30" height="18" rx="2" fill={on ? '#8b2320' : '#d0342c'} />
        <rect x="66" y="10" width="30" height="18" rx="2" fill={on ? '#111' : '#3b3b3b'} />
        <text x="10" y="44" fontSize="9" fontWeight="700" fill="#333">
          LINDNER
        </text>
        <text x="10" y="56" fontSize="9" fill="#333">
          LMS/M
        </text>
        <text x="10" y="70" fontSize="10" fontWeight="700" fill="#333">
          {MAINS_BREAKER_AMPS} A
        </text>
        <circle cx="88" cy="58" r="7" fill={on ? '#58d06a' : '#c9c9c0'} stroke="#8a8a80" />
      </g>
      <text x="150" y="178" textAnchor="middle" className="bench-print">
        {on ? 'ON · 220 V present' : 'OFF · click the breaker'}
      </text>
    </g>
  );
}

const needle = (fraction: number) => -140 + Math.max(-0.03, Math.min(1.03, fraction)) * 100;
function Dial({
  x,
  y,
  ticks,
  fraction,
  unit,
}: {
  x: number;
  y: number;
  ticks: string[];
  fraction: number;
  unit: string;
}) {
  const cx = 0,
    cy = 88,
    r = 74;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-92" y="0" width="184" height="104" rx="4" fill="#f6f4ec" stroke="#8f8c80" />
      <path
        d={`M${cx + Math.cos((-140 * Math.PI) / 180) * r} ${cy + Math.sin((-140 * Math.PI) / 180) * r} A${r} ${r} 0 0 1 ${cx + Math.cos((-40 * Math.PI) / 180) * r} ${cy + Math.sin((-40 * Math.PI) / 180) * r}`}
        fill="none"
        stroke="#222"
      />
      {ticks.map((label, i) => {
        const a = ((-140 + (i / (ticks.length - 1)) * 100) * Math.PI) / 180;
        return (
          <g key={i}>
            <path
              d={`M${Math.cos(a) * r} ${cy + Math.sin(a) * r}L${Math.cos(a) * (r - 7)} ${cy + Math.sin(a) * (r - 7)}`}
              stroke="#222"
            />
            <text
              x={Math.cos(a) * (r - 17)}
              y={cy + Math.sin(a) * (r - 17) + 3}
              textAnchor="middle"
              fontSize="8"
              fill="#222"
            >
              {label}
            </text>
          </g>
        );
      })}
      <text y="80" textAnchor="middle" fontSize="11" fontWeight="700" fill="#222">
        {unit}
      </text>
      <g
        transform={`translate(0 ${cy}) rotate(${needle(fraction) + 90})`}
        style={{ transition: 'transform .5s ease-out' }}
      >
        <path d="M0 0V-70" stroke="#b3261e" strokeWidth="1.5" />
      </g>
      <circle cy={cy} r="5" fill="#333" />
    </g>
  );
}

export function PanelMeter({ equipment: e, circuit, result }: Props) {
  const kind = definitionOf(e).kind;
  const w = definitionOf(e).size.width;
  let dial: { ticks: string[]; fraction: number; unit: string; exact: string };
  if (kind === 'wattmeter') {
    const r = coilMeterReading(e.id, circuit, result);
    dial = {
      ticks: ['0', '200', '400', '600', '800', '1000', '1200'],
      fraction: r.watts / 1200,
      unit: 'W',
      exact: `${r.watts.toFixed(1)} W`,
    };
  } else if (kind === 'pf-meter') {
    const r = coilMeterReading(e.id, circuit, result);
    // Scale: 0.5 lag … 1 … 0.5 lead. Lagging current swings the needle left.
    const pf = r.powerFactor ?? 1;
    const lead = (r.phaseDegrees ?? 0) > 0;
    const offset = Math.min(1, (1 - pf) / 0.5) * 0.5;
    dial = {
      ticks: ['0.5', '0.7', '0.9', '1', '0.9', '0.7', '0.5'],
      fraction: r.powerFactor === null ? 0.5 : lead ? 0.5 + offset : 0.5 - offset,
      unit: 'cos φ',
      exact:
        r.powerFactor === null
          ? '—'
          : `${pf.toFixed(3)} ${pf > 0.999 ? '' : lead ? 'lead' : 'lag'}`,
    };
  } else if (kind === 'ac-ammeter') {
    const amps = ammeterReading(e.id, result);
    dial = {
      ticks: ['0', '1', '2', '3', '4', '5'],
      fraction: amps / 5,
      unit: 'A ~',
      exact: `${amps.toFixed(3)} A`,
    };
  } else {
    const volts = voltmeterReading(e.id, circuit, result);
    dial = {
      ticks: ['0', '50', '100', '150', '200', '250', '300'],
      fraction: volts / 300,
      unit: 'V ~',
      exact: `${volts.toFixed(1)} V`,
    };
  }
  return (
    <g>
      <Dial x={w / 2} y={16} ticks={dial.ticks} fraction={dial.fraction} unit={dial.unit} />
      <text
        x={w / 2}
        y="138"
        textAnchor="middle"
        className="scope-print"
        data-testid={`${e.id}-reading`}
      >
        {definitionOf(e).name}
      </text>
      <title>{dial.exact}</title>
    </g>
  );
}

export function Load({ equipment: e, bench, onValue }: Props) {
  const part = equipmentComponents(bench, e)[0];
  const limits = definitionOf(e).limits;
  if (!part) return null;
  if (part.kind === 'resistor')
    return (
      <g>
        <rect x="40" y="40" width="260" height="40" rx="18" fill="#4f7d63" stroke="#2f4b3b" />
        {Array.from({ length: 26 }, (_, i) => (
          <path key={i} d={`M${52 + i * 9.5} 42V78`} stroke="#7fa98e" strokeWidth="1.5" />
        ))}
        <rect
          x={40 + (part.resistanceOhms / 300) * 240}
          y="30"
          width="18"
          height="60"
          rx="4"
          fill="#d9d4c6"
          stroke="#6d6a60"
        />
        <text x="22" y="24" className="bench-print">
          RHEOSTAT
        </text>
        <DeviceValue
          x={120}
          y={92}
          width={110}
          label="Rheostat resistance"
          value={part.resistanceOhms}
          unit="Ω"
          min={limits.resistanceOhms![0]}
          max={limits.resistanceOhms![1]}
          onChange={(v) => onValue(part.id, 'resistanceOhms', v)}
        />
      </g>
    );
  if (part.kind === 'inductor')
    return (
      <g>
        <text x="22" y="24" className="bench-print">
          INDUCTIVE LOAD
        </text>
        <path
          d={`M60 60${Array.from({ length: 8 }, () => ' a13 13 0 0 1 26 0').join('')}`}
          fill="none"
          stroke="#b87333"
          strokeWidth="5"
        />
        <path d="M40 60H60M268 60H300" stroke="#333" strokeWidth="2" />
        <DeviceValue
          x={120}
          y={92}
          width={110}
          label="Load inductance"
          value={part.inductanceHenries}
          unit="H"
          min={limits.inductanceHenries![0]}
          max={limits.inductanceHenries![1]}
          onChange={(v) => onValue(part.id, 'inductanceHenries', v)}
        />
      </g>
    );
  if (part.kind === 'capacitor')
    return (
      <g>
        <text x="22" y="24" className="bench-print">
          CAPACITIVE LOAD
        </text>
        <path
          d="M40 60H160M160 38V82M180 38V82M180 60H300M150 88L192 30"
          fill="none"
          stroke="#333"
          strokeWidth="2.5"
        />
        <DeviceValue
          x={120}
          y={92}
          width={110}
          label="Load capacitance"
          value={+(part.capacitanceFarads * 1e6).toPrecision(4)}
          unit="µF"
          min={limits.capacitanceFarads![0] * 1e6}
          max={limits.capacitanceFarads![1] * 1e6}
          onChange={(v) => onValue(part.id, 'capacitanceFarads', v * 1e-6)}
        />
      </g>
    );
  return null;
}

export function MachineBox() {
  return (
    <g pointerEvents="none">
      {/* Motor body and shaft behind the terminal box */}
      <rect x="40" y="18" width="220" height="40" rx="18" fill="#3e5b73" />
      <rect x="258" y="32" width="30" height="12" rx="3" fill="#9aa4ab" />
      <text
        x="150"
        y="44"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill="#e7eef4"
        letterSpacing="1"
      >
        DC MACHINE
      </text>
      <rect x="40" y="70" width="220" height="245" rx="6" fill="#fbfbf8" stroke="#555" />
      <text x="150" y="300" textAnchor="middle" className="bench-print strong">
        TERMINAL BOX
      </text>
      <text x="150" y="88" textAnchor="middle" className="scope-print small">
        unlabeled · identify each winding
      </text>
    </g>
  );
}

export function Lamp({ equipment: e, result }: Props) {
  const amps =
    result.rmsCurrents?.[`${e.id}.filament`] ??
    Math.abs(result.componentCurrents[`${e.id}.filament`] ?? 0);
  // Brightness follows electrical power; a real filament also changes resistance as it heats.
  const glow = Math.min(1, (amps * amps * ((220 * 220) / 100)) / 100);
  return (
    <g>
      {glow > 0.01 && (
        <circle
          cx="85"
          cy="78"
          r={40 + glow * 30}
          fill="#ffd66b"
          opacity={glow * 0.55}
          pointerEvents="none"
        />
      )}
      <path
        d="M60 110 Q40 90 45 65 Q55 25 85 25 Q115 25 125 65 Q130 90 110 110 L108 130 L62 130Z"
        fill={`rgba(255, ${220 + glow * 30}, ${150 * glow + 60}, ${0.25 + glow * 0.7})`}
        stroke="#999"
      />
      <path
        d="M70 105 L78 70 L85 90 L92 70 L100 105"
        fill="none"
        stroke={glow > 0.05 ? '#fff5c0' : '#8a6d3b'}
        strokeWidth={1.5 + glow * 2}
      />
      <rect x="62" y="130" width="46" height="26" rx="3" fill="#b9a36b" stroke="#7d6c42" />
      <text
        x="85"
        y="176"
        textAnchor="middle"
        className="scope-print"
        data-testid={`${e.id}-power`}
      >
        100 W · 220 V
      </text>
    </g>
  );
}

export function Variac({ equipment: e, bench, onPower, onValue }: Props) {
  const source = equipmentComponents(bench, e)[0];
  if (source?.kind !== 'ac-source') return null;
  const angle = -135 + (source.rmsVolts / 250) * 270;
  return (
    <g>
      <circle cx="130" cy="100" r="80" fill="#e8e6de" stroke="#8c8a80" />
      {Array.from({ length: 11 }, (_, i) => {
        const a = ((-135 + i * 27 - 90) * Math.PI) / 180;
        return (
          <text
            key={i}
            x={130 + Math.cos(a) * 68}
            y={100 + Math.sin(a) * 68 + 3}
            textAnchor="middle"
            fontSize="8"
            fill="#333"
          >
            {i * 25}
          </text>
        );
      })}
      <g
        transform={`translate(130 100) rotate(${angle})`}
        style={{ transition: 'transform .3s' }}
        pointerEvents="none"
      >
        <circle r="48" fill="#2b2f33" />
        <path d="M0 -46V-26" stroke="#f2f2ee" strokeWidth="4" strokeLinecap="round" />
      </g>
      <DeviceValue
        x={80}
        y={150}
        width={100}
        label="Variac voltage"
        value={source.rmsVolts}
        unit="V~"
        min={0}
        max={250}
        onChange={(v) => onValue(source.id, 'rmsVolts', v)}
      />
      <g
        {...press(() => onPower(e.id), source.enabled ? 'Variac off' : 'Variac on')}
        className="power-switch"
      >
        <rect
          x="14"
          y="14"
          width="46"
          height="24"
          rx="4"
          fill={source.enabled ? '#2f7a4a' : '#d5d8d2'}
          stroke="#7e847b"
        />
        <text
          x="37"
          y="30"
          textAnchor="middle"
          className="scope-print"
          fill={source.enabled ? '#fff' : '#333'}
        >
          {source.enabled ? 'ON' : 'OFF'}
        </text>
      </g>
    </g>
  );
}
