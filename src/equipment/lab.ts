import type { EquipmentDefinition } from '../domain/models';

/**
 * Equipment photographed in the EPU lab (see docs/lab-inventory.md). Socket layouts follow the
 * photos. Values and internal wiring the photos cannot show are recorded as assumptions below
 * and must be confirmed against the real benches.
 *
 * Assumptions:
 * - Bench: one ON/OFF switch controls every output on the panel.
 * - Bench: the two fixed 12 V outputs form a ±12 V pair; the drawn earth symbol joins
 *   “+” of the first to “−” of the second, and that common is bonded to protective earth.
 * - Bench: variable supply 0–30 V with a 1 A current limit; transformer 12 V RMS per winding,
 *   50 Hz, three isolated windings U–X, V–Y, W–Z at 0°, −120°, +120°, 0.5 Ω each.
 * - Rectifier board: diodes point up (anode on the lower socket); electrolytic + at the top.
 * - Transistor board: the capacitor is 10 µF; the transistor behaves like a BC547B.
 */

export const LAB_BENCH_ID = 'epu-bench-panel-v1';
export const RECTIFIER_BOARD_ID = 'rectifier-board-3ph-v1';
export const TRANSISTOR_BOARD_ID = 'transistor-board-v1';
export const SCOPE_ID = 'utd2052cl-v1';

export const labBench: EquipmentDefinition = {
  id: LAB_BENCH_ID,
  name: 'Lab bench panel',
  kind: 'bench-panel',
  size: { width: 1240, height: 260 },
  fixedValues: false,
  limits: { voltageVolts: [0, 30], currentLimitAmps: [1, 1] },
  terminals: [
    { key: 'var.neg', label: '−', x: 105, y: 222, color: 'black' },
    { key: 'var.pos', label: '+', x: 205, y: 222, color: 'red' },
    { key: 'dc1.neg', label: '−', x: 430, y: 222, color: 'black' },
    { key: 'dc1.pos', label: '+', x: 510, y: 222, color: 'red', earthed: true },
    { key: 'dc2.neg', label: '−', x: 600, y: 222, color: 'black', earthed: true },
    { key: 'dc2.pos', label: '+', x: 680, y: 222, color: 'red' },
    { key: 'U', label: 'U', x: 795, y: 132, color: 'yellow' },
    { key: 'V', label: 'V', x: 875, y: 132, color: 'yellow' },
    { key: 'W', label: 'W', x: 955, y: 132, color: 'yellow' },
    { key: 'X', label: 'X', x: 795, y: 212, color: 'green' },
    { key: 'Y', label: 'Y', x: 875, y: 212, color: 'green' },
    { key: 'Z', label: 'Z', x: 955, y: 212, color: 'green' },
  ],
  components: [
    {
      key: 'var',
      kind: 'dc-source',
      positive: 'var.pos',
      negative: 'var.neg',
      voltageVolts: 12,
      currentLimitAmps: 1,
    },
    {
      key: 'dc1',
      kind: 'dc-source',
      positive: 'dc1.pos',
      negative: 'dc1.neg',
      voltageVolts: 12,
      currentLimitAmps: 1,
      fixed: true,
    },
    {
      key: 'dc2',
      kind: 'dc-source',
      positive: 'dc2.pos',
      negative: 'dc2.neg',
      voltageVolts: 12,
      currentLimitAmps: 1,
      fixed: true,
    },
    {
      key: 'phaseU',
      kind: 'ac-source',
      a: 'U',
      b: 'X',
      rmsVolts: 12,
      frequencyHz: 50,
      phaseDegrees: 0,
      seriesOhms: 0.5,
    },
    {
      key: 'phaseV',
      kind: 'ac-source',
      a: 'V',
      b: 'Y',
      rmsVolts: 12,
      frequencyHz: 50,
      phaseDegrees: -120,
      seriesOhms: 0.5,
    },
    {
      key: 'phaseW',
      kind: 'ac-source',
      a: 'W',
      b: 'Z',
      rmsVolts: 12,
      frequencyHz: 50,
      phaseDegrees: 120,
      seriesOhms: 0.5,
    },
  ],
  internalLinks: [['dc1.pos', 'dc2.neg']],
};

const rectifierColumns = [75, 147, 212, 275, 335, 400, 465];
const rows = [40, 145, 220, 330];
const col = (i: number) => 'ABCDEFG'[i];
export const rectifierBoard: EquipmentDefinition = {
  id: RECTIFIER_BOARD_ID,
  name: 'Rectifier board',
  kind: 'rectifier-board',
  size: { width: 530, height: 370 },
  fixedValues: true,
  limits: {},
  terminals: rectifierColumns.flatMap((x, i) =>
    (i < 3 ? [0, 1, 2, 3] : [0, 3]).map((r) => ({
      key: `${col(i)}${r + 1}`,
      label: `${col(i)}${r + 1}`,
      x,
      y: rows[r],
      color: 'red' as const,
    })),
  ),
  components: [
    ...[0, 1, 2].flatMap((i) => [
      {
        key: `D${i + 1}`,
        kind: 'diode' as const,
        anode: `${col(i)}2`,
        cathode: `${col(i)}1`,
        model: '1N4007' as const,
      },
      {
        key: `D${i + 4}`,
        kind: 'diode' as const,
        anode: `${col(i)}4`,
        cathode: `${col(i)}3`,
        model: '1N4007' as const,
      },
    ]),
    { key: 'C1', kind: 'capacitor', a: 'D1', b: 'D4', capacitanceFarads: 100e-6, polarized: true },
    { key: 'C2', kind: 'capacitor', a: 'E1', b: 'E4', capacitanceFarads: 10e-6, polarized: true },
    { key: 'R1', kind: 'resistor', a: 'F1', b: 'F4', resistanceOhms: 1000 },
    { key: 'R2', kind: 'resistor', a: 'G1', b: 'G4', resistanceOhms: 10000 },
  ],
};

export const transistorBoard: EquipmentDefinition = {
  id: TRANSISTOR_BOARD_ID,
  name: 'Transistor board',
  kind: 'transistor-board',
  size: { width: 490, height: 350 },
  fixedValues: true,
  limits: {},
  terminals: [
    { key: 'C1.a', label: 'C1', x: 135, y: 170, color: 'black' },
    { key: 'C1.b', label: 'C1', x: 245, y: 170, color: 'black' },
    { key: 'R1.a', label: '10k', x: 135, y: 245, color: 'black' },
    { key: 'R1.b', label: '10k', x: 245, y: 245, color: 'black' },
    { key: 'R2.a', label: '1k', x: 405, y: 50, color: 'black' },
    { key: 'R2.b', label: '1k', x: 405, y: 135, color: 'black' },
    { key: 'C', label: 'C', x: 405, y: 200, color: 'black' },
    { key: 'B', label: 'B', x: 325, y: 250, color: 'black' },
    { key: 'E', label: 'E', x: 405, y: 300, color: 'black' },
  ],
  components: [
    { key: 'C1', kind: 'capacitor', a: 'C1.a', b: 'C1.b', capacitanceFarads: 10e-6 },
    { key: 'R1', kind: 'resistor', a: 'R1.a', b: 'R1.b', resistanceOhms: 10000 },
    { key: 'R2', kind: 'resistor', a: 'R2.a', b: 'R2.b', resistanceOhms: 1000 },
    { key: 'Q1', kind: 'npn', collector: 'C', base: 'B', emitter: 'E', model: 'BC547B' },
  ],
};

/** Inputs are shown through the BNC-to-banana adapters used on the bench. Grounds are earthed. */
export const oscilloscope: EquipmentDefinition = {
  id: SCOPE_ID,
  name: 'UNI-T UTD2052CL oscilloscope',
  kind: 'oscilloscope',
  size: { width: 580, height: 360 },
  limits: {},
  terminals: [
    { key: 'ch1', label: 'CH1', x: 380, y: 318, color: 'red' },
    { key: 'ch1.gnd', label: '⏚', x: 420, y: 318, color: 'black', earthed: true },
    { key: 'ch2', label: 'CH2', x: 480, y: 318, color: 'red' },
    { key: 'ch2.gnd', label: '⏚', x: 520, y: 318, color: 'black', earthed: true },
  ],
  components: [],
};

export const GENERATOR_ID = 'function-generator-v1';
export const DECADE_R_ID = 'decade-resistor-v1';
export const DECADE_L_ID = 'decade-inductor-v1';
export const DECADE_C_ID = 'decade-capacitor-v1';

/**
 * AC circuits bench (sheets: R-L and R-C series circuits). Not in the bench photos; the decade
 * boxes are on the equipment table photo. Assumptions: the generator has a 50 Ω output and an
 * earthed output ground (BNC shell), 10 Vpp maximum into an open circuit; the decade inductor
 * has 5 Ω winding resistance.
 */
export const functionGenerator: EquipmentDefinition = {
  id: GENERATOR_ID,
  name: 'Function generator',
  kind: 'function-generator',
  size: { width: 420, height: 230 },
  limits: { rmsVolts: [0, 10 / (2 * Math.SQRT2)], frequencyHz: [10, 100000] },
  terminals: [
    { key: 'OUT', label: 'OUTPUT', x: 330, y: 185, color: 'red' },
    { key: 'GND', label: '⏚', x: 380, y: 185, color: 'black', earthed: true },
  ],
  components: [
    {
      key: 'out',
      kind: 'ac-source',
      a: 'OUT',
      b: 'GND',
      rmsVolts: 10 / (2 * Math.SQRT2),
      frequencyHz: 1000,
      phaseDegrees: 0,
      seriesOhms: 50,
    },
  ],
};
const decade = (
  id: string,
  name: string,
  component: EquipmentDefinition['components'][number],
  limits: EquipmentDefinition['limits'],
): EquipmentDefinition => ({
  id,
  name,
  kind: 'decade-box',
  size: { width: 400, height: 190 },
  limits,
  terminals: [
    { key: 'A', label: 'A', x: 40, y: 150, color: 'black' },
    { key: 'B', label: 'B', x: 360, y: 150, color: 'black' },
  ],
  components: [component],
});
export const decadeResistor = decade(
  DECADE_R_ID,
  'Decade resistor',
  { key: 'R', kind: 'resistor', a: 'A', b: 'B', resistanceOhms: 1000 },
  { resistanceOhms: [0, 99999] },
);
export const decadeInductor = decade(
  DECADE_L_ID,
  'Decade inductor',
  { key: 'L', kind: 'inductor', a: 'A', b: 'B', inductanceHenries: 0.1, seriesOhms: 5 },
  { inductanceHenries: [0, 0.999] },
);
export const decadeCapacitor = decade(
  DECADE_C_ID,
  'Decade capacitor',
  { key: 'C', kind: 'capacitor', a: 'A', b: 'B', capacitanceFarads: 1e-6 },
  { capacitanceFarads: [0, 9.999e-6] },
);
/** Dial steps (SI units) of each decade box, most significant first. */
export const decadeDials: Record<
  string,
  {
    field: 'resistanceOhms' | 'inductanceHenries' | 'capacitanceFarads';
    steps: number[];
    labels: string[];
    unit: string;
  }
> = {
  [DECADE_R_ID]: {
    field: 'resistanceOhms',
    steps: [10000, 1000, 100, 10, 1],
    labels: ['×10k', '×1k', '×100', '×10', '×1'],
    unit: 'Ω',
  },
  [DECADE_L_ID]: {
    field: 'inductanceHenries',
    steps: [0.1, 0.01, 0.001],
    labels: ['×100mH', '×10mH', '×1mH'],
    unit: 'H',
  },
  [DECADE_C_ID]: {
    field: 'capacitanceFarads',
    steps: [1e-6, 1e-7, 1e-8, 1e-9],
    labels: ['×1µF', '×100nF', '×10nF', '×1nF'],
    unit: 'F',
  },
};

export const labEquipment = [
  labBench,
  rectifierBoard,
  transistorBoard,
  oscilloscope,
  functionGenerator,
  decadeResistor,
  decadeInductor,
  decadeCapacitor,
];
