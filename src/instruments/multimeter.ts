import type {
  Component,
  Equipment,
  Measurement,
  MeasurementResult,
  ProtectionDevice,
  SimulationResult,
} from '../domain/models';

/**
 * DT-9205A style 3½-digit multimeter.
 *
 * The selected range changes the electrical model that is inserted between the sockets:
 * - DC voltage: 10 MΩ between VΩ and COM.
 * - Resistance: a test source behind a range reference resistor between VΩ and COM.
 * - DC current: the mA socket reaches COM through the fused range shunt; 20A through 0.01 Ω.
 * The mA and 20A shunts are hard-wired, so a lead left in a current socket still shorts
 * whatever it touches, exactly like a real meter.
 */
export type MeterMode =
  | 'resistance'
  | 'dc-voltage'
  | 'ac-voltage'
  | 'capacitance'
  | 'ac-current'
  | 'dc-current'
  | 'diode'
  | 'transistor';
export interface MeterRange {
  id: string;
  label: string;
  mode: MeterMode;
  title: string;
  simulated: boolean;
  /** Full-scale value in SI units (V, A, Ω). */
  fullScale?: number;
  decimals?: number;
  /** Display multiplier from SI units. */
  multiplier?: number;
  unit?: string;
  /** Current ranges: which input socket the range reads. */
  jack?: 'mA' | '20A';
  /** Current ranges: shunt between the jack and COM. */
  shuntOhms?: number;
}
const unsimulated = (mode: MeterMode, prefix: string, name: string, labels: string[]) =>
  labels.map((label): MeterRange => ({
    id: `${prefix}-${label}`,
    mode,
    label,
    title: `${name} ${label}`,
    simulated: false,
  }));
const ohms = (label: string, fullScale: number, decimals: number): MeterRange => {
  const [multiplier, unit] =
    fullScale <= 200 ? [1, 'Ω'] : fullScale <= 2e5 ? [1e-3, 'kΩ'] : [1e-6, 'MΩ'];
  return {
    id: `ohm-${label}`,
    mode: 'resistance',
    label,
    title: `Resistance ${label}Ω`,
    simulated: true,
    fullScale,
    decimals,
    multiplier,
    unit,
  };
};
const current = (
  mode: 'dc-current' | 'ac-current',
  label: string,
  fullScale: number,
  decimals: number,
  jack: 'mA' | '20A',
  shuntOhms: number,
): MeterRange => {
  const [multiplier, unit] =
    fullScale >= 1 ? [1, 'A'] : fullScale >= 1e-3 ? [1e3, 'mA'] : [1e6, 'µA'];
  return {
    id: `${mode === 'dc-current' ? 'dca' : 'aca'}-${label}`,
    mode,
    label,
    title: `${mode === 'dc-current' ? 'DC' : 'AC'} current ${label}A`,
    simulated: true,
    fullScale,
    decimals,
    multiplier,
    unit,
    jack,
    shuntOhms,
  };
};
const dcCurrent = (
  label: string,
  fullScale: number,
  decimals: number,
  jack: 'mA' | '20A',
  shuntOhms: number,
) => current('dc-current', label, fullScale, decimals, jack, shuntOhms);
const acVoltage = (label: string, fullScale: number, decimals: number): MeterRange => ({
  id: `acv-${label}`,
  mode: 'ac-voltage',
  label,
  title: `AC voltage ${label} V`,
  simulated: true,
  fullScale,
  decimals,
  multiplier: 1,
  unit: 'V',
});
/** Average-responding meters rectify the AC part and scale by π/(2√2) so a sine reads its RMS. */
export const SINE_FORM_FACTOR = Math.PI / (2 * Math.SQRT2);
/** Dial order, clockwise from the Ω sector. The selector steps 11.25° per position. */
export const meterRanges: MeterRange[] = [
  ohms('200', 200, 1),
  ohms('2k', 2e3, 3),
  ohms('20k', 2e4, 2),
  ohms('200k', 2e5, 1),
  ohms('2M', 2e6, 3),
  ohms('20M', 2e7, 2),
  ohms('200M', 2e8, 1),
  {
    id: 'dc-200m',
    mode: 'dc-voltage',
    label: '200m',
    title: 'DC voltage 200 mV',
    simulated: true,
    fullScale: 0.2,
    decimals: 1,
    multiplier: 1000,
    unit: 'mV',
  },
  {
    id: 'dc-2',
    mode: 'dc-voltage',
    label: '2',
    title: 'DC voltage 2 V',
    simulated: true,
    fullScale: 2,
    decimals: 3,
    multiplier: 1,
    unit: 'V',
  },
  {
    id: 'dc-20',
    mode: 'dc-voltage',
    label: '20',
    title: 'DC voltage 20 V',
    simulated: true,
    fullScale: 20,
    decimals: 2,
    multiplier: 1,
    unit: 'V',
  },
  {
    id: 'dc-200',
    mode: 'dc-voltage',
    label: '200',
    title: 'DC voltage 200 V',
    simulated: true,
    fullScale: 200,
    decimals: 1,
    multiplier: 1,
    unit: 'V',
  },
  {
    id: 'dc-1000',
    mode: 'dc-voltage',
    label: '1000',
    title: 'DC voltage 1000 V',
    simulated: true,
    fullScale: 1000,
    decimals: 0,
    multiplier: 1,
    unit: 'V',
  },
  acVoltage('700', 700, 0),
  acVoltage('200', 200, 1),
  acVoltage('20', 20, 2),
  ...unsimulated('capacitance', 'cap', 'Capacitance', ['20µ', '2µ', '200n', '20n', '2n']),
  current('ac-current', '20', 20, 2, '20A', 0.01),
  current('ac-current', '200m', 0.2, 1, 'mA', 1),
  current('ac-current', '20m', 0.02, 2, 'mA', 10),
  current('ac-current', '2m', 0.002, 3, 'mA', 100),
  dcCurrent('20', 20, 2, '20A', 0.01),
  dcCurrent('200m', 0.2, 1, 'mA', 1),
  dcCurrent('20m', 0.02, 2, 'mA', 10),
  dcCurrent('2m', 0.002, 3, 'mA', 100),
  dcCurrent('200µ', 2e-4, 1, 'mA', 1000),
  ...unsimulated('diode', 'diode', 'Diode test', ['↦', '•']),
  ...unsimulated('transistor', 'hfe', 'Transistor', ['hFE']),
];
export const meterAngle = (index: number) => -126 + index * 11.25;

export interface MeterSettings {
  kind: 'multimeter';
  powered: boolean;
  rangeId: string;
  /** The mA input fuse (F200 mA). A blown fuse opens the mA path until replaced. */
  fuseBlown: boolean;
}
export const defaultMeterSettings: MeterSettings = {
  kind: 'multimeter',
  powered: true,
  rangeId: 'dc-20',
  fuseBlown: false,
};

export const METER_INPUT_OHMS = 10e6;
export const OHMMETER_TEST_VOLTS = 1;
export const MA_FUSE_AMPS = 0.2;
export const TWENTY_AMP_SHUNT_OHMS = 0.01;
/** Idealization: outside the mA current ranges the mA socket presents the 200 mA shunt. */
const DEFAULT_MA_SHUNT_OHMS = 1;

export const rangeOf = (settings: MeterSettings) =>
  meterRanges.find((r) => r.id === settings.rangeId) ?? meterRanges[9];

export const meterIds = (meterId: string) => ({
  V: `${meterId}.V`,
  COM: `${meterId}.COM`,
  mA: `${meterId}.mA`,
  A20: `${meterId}.20A`,
  input: `${meterId}.input`,
  ohmSource: `${meterId}.ohm-source`,
  ohmReference: `${meterId}.ohm-reference`,
  ohmNode: `${meterId}::ohm`,
  shuntMa: `${meterId}.shunt-mA`,
  shunt20A: `${meterId}.shunt-20A`,
  fuse: `${meterId}.fuse`,
});

export interface InstrumentModel {
  components: Component[];
  measurements: Measurement[];
  protections: ProtectionDevice[];
  internalTerminals: string[];
}

export function multimeterModel(meter: Equipment, settings: MeterSettings): InstrumentModel {
  const ids = meterIds(meter.id);
  const range = rangeOf(settings);
  const components: Component[] = [];
  const measurements: Measurement[] = [];
  const internalTerminals: string[] = [];
  const instrument = { origin: 'instrument' as const };
  if (settings.powered && range.mode === 'resistance') {
    internalTerminals.push(ids.ohmNode);
    components.push(
      {
        id: ids.ohmSource,
        kind: 'dc-source',
        positive: ids.ohmNode,
        negative: ids.COM,
        voltageVolts: OHMMETER_TEST_VOLTS,
        enabled: true,
        ...instrument,
      },
      {
        id: ids.ohmReference,
        kind: 'resistor',
        a: ids.ohmNode,
        b: ids.V,
        resistanceOhms: range.fullScale!,
        measurementInput: true,
        ...instrument,
      },
    );
  } else {
    components.push({
      id: ids.input,
      kind: 'resistor',
      a: ids.V,
      b: ids.COM,
      resistanceOhms: METER_INPUT_OHMS,
      measurementInput: true,
      ...instrument,
    });
  }
  const isCurrent = range.mode === 'dc-current' || range.mode === 'ac-current';
  const maShunt = isCurrent && range.jack === 'mA' ? range.shuntOhms! : DEFAULT_MA_SHUNT_OHMS;
  if (!settings.fuseBlown)
    components.push({
      id: ids.shuntMa,
      kind: 'resistor',
      a: ids.mA,
      b: ids.COM,
      resistanceOhms: maShunt,
      ...instrument,
    });
  components.push({
    id: ids.shunt20A,
    kind: 'resistor',
    a: ids.A20,
    b: ids.COM,
    resistanceOhms: TWENTY_AMP_SHUNT_OHMS,
    ...instrument,
  });
  if (settings.powered) {
    if (range.mode === 'dc-voltage' || range.mode === 'ac-voltage' || range.mode === 'resistance')
      measurements.push({
        id: meter.id,
        kind: 'voltage',
        equipmentId: meter.id,
        positiveTerminalId: ids.V,
        negativeTerminalId: ids.COM,
        requireExternalReference: range.mode !== 'resistance',
      });
    if (isCurrent)
      measurements.push({
        id: meter.id,
        kind: 'current',
        equipmentId: meter.id,
        componentId: range.jack === '20A' ? ids.shunt20A : ids.shuntMa,
      });
  }
  return {
    components,
    measurements,
    internalTerminals,
    protections: [
      {
        id: ids.fuse,
        equipmentId: meter.id,
        kind: 'fuse',
        componentId: ids.shuntMa,
        ratingAmps: MA_FUSE_AMPS,
      },
    ],
  };
}

export type MeterStatus =
  | 'off'
  | 'valid'
  | 'floating'
  | 'fault'
  | 'error'
  | 'over-range'
  | 'unsupported'
  | 'energized'
  | 'pending';
export interface MeterDisplay {
  text: string;
  unit: string;
  caption: string;
  status: MeterStatus;
  range: MeterRange;
  settings: MeterSettings;
  /** Value in SI units when the reading is numeric. */
  value: number | null;
}

export function meterDisplay(
  meterId: string,
  settings: MeterSettings | undefined,
  result: SimulationResult,
): MeterDisplay {
  const s = settings ?? defaultMeterSettings;
  const range = rangeOf(s);
  const base = { unit: range.unit ?? '', range, settings: s, value: null };
  if (!s.powered)
    return { ...base, text: '', unit: '', caption: 'Meter switched off', status: 'off' };
  if (!range.simulated)
    return {
      ...base,
      text: '— —',
      caption: 'This mode is not simulated yet',
      status: 'unsupported',
    };
  const reading: MeasurementResult | undefined = result.measurements[meterId];
  if (reading?.status === 'pending')
    return { ...base, text: '- - -', caption: 'Simulating…', status: 'pending' };
  if (!reading || reading.status === 'floating')
    return { ...base, text: '— — —', caption: 'Connect VΩ and COM', status: 'floating' };
  if (reading.status !== 'valid')
    return {
      ...base,
      text: reading.status === 'fault' ? 'FAULT' : 'ERROR',
      caption: 'Check circuit connections',
      status: reading.status,
    };
  const ac = range.mode === 'ac-voltage' || range.mode === 'ac-current';
  // A DC-only analysis has no AC component, so an AC range reads zero.
  let value = ac ? SINE_FORM_FACTOR * (reading.stats?.acMeanAbs ?? 0) : reading.value!;
  const energized = result.diagnostics.some(
    (d) => d.code === 'ohmmeter-energized' && d.terminalIds.includes(`${meterId}.COM`),
  );
  if (range.mode === 'resistance') {
    // The display resolves the unknown from the divider formed with the reference resistor.
    const remaining = OHMMETER_TEST_VOLTS - value;
    const resistance =
      remaining <= OHMMETER_TEST_VOLTS * 1e-9 ? Infinity : (range.fullScale! * value) / remaining;
    if (!energized && (resistance >= range.fullScale! || !Number.isFinite(resistance)))
      return {
        ...base,
        text: '1',
        caption: 'Over range · open circuit or select a higher Ω range',
        status: 'over-range',
      };
    value = Math.abs(resistance) < 1e-9 ? 0 : resistance;
  }
  const scaled = value * range.multiplier!;
  const text = scaled.toFixed(range.decimals);
  const over = Math.abs(Number(text)) >= range.fullScale! * range.multiplier!;
  const overText = range.mode === 'resistance' ? '1' : 'OL';
  if (energized)
    return {
      ...base,
      text: over ? overText : text,
      value,
      caption: 'Circuit is powered · resistance reading is meaningless',
      status: 'energized',
    };
  if (over)
    return {
      ...base,
      text: overText,
      caption: `Over range · select a higher ${range.mode.endsWith('current') ? 'current' : range.mode === 'resistance' ? 'Ω' : ac ? 'AC V' : 'DC V'} range`,
      status: 'over-range',
    };
  const captions: Partial<Record<MeterMode, string>> = {
    'dc-voltage': `${range.title} · VΩ relative to COM`,
    'dc-current': `${range.title} · into ${range.jack === '20A' ? '20A' : 'mA'}, out of COM`,
    resistance: `${range.title} · between VΩ and COM`,
    'ac-voltage': `${range.title} · average-responding, sine-calibrated`,
    'ac-current': `${range.title} · average-responding, sine-calibrated`,
  };
  return {
    ...base,
    text: text === '-0' || /^-0\.0*$/.test(text) ? text.slice(1) : text,
    value,
    caption: captions[range.mode] ?? range.title,
    status: 'valid',
  };
}

/** Maps range IDs from schema version 2 saves to the current dial. */
export function migrateRangeId(id: string): string {
  if (meterRanges.some((r) => r.id === id)) return id;
  const legacy: string[] = [
    ...['200', '2k', '20k', '200k', '2M', '20M', '200M'].map((_, i) => `Ω-${i}`),
    'dc-200m',
    'dc-2',
    'dc-20',
    'dc-200',
    'dc-1000',
    ...[0, 1, 2].map((i) => `AC V-${i}`),
    ...[0, 1, 2, 3, 4].map((i) => `F-${i}`),
    ...[0, 1, 2, 3].map((i) => `AC A-${i}`),
    ...[0, 1, 2, 3, 4].map((i) => `DC A-${i}`),
    ...[0, 1].map((i) => `Diode-${i}`),
    'hFE-0',
  ];
  const index = legacy.indexOf(id);
  return index >= 0 ? meterRanges[index].id : defaultMeterSettings.rangeId;
}
