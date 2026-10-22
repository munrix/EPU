import { GENERATOR } from '../machines/dcGenerator';
import {
  armatureVolts,
  consoleOn,
  excitationMode,
  fieldAmps,
  generatorBench,
  machine,
  primeMover,
  primeMoverPending,
  running,
  speedNear,
  switchOpen,
  voltmeter,
  wireAll,
  type Lead,
} from './generator';
import type {
  ExperimentDefinition,
  ExperimentPart,
  ExperimentStep,
  ExperimentTable,
  StepContext,
  TableRow,
} from './types';

/**
 * DC machines lab sheets 3, 4 and 5 on the generator bench. Each sheet has a separately excited
 * part A and a self-excited part B; the guide and the bench switch between them as for sheet 2.
 * Speeds are set with the frequency inverter and read on the set's speed meter.
 */

const RATED = GENERATOR.ratedRpm;
const rpmNow = (c: StepContext) => machine(c)?.rpm ?? null;
/** The sheet column whose nominal value is within the tolerance of a reading. */
const nearest = (columns: string[], value: number | null, tolerance: number) =>
  value === null ? null : (columns.find((v) => Math.abs(Number(v) - value) <= tolerance) ?? null);
const near = (value: number | null, target: number, tolerance: number) =>
  value !== null && Math.abs(value - target) <= tolerance;

// Field circuits as in the sheets' figures.
const separateField: Lead[] = [
  ['console.P220', 'rf.A'],
  ['rf.C', 'meter.20A'],
  ['meter.COM', 'mg.F1'],
  ['mg.F2', 'console.N220', 'black'],
];
const selfFieldSwitched: Lead[] = [
  ['mg.A1', 'sw.1'],
  ['sw.2', 'rf.A'],
  ['rf.C', 'meter.20A'],
  ['meter.COM', 'mg.F1'],
  ['mg.F2', 'mg.A2', 'black'],
];
/**
 * Sheet 5, figure 2: A1 → ammeter → rheostat → F1, F2 → A2 (no switch in the field). The ammeter
 * takes the current in at 20A, so it reads upscale.
 */
const selfFieldDirect: Lead[] = [
  ['mg.A1', 'meter.20A'],
  ['meter.COM', 'rf.C'],
  ['rf.A', 'mg.F1'],
  ['mg.F2', 'mg.A2', 'black'],
];
/** Sheet 5: A1 → switch → 6–12 A ammeter → load rheostat → A2. */
const loadCircuit: Lead[] = [
  ['mg.A1', 'sw.1', 'red'],
  ['sw.2', 'meter3.20A'],
  ['meter3.COM', 'rl.A'],
  ['rl.C', 'mg.A2', 'black'],
];

const steps = {
  separate: {
    text: 'Part A field circuit (figure 1): 220 V DC + → field rheostat (A and slider C) → ammeter (meter, 20A DC) → F1; F2 → 220 V DC −.',
    hint: 'Use the rheostat between one end and the slider. Across both ends (A–B) the slider changes nothing.',
    check: (c: StepContext) =>
      excitationMode(c) === 'separate' && c.meterInSeries('mg.shunt', 'meter'),
  },
  voltmeter: {
    text: 'Voltmeter (meter2 on DC V 1000, the sheet’s 0–300 V) across the armature: VΩ → A1, COM → A2.',
    check: (c: StepContext) => armatureVolts(c) !== null,
  },
  primeMover: {
    text: 'Prime mover: W2–U2–V2 linked (star); R, S, T → inverter L1, L2, L3; inverter U, V, W → U1, V1, W1. Breaker on, inverter RUN.',
    hint: 'The speed follows the inverter frequency: about 30 rpm per Hz (47 Hz ≈ 1400 rpm, 25 Hz ≈ 750 rpm).',
    check: running,
  },
} satisfies Record<string, ExperimentStep>;

const pendingFor =
  (mode: 'separate' | 'self') =>
  (c: StepContext): string | null =>
    primeMoverPending(c) ??
    (mode === 'separate' && !consoleOn(c)
      ? 'Press START on the console to feed the field.'
      : mode === 'self' &&
          excitationMode(c, true) === 'self' &&
          switchOpen(c) &&
          excitationMode(c) !== 'self'
        ? 'Turn the load switch to I to close the field circuit.'
        : null);

const part = (
  id: 'A' | 'B',
  partSteps: number[],
  tableIds: string[],
  presetId: string,
  summary: string,
): ExperimentPart => ({
  id,
  label: id,
  title: id === 'A' ? 'Separately excited' : 'Self-excited',
  summary,
  presetId,
  steps: partSteps,
  tableIds,
  connected: (c) => excitationMode(c, true) === (id === 'A' ? 'separate' : 'self'),
  pending: pendingFor(id === 'A' ? 'separate' : 'self'),
});

// ---------------------------------------------------------------- Sheet 3: speed vs voltage

const SPEEDS = ['200', '400', '600', '800', '1000', '1200', '1400'];
const speedTable = (
  id: string,
  title: string,
  mode: 'separate' | 'self',
  holdAmps: number | null,
  note: string,
): ExperimentTable => ({
  id,
  title,
  columnLabel: 'N (rpm)',
  columns: SPEEDS,
  column: (c) => {
    if (excitationMode(c) !== mode || !running(c) || armatureVolts(c) === null) return null;
    if (holdAmps !== null && !near(fieldAmps(c), holdAmps, 0.012)) return null;
    return nearest(SPEEDS, rpmNow(c), 15);
  },
  rows: [
    { id: 'N', label: 'N', unit: 'rpm', decimals: 0, capture: rpmNow },
    { id: 'If', label: 'If', unit: 'A', decimals: 2, capture: fieldAmps },
    { id: 'Eg', label: 'Eg', unit: 'V', decimals: 1, capture: armatureVolts },
  ],
  note,
});

export const generatorSpeed: ExperimentDefinition = {
  id: 'dcm-speed',
  profileId: 'epu-lab',
  code: 'DCM 03',
  title: 'Speed and induced voltage',
  summary:
    'DC machines lab, experiment 3: Eg against N from 200 to 1400 rpm, separately excited (A) and self-excited (B).',
  objective:
    'Obtain the speed–voltage characteristic of the DC generator: linear when separately excited at constant field current, non-linear when self-excited.',
  theory:
    'Eg = ZΦPN / 60A = CΦN. With Φ constant (If constant) Eg ∝ N: a straight line through the origin. Self-excited with the rheostat fixed, If itself falls with the voltage, so Eg falls faster than N and collapses below the critical speed.',
  station: true,
  steps: [
    steps.separate,
    steps.voltmeter,
    steps.primeMover,
    {
      text: 'Set If = 0.5 A, then vary the speed from 200 to 1400 rpm with the inverter, recording Eg at each speed (keep If at 0.5 A).',
      check: (c) =>
        excitationMode(c) === 'separate' && near(fieldAmps(c), 0.5, 0.012) && running(c),
    },
    {
      text: 'Repeat with If = 0.25 A.',
      check: (c) =>
        excitationMode(c) === 'separate' && near(fieldAmps(c), 0.25, 0.012) && running(c),
    },
    {
      text: 'Part B field circuit (figure 2): A1 → switch (load switch 1–2) → field rheostat → ammeter → F1; F2 → A2. Close the switch.',
      check: (c) => excitationMode(c) === 'self' && c.meterInSeries('mg.shunt', 'meter'),
    },
    {
      text: 'At 1400 rpm let it build up and set If = 0.5 A. Then at each speed re-adjust the rheostat so If stays 0.5 A, and record Eg.',
      hint: 'No build-up? Reduce the field rheostat below the critical resistance, or swap the F1–F2 leads.',
      check: (c) => excitationMode(c) === 'self' && near(fieldAmps(c), 0.5, 0.012) && running(c),
    },
    {
      text: 'Now leave the rheostat alone and vary the speed: If changes with the voltage. Record If and Eg at each speed.',
      check: (c) => excitationMode(c) === 'self' && running(c) && (rpmNow(c) ?? RATED) < 1000,
      record: (c) =>
        `At ${Math.round(rpmNow(c)!)} rpm: If = ${fieldAmps(c)?.toFixed(2)} A, Eg = ${armatureVolts(c)?.toFixed(1)} V`,
    },
  ],
  tables: [
    speedTable('A-05', 'A · If = 0.5 A', 'separate', 0.5, 'Keep If at 0.5 A at every speed.'),
    speedTable('A-025', 'A · If = 0.25 A', 'separate', 0.25, 'Keep If at 0.25 A at every speed.'),
    speedTable(
      'B-const',
      'B · If held at 0.5 A',
      'self',
      0.5,
      'Re-adjust the rheostat at each speed so If stays at 0.5 A.',
    ),
    speedTable(
      'B-vary',
      'B · rheostat fixed, If varies',
      'self',
      null,
      'Do not touch the rheostat: If follows the voltage.',
    ),
  ],
  parts: [
    part(
      'A',
      [0, 1, 2, 3, 4],
      ['A-05', 'A-025'],
      'part-a',
      'Field fed from 220 V DC, speed varied',
    ),
    part(
      'B',
      [5, 1, 2, 6, 7],
      ['B-const', 'B-vary'],
      'part-b',
      'Field fed from A1–A2, speed varied',
    ),
  ],
  presets: [
    {
      id: 'part-a',
      title: 'Part A · figure (1), separately excited',
      description: 'Field from 220 V DC through the rheostat and ammeter; voltmeter on A1–A2.',
      build: () =>
        wireAll(generatorBench('dcm-speed'), 'preset-a', [
          ...primeMover,
          ...separateField,
          ...voltmeter,
        ]),
    },
    {
      id: 'part-b',
      title: 'Part B · figure (2), self-excited',
      description: 'A1 → switch → rheostat → ammeter → F1, F2 → A2; voltmeter on A1–A2.',
      build: () =>
        wireAll(generatorBench('dcm-speed'), 'preset-b', [
          ...primeMover,
          ...selfFieldSwitched,
          ...voltmeter,
        ]),
    },
  ],
  createBench: () => generatorBench('dcm-speed'),
};

// ------------------------------------------------- Sheet 4: critical resistance and speed

const IF_COLUMNS = ['0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6'];
const occAtSpeed = (
  id: string,
  title: string,
  mode: 'separate' | 'self',
  rpm: number,
  columns: string[],
): ExperimentTable => ({
  id,
  title,
  columnLabel: 'If (A)',
  columns,
  column: (c) => {
    const i = fieldAmps(c);
    if (i === null || armatureVolts(c) === null || !speedNear(c, rpm)) return null;
    if (i !== 0 && excitationMode(c) !== mode) return null;
    return nearest(columns, i, 0.012);
  },
  rows: [
    { id: 'If', label: 'If', unit: 'A', decimals: 2, capture: fieldAmps },
    { id: 'Eo', label: 'Eo', unit: 'V', decimals: 1, capture: armatureVolts },
    { id: 'N', label: 'N', unit: 'rpm', decimals: 0, capture: rpmNow },
    {
      id: 'R',
      label: 'Eo ÷ If',
      unit: 'Ω',
      decimals: 0,
      derive: (x) => (x.If > 0.02 && x.Eo !== undefined ? x.Eo / x.If : null),
    },
  ],
  note: 'Eo ÷ If is the slope of the line from the origin to each point. Its largest value on the first, straight part of the curve is the tangent from the origin: the critical resistance at this speed.',
});

export const generatorCritical: ExperimentDefinition = {
  id: 'dcm-critical',
  profileId: 'epu-lab',
  code: 'DCM 04',
  title: 'Critical resistance and critical speed',
  summary:
    'DC machines lab, experiment 4: no-load curves at 1400 and 750 rpm, the critical field resistance, and the critical speed of the self-excited generator.',
  objective:
    'Determine the critical resistance of the DC generator from its no-load curve at two speeds, and the critical speed of the self-excited generator.',
  theory:
    'The critical resistance is the slope of the tangent from the origin to the no-load curve: with more field-circuit resistance than that, a self-excited generator cannot build up. The curve scales with speed, so Rc does too. For a given field resistance Rsh, the critical speed is Nc = N1 · RT / RS.',
  station: true,
  steps: [
    steps.separate,
    steps.voltmeter,
    {
      ...steps.primeMover,
      text: `${steps.primeMover.text} Set 1400 rpm (about 47 Hz).`,
      check: (c) => speedNear(c, RATED),
    },
    {
      text: 'At 1400 rpm record Eo at If = 0 (field open), then 0.1 … 0.5 A.',
      check: (c) =>
        excitationMode(c) === 'separate' && speedNear(c, RATED) && near(fieldAmps(c), 0.5, 0.012),
    },
    {
      text: 'Lower the speed to 750 rpm (about 25 Hz) and take the curve again.',
      check: (c) =>
        excitationMode(c) === 'separate' && speedNear(c, 750) && near(fieldAmps(c), 0.5, 0.012),
    },
    {
      text: 'Part B field circuit (figure 2): A1 → switch (load switch 1–2) → field rheostat → ammeter → F1; F2 → A2. Close the switch.',
      check: (c) => excitationMode(c) === 'self' && c.meterInSeries('mg.shunt', 'meter'),
    },
    {
      text: 'At 1400 rpm let it build up and record Eo for If = 0 … 0.6 A.',
      hint: 'No build-up? Reduce the field rheostat below the critical resistance.',
      check: (c) =>
        excitationMode(c) === 'self' && speedNear(c, RATED) && (armatureVolts(c) ?? 0) > 150,
    },
    {
      text: 'Critical speed: leave the rheostat where it is and lower the speed with the inverter until the voltage collapses. Note that speed.',
      check: (c) =>
        excitationMode(c) === 'self' &&
        running(c) &&
        (rpmNow(c) ?? RATED) < RATED - 50 &&
        (armatureVolts(c) ?? Infinity) < 40,
      record: (c) => {
        const i = fieldAmps(c) ?? 0;
        return `Collapsed at about ${Math.round(rpmNow(c)!)} rpm${i > 0.002 ? ` (field circuit Eo ÷ If ≈ ${Math.round((armatureVolts(c) ?? 0) / i)} Ω)` : ''}`;
      },
    },
  ],
  tables: [
    occAtSpeed('A-1400', 'A · N = 1400 rpm', 'separate', RATED, IF_COLUMNS.slice(0, 6)),
    occAtSpeed('A-750', 'A · N = 750 rpm', 'separate', 750, IF_COLUMNS.slice(0, 6)),
    occAtSpeed('B-1400', 'B · N = 1400 rpm, self-excited', 'self', RATED, IF_COLUMNS),
  ],
  parts: [
    part(
      'A',
      [0, 1, 2, 3, 4],
      ['A-1400', 'A-750'],
      'part-a',
      'Field fed from 220 V DC, 1400 and 750 rpm',
    ),
    part(
      'B',
      [5, 1, 2, 6, 7],
      ['B-1400'],
      'part-b',
      'Field fed from A1–A2, speed lowered to collapse',
    ),
  ],
  presets: [
    {
      id: 'part-a',
      title: 'Part A · figure (1), separately excited',
      description: 'Field from 220 V DC through the rheostat and ammeter; voltmeter on A1–A2.',
      build: () =>
        wireAll(generatorBench('dcm-critical'), 'preset-a', [
          ...primeMover,
          ...separateField,
          ...voltmeter,
        ]),
    },
    {
      id: 'part-b',
      title: 'Part B · figure (2), self-excited',
      description: 'A1 → switch → rheostat → ammeter → F1, F2 → A2; voltmeter on A1–A2.',
      build: () =>
        wireAll(generatorBench('dcm-critical'), 'preset-b', [
          ...primeMover,
          ...selfFieldSwitched,
          ...voltmeter,
        ]),
    },
  ],
  createBench: () => generatorBench('dcm-critical'),
};

// ------------------------------------------------------------------ Sheet 5: load test

/** Load current on the 6–12 A ammeter (meter3), only when it is in series with the load. */
export function loadAmps(c: StepContext): number | null {
  const m = c.meter('meter3');
  if (m.range.mode !== 'dc-current' || m.status !== 'valid' || m.value === null) return null;
  if (Math.abs(m.value) < 0.02) return 0;
  return c.meterInSeries('rl.ac', 'meter3') || c.meterInSeries('rl.cb', 'meter3')
    ? Math.abs(m.value)
    : null;
}
const LOADS = ['0', '1', '1.5', '2', '2.5', '3'];
const loadTable = (id: string, title: string, mode: 'separate' | 'self'): ExperimentTable => ({
  id,
  title,
  columnLabel: 'IL (A)',
  columns: LOADS,
  column: (c) => {
    if (excitationMode(c) !== mode || armatureVolts(c) === null || fieldAmps(c) === null)
      return null;
    if (!speedNear(c, RATED, 20)) return null;
    return nearest(LOADS, loadAmps(c), 0.05);
  },
  rows: [
    { id: 'IL', label: 'IL', unit: 'A', decimals: 2, capture: loadAmps },
    { id: 'VL', label: 'VL', unit: 'V', decimals: 1, capture: armatureVolts },
    { id: 'If', label: 'If', unit: 'A', decimals: 2, capture: fieldAmps },
    {
      id: 'Ia',
      label: 'Ia',
      unit: 'A',
      decimals: 2,
      // Separately excited: the armature carries the load only. Self-excited: load plus field.
      derive: (x) => (x.IL === undefined ? null : mode === 'self' ? x.IL + (x.If ?? 0) : x.IL),
    } satisfies TableRow,
    {
      id: 'Eg',
      label: 'Eg = VL + Ia·Ra',
      unit: 'V',
      decimals: 1,
      derive: (x) => {
        if (x.VL === undefined || x.IL === undefined) return null;
        const ia = mode === 'self' ? x.IL + (x.If ?? 0) : x.IL;
        return x.VL + ia * GENERATOR.armatureOhms;
      },
    },
  ],
  note: `Hold 1400 rpm with the inverter at every step. Eg is calculated with the sheet’s Ra = ${GENERATOR.armatureOhms} Ω.`,
});

const noLoad220 = (mode: 'separate' | 'self') => (c: StepContext) =>
  excitationMode(c) === mode &&
  speedNear(c, RATED, 20) &&
  loadAmps(c) === 0 &&
  near(armatureVolts(c), 220, 3);

export const generatorLoad: ExperimentDefinition = {
  id: 'dcm-load',
  profileId: 'epu-lab',
  code: 'DCM 05',
  title: 'Load test of the DC generator',
  summary:
    'DC machines lab, experiment 5: external characteristic VL against IL up to 3 A, separately excited (A) and self-excited (B).',
  objective:
    'Draw the external characteristics of the separately excited and the self-excited DC generator at rated speed.',
  theory:
    'VL = Eg − Ia·Ra. On load the terminal voltage falls through the armature resistance drop and armature reaction. Self-excited, the falling voltage also lowers the field current, so the voltage falls faster.',
  station: true,
  steps: [
    steps.separate,
    steps.voltmeter,
    {
      text: 'Load circuit: A1 → switch (load switch 1–2) → ammeter (meter3, 20A DC) → load rheostat (A and slider C) → A2. Leave the switch open (no load).',
      check: (c) => c.meterInSeries('rl.ac', 'meter3') || c.meterInSeries('rl.cb', 'meter3'),
    },
    {
      ...steps.primeMover,
      text: `${steps.primeMover.text} Set 1400 rpm (about 47 Hz).`,
      check: (c) => speedNear(c, RATED, 20),
    },
    {
      text: 'With the switch open, raise If until the voltmeter reads the rated 220 V. Record the IL = 0 column.',
      check: noLoad220('separate'),
      record: (c) =>
        `No load: VL = ${armatureVolts(c)?.toFixed(1)} V with If = ${fieldAmps(c)?.toFixed(2)} A`,
    },
    {
      text: 'Close the switch and slide the load rheostat towards A in steps of IL = 1, 1.5 … 3 A, recording all meters. Hold 1400 rpm with the inverter.',
      check: (c) => excitationMode(c) === 'separate' && (loadAmps(c) ?? 0) >= 2.95,
    },
    {
      text: 'Part B field circuit (figure 2): A1 → ammeter (20A, COM on the rheostat side) → field rheostat → F1; F2 → A2. Keep the load circuit and the voltmeter.',
      check: (c) => excitationMode(c) === 'self' && c.meterInSeries('mg.shunt', 'meter'),
    },
    {
      text: 'Switch open, 1400 rpm: let it build up and set the rheostat for 220 V. Record the IL = 0 column.',
      check: noLoad220('self'),
    },
    {
      text: 'Close the switch and load it in steps up to 3 A, holding 1400 rpm. Note how much faster the voltage falls.',
      check: (c) => excitationMode(c) === 'self' && (loadAmps(c) ?? 0) >= 2.95,
    },
  ],
  tables: [
    loadTable('A-load', 'A · separately excited', 'separate'),
    loadTable('B-load', 'B · self-excited', 'self'),
  ],
  parts: [
    {
      ...part('A', [0, 1, 2, 3, 4, 5], ['A-load'], 'part-a', 'Field from 220 V DC, load on A1–A2'),
      pending: (c) => pendingFor('separate')(c),
    },
    {
      ...part('B', [6, 1, 2, 3, 7, 8], ['B-load'], 'part-b', 'Field from A1–A2, load on A1–A2'),
      pending: (c) =>
        primeMoverPending(c) ??
        ((armatureVolts(c) ?? 0) < 50 && !switchOpen(c)
          ? 'Open the load switch until the voltage has built up.'
          : (armatureVolts(c) ?? 0) < 50
            ? 'No build-up yet: slide the field rheostat towards A.'
            : null),
    },
  ],
  presets: [
    {
      id: 'part-a',
      title: 'Part A · figure 1, separately excited',
      description:
        'Field from 220 V DC through the rheostat and ammeter; A1 → switch → 6–12 A ammeter → load → A2; voltmeter on A1–A2.',
      build: () =>
        wireAll(generatorBench('dcm-load'), 'preset-a', [
          ...primeMover,
          ...separateField,
          ...voltmeter,
          ...loadCircuit,
        ]),
    },
    {
      id: 'part-b',
      title: 'Part B · figure 2, self-excited',
      description:
        'A1 → ammeter → rheostat → F1, F2 → A2; A1 → switch → 6–12 A ammeter → load → A2; voltmeter on A1–A2.',
      build: () =>
        wireAll(generatorBench('dcm-load'), 'preset-b', [
          ...primeMover,
          ...selfFieldDirect,
          ...voltmeter,
          ...loadCircuit,
        ]),
    },
  ],
  createBench: () => generatorBench('dcm-load'),
};
