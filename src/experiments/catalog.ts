import type { Workbench } from '../domain/models';
import { instantiateEquipment, type EquipmentInstance } from '../equipment/registry';
import {
  DECADE_C_ID,
  DECADE_L_ID,
  DECADE_R_ID,
  GENERATOR_ID,
  LAB_BENCH_ID,
  RECTIFIER_BOARD_ID,
  SCOPE_ID,
  TRANSISTOR_BOARD_ID,
} from '../equipment/lab';
import { defaultMeterSettings } from '../instruments/multimeter';
import { coupled, measureChannel } from '../instruments/oscilloscope';
import {
  ammeterReading,
  coilMeterReading,
  voltmeterReading as panelVoltmeter,
} from '../instruments/panelMeters';
import {
  AC_AMMETER_ID,
  AC_VOLTMETER_ID,
  LOAD_CAPACITOR_ID,
  LOAD_INDUCTOR_ID,
  MAINS_ID,
  PF_METER_ID,
  RHEOSTAT_ID,
  WATTMETER_ID,
} from '../equipment/network';
import {
  LAMP_HOT_OHMS,
  LAMP_ID,
  MACHINE_VARIANTS,
  VARIAC_ID,
  WINDINGS,
  type Winding,
} from '../equipment/machines';
import type { ExperimentDefinition, ExperimentTable, StepContext } from './types';
import { makeBench } from './bench';
import { generatorOcc } from './generator';
import { generatorCritical, generatorLoad, generatorSpeed } from './generatorSheets';
export { makeBench };

const SP = 'supply.positive',
  SN = 'supply.negative';

const supply = (x = 140, y = 220) => instantiateEquipment('dc-supply-v1', 'supply', { x, y });
const meter = (x = 890, y = 165) => instantiateEquipment('dt9205a-v1', 'meter', { x, y });
const resistor = (
  id: string,
  label: string,
  ohms: number,
  x: number,
  y: number,
  removable = false,
) =>
  instantiateEquipment(
    'resistor-v1',
    id,
    { x, y },
    { label, removable, values: { resistanceOhms: ohms } },
  );

const reading = (ctx: StepContext, label?: string) => {
  const m = ctx.meter();
  return `${label ? `${label} = ` : ''}${m.text} ${m.unit}`.trim();
};
const healthy = (ctx: StepContext) =>
  !ctx.result.diagnostics.some((d) => d.severity === 'fault' || d.severity === 'error');
const voltmeterReading = (ctx: StepContext) =>
  ctx.meter().range.mode === 'dc-voltage' && ctx.meter().status === 'valid';

export const firstCircuit: ExperimentDefinition = {
  id: 'dc-foundations',
  profileId: 'dc',
  code: 'DC 01',
  title: 'Your first closed circuit',
  summary: 'Wire a supply to a load and measure it with stacked leads.',
  objective: 'Build a DC circuit, then measure the load voltage using stacked banana leads.',
  steps: [
    {
      text: 'Connect supply + to load A, then load B to supply −.',
      check: (c) => c.connected(SP, 'load.A') && c.connected(SN, 'load.B') && !c.connected(SP, SN),
    },
    {
      text: 'Stack a lead on load A and connect it to the meter VΩ socket.',
      check: (c) => c.connected('load.A', 'meter.V') && c.stacked('load.A'),
    },
    {
      text: 'Stack another lead on load B and connect it to COM.',
      check: (c) => c.connected('load.B', 'meter.COM') && c.stacked('load.B'),
    },
    {
      text: 'Switch on the supply and observe the signed voltage.',
      check: (c) => c.powered() && voltmeterReading(c) && healthy(c),
      record: (c) => reading(c, 'V load'),
    },
  ],
  createBench: () =>
    makeBench('dc-foundations', [supply(), resistor('load', 'LOAD', 1000, 540, 290), meter()]),
};

export const measuringCurrent: ExperimentDefinition = {
  id: 'dc-ammeter',
  profileId: 'dc',
  code: 'DC 02',
  title: 'Measuring current in series',
  summary: 'Break the loop and insert the ammeter. Then test Ohm’s law.',
  objective:
    'An ammeter must carry the current it measures, so it goes in series with the load — never across a source.',
  theory:
    'The meter’s shunt has a small resistance (burden). On the 20 mA range it is 10 Ω, so the current is slightly less than V ÷ R.',
  steps: [
    {
      text: 'Turn the dial to a mA DC current range (A⎓ sector: 200m, 20m or 2m).',
      check: (c) => c.meter().range.mode === 'dc-current' && c.meter().range.jack === 'mA',
    },
    {
      text: 'Insert the meter: wire supply + → meter mA, and meter COM → load A.',
      hint: 'The red lead leaves VΩ and goes to the mA socket.',
      check: (c) =>
        c.connected(SP, 'meter.mA') &&
        c.connected('meter.COM', 'load.A') &&
        !c.connected(SP, 'load.A'),
    },
    {
      text: 'Complete the loop: load B → supply −.',
      check: (c) => c.connected('load.B', SN) && !c.connected(SP, SN),
    },
    {
      text: 'Switch on. The meter now carries the load current.',
      hint: 'Reading 0.00 with everything wired? Check the mA fuse in Readings.',
      check: (c) =>
        c.powered() && c.meterInSeries('load.resistor') && c.meterReads(c.current('load.resistor')),
      record: (c) => reading(c, `I at ${c.sourceVolts()} V`),
    },
    {
      text: 'Set the supply to 6 V. Ohm’s law predicts the current halves.',
      check: (c) =>
        c.powered() &&
        c.sourceVolts() === 6 &&
        c.meterInSeries('load.resistor') &&
        c.meterReads(c.current('load.resistor')),
      record: (c) => reading(c, 'I at 6 V'),
    },
  ],
  createBench: () =>
    makeBench('dc-ammeter', [supply(), resistor('load', 'LOAD', 1000, 540, 290), meter()]),
};

export const seriesDivider: ExperimentDefinition = {
  id: 'dc-series',
  profileId: 'dc',
  code: 'DC 03',
  title: 'Series circuit & voltage divider',
  summary: 'Two resistors in series share the supply voltage.',
  objective: 'Measure the voltage across each resistor and confirm Kirchhoff’s voltage law.',
  theory:
    'In series the same current flows through R1 and R2, so V₁ : V₂ = R1 : R2 and V₁ + V₂ = V supply.',
  steps: [
    {
      text: 'Wire the loop: supply + → R1 A, R1 B → R2 A, R2 B → supply −.',
      check: (c) =>
        c.connected(SP, 'r1.A') &&
        c.connected('r1.B', 'r2.A') &&
        c.connected('r2.B', SN) &&
        !c.connected(SP, SN) &&
        !c.connected('r1.A', 'r1.B') &&
        !c.connected('r2.A', 'r2.B'),
    },
    {
      text: 'Switch on and measure the voltage across R1.',
      check: (c) =>
        c.powered() &&
        c.meterAcross('r1.A', 'r1.B') &&
        voltmeterReading(c) &&
        c.current('r1.resistor') !== 0,
      record: (c) => reading(c, 'V R1'),
    },
    {
      text: 'Move the meter leads and measure across R2.',
      check: (c) =>
        c.powered() &&
        c.meterAcross('r2.A', 'r2.B') &&
        voltmeterReading(c) &&
        c.current('r2.resistor') !== 0,
      record: (c) => reading(c, 'V R2'),
    },
    {
      text: 'Measure across the supply terminals. Compare with V R1 + V R2.',
      check: (c) =>
        c.powered() &&
        c.meterAcross(SP, SN) &&
        voltmeterReading(c) &&
        c.current('r1.resistor') !== 0,
      record: (c) => reading(c, 'V supply'),
    },
  ],
  createBench: () =>
    makeBench('dc-series', [
      supply(90, 230),
      resistor('r1', 'R1', 1000, 470, 90),
      resistor('r2', 'R2', 2000, 470, 440),
      meter(900, 165),
    ]),
};

export const parallelBranches: ExperimentDefinition = {
  id: 'dc-parallel',
  profileId: 'dc',
  code: 'DC 04',
  title: 'Parallel branches & KCL',
  summary: 'Split the current between two branches and account for all of it.',
  objective:
    'Measure the total current and each branch current, then confirm Kirchhoff’s current law.',
  theory: 'Both branches see the full supply voltage. The currents add: I total = I₁ + I₂.',
  steps: [
    {
      text: 'Connect R1 and R2 both across the supply (stack leads on + and −).',
      check: (c) =>
        c.connected('r1.A', SP) &&
        c.connected('r2.A', SP) &&
        c.connected('r1.B', SN) &&
        c.connected('r2.B', SN) &&
        !c.connected(SP, SN),
    },
    {
      text: 'Measure the total current: put the ammeter between supply + and the two resistors.',
      hint: 'Use the mA socket and a DC current range, as in DC 02.',
      check: (c) =>
        c.powered() &&
        c.meterReads(c.suppliedAmps()) &&
        c.meterInSeries('supply.source') &&
        c.current('r1.resistor') !== 0 &&
        c.current('r2.resistor') !== 0,
      record: (c) => reading(c, 'I total'),
    },
    {
      text: 'Move the ammeter into the R1 branch only.',
      check: (c) =>
        c.powered() &&
        c.meterReads(c.current('r1.resistor')) &&
        c.meterInSeries('r1.resistor') &&
        c.current('r2.resistor') !== 0 &&
        !c.meterReads(c.suppliedAmps()),
      record: (c) => reading(c, 'I R1'),
    },
    {
      text: 'Now measure the R2 branch current.',
      check: (c) =>
        c.powered() &&
        c.meterReads(c.current('r2.resistor')) &&
        c.meterInSeries('r2.resistor') &&
        c.current('r1.resistor') !== 0 &&
        !c.meterReads(c.suppliedAmps()),
      record: (c) => reading(c, 'I R2'),
    },
  ],
  createBench: () =>
    makeBench(
      'dc-parallel',
      [
        supply(90, 230),
        resistor('r1', 'R1', 1000, 470, 90),
        resistor('r2', 'R2', 2000, 470, 440),
        meter(900, 165),
      ],
      'dca-200m',
    ),
};

export const measuringResistance: ExperimentDefinition = {
  id: 'dc-ohmmeter',
  profileId: 'dc',
  code: 'DC 05',
  title: 'Measuring an unknown resistor',
  summary: 'Use the ohmmeter, choose the best range, and see why power must be off.',
  objective: 'Find the value of Rx with the ohmmeter, using the range with the best resolution.',
  theory:
    'An ohmmeter drives its own small test current. Any other source in the circuit corrupts the reading, so always measure de-energized parts.',
  steps: [
    {
      text: 'Leave the supply off. Turn the dial to a resistance (Ω) range.',
      check: (c) => c.meter().range.mode === 'resistance',
    },
    {
      text: 'Connect VΩ and COM across Rx.',
      check: (c) => c.meterAcross('rx.A', 'rx.B') && !c.connected('rx.A', 'rx.B'),
    },
    {
      text: 'Find the range showing the most digits without over-range (a lone “1”).',
      check: (c) =>
        c.meterAcross('rx.A', 'rx.B') &&
        c.meter().range.id === 'ohm-20k' &&
        c.meter().status === 'valid',
      record: (c) => reading(c, 'Rx'),
    },
    {
      text: 'Hazard demo: connect Rx across the supply and switch it on. Watch the reading.',
      check: (c) => c.result.diagnostics.some((d) => d.code === 'ohmmeter-energized'),
      record: (c) => `Powered reading: ${c.meter().text} ${c.meter().unit} (invalid)`,
    },
  ],
  createBench: () =>
    makeBench('dc-ohmmeter', [
      supply(),
      instantiateEquipment('resistor-unknown-v1', 'rx', { x: 540, y: 290 }, { label: 'Rx' }),
      meter(),
    ]),
};

export const openBench: ExperimentDefinition = {
  id: 'dc-open-bench',
  profileId: 'dc',
  code: 'OPEN',
  title: 'Open bench',
  summary: 'Free practice. Add resistors and build any DC circuit you like.',
  objective: 'Build your own circuits. Add resistor modules from the equipment drawer.',
  steps: [],
  openBench: true,
  createBench: () =>
    makeBench('dc-open-bench', [
      supply(90, 230),
      resistor('r1', 'R1', 1000, 470, 90, true),
      resistor('r2', 'R2', 2200, 470, 440, true),
      meter(900, 165),
    ]),
};

/** The real EPU bench: steel panel, plug-in board, DT-9205A and UNI-T scope, as photographed. */
function labStation(experimentId: string, board: EquipmentInstance): Workbench {
  return makeBench(
    experimentId,
    [
      instantiateEquipment(LAB_BENCH_ID, 'bench', { x: 0, y: 380 }),
      instantiateEquipment(SCOPE_ID, 'scope', { x: 640, y: 0 }),
      meter(300, -100),
      board,
    ],
    'dc-20',
    'epu-lab',
  );
}
export const powerBench: ExperimentDefinition = {
  id: 'lab-power',
  profileId: 'epu-lab',
  code: 'LAB 1',
  title: 'Power electronics bench',
  summary: 'Your bench with the 3-phase transformer and the six-diode rectifier board.',
  objective:
    'A copy of your lab bench: 0–30 V variable and ±12 V fixed supplies, a 12 V three-phase transformer (U V W / X Y Z), the rectifier board, a DT-9205A and the UNI-T UTD2052CL. Build any rectifier on it.',
  theory:
    'The ON/OFF switch powers every output. The scope’s channel grounds are earthed, and so is the ±12 V common: two grounds on different points of a circuit short them together.',
  steps: [],
  openBench: true,
  drawer: 'lab-boards',
  station: true,
  createBench: () =>
    labStation(
      'lab-power',
      instantiateEquipment(RECTIFIER_BOARD_ID, 'rect', { x: 1270, y: 300 }, { removable: true }),
    ),
};
export const transistorBench: ExperimentDefinition = {
  id: 'lab-transistor',
  profileId: 'epu-lab',
  code: 'LAB 2',
  title: 'Transistor bench',
  summary: 'Your bench with the BC547 transistor board and the ±12 V supplies.',
  objective:
    'The same lab bench with the transistor board: an NPN transistor (B, C, E), 10 kΩ, 1 kΩ and a coupling capacitor. Bias it from the supplies and watch it on the scope.',
  theory:
    'The transformer can drive the input through the capacitor; the ±12 V outputs share an earthed common with the scope grounds.',
  steps: [],
  openBench: true,
  drawer: 'lab-boards',
  station: true,
  createBench: () =>
    labStation(
      'lab-transistor',
      instantiateEquipment(TRANSISTOR_BOARD_ID, 'amp', { x: 1270, y: 330 }, { removable: true }),
    ),
};

/** AC circuits bench: generator, decade R/L/C boxes, DT-9205A and UNI-T scope. */
function acBench(experimentId: string): Workbench {
  return makeBench(
    experimentId,
    [
      instantiateEquipment(GENERATOR_ID, 'gen', { x: 40, y: 60 }),
      instantiateEquipment(SCOPE_ID, 'scope', { x: 500, y: 20 }),
      meter(1110, -60),
      instantiateEquipment(DECADE_R_ID, 'rbox', { x: 40, y: 430 }),
      instantiateEquipment(DECADE_L_ID, 'lbox', { x: 470, y: 430 }),
      instantiateEquipment(DECADE_C_ID, 'cbox', { x: 900, y: 430 }),
    ],
    'acv-20',
    'epu-lab',
  );
}
const GEN = { out: 'gen.OUT', gnd: 'gen.GND' };
const part = (box: 'rbox' | 'lbox' | 'cbox') => [`${box}.A`, `${box}.B`] as [string, string];
/** Generator → first part → second part → generator ground, in either order and orientation. */
function seriesLoop(c: StepContext, first: [string, string], second: [string, string]) {
  const orient = (p: [string, string]) => [p, [p[1], p[0]] as [string, string]];
  for (const [x, y] of [
    [first, second],
    [second, first],
  ])
    for (const [x1, x2] of orient(x))
      for (const [y1, y2] of orient(y))
        if (
          c.connected(GEN.out, x1) &&
          c.connected(x2, y1) &&
          c.connected(y2, GEN.gnd) &&
          !c.connected(x1, x2) &&
          !c.connected(y1, y2) &&
          !c.connected(GEN.out, GEN.gnd)
        )
          return true;
  return false;
}
const generator = (c: StepContext) => {
  const g = c.part('gen.out');
  return g?.kind === 'ac-source' ? g : undefined;
};
const vpp = (c: StepContext) => (generator(c)?.rmsVolts ?? 0) * 2 * Math.SQRT2;
const tableColumn = (columns: string[]) => (c: StepContext) => {
  const f = generator(c)?.frequencyHz;
  return (
    columns.find((col) => f !== undefined && Math.abs(f - Number(col)) <= Number(col) * 0.005) ??
    null
  );
};
const acReadingAcross = (c: StepContext, [a, b]: [string, string]) => {
  const m = c.meter();
  return m.range.mode === 'ac-voltage' && m.status === 'valid' && c.meterAcross(a, b)
    ? m.value
    : null;
};
/** The phase of the current: CH1 on the generator, CH2 across the resistor at the grounded end. */
const currentPhase = (c: StepContext) => {
  const [a, b] = part('rbox');
  const hot = c.connected('scope.ch2', a) ? b : c.connected('scope.ch2', b) ? a : null;
  if (!hot || !c.connected(hot, GEN.gnd) || !c.connected('scope.ch1', GEN.out)) return null;
  return c.scope().phaseDegrees;
};
const ohms = (c: StepContext, box: string) => {
  const r = c.part(`${box}.R`);
  return r?.kind === 'resistor' ? r.resistanceOhms : 0;
};
const sweep = ['200', '500', '1000', '4000', '6000', '8000', '10000'];
const scopeStep = {
  text: 'Scope: CH1 across the generator, CH2 across R. Both scope grounds go to the generator ⏚, so R must be the part next to ⏚.',
  hint: 'The scope and generator grounds are both earthed. A ground clip anywhere else shorts that point to earth.',
  check: (c: StepContext) => currentPhase(c) !== null,
};

const rlTable: ExperimentTable = {
  id: 'rl',
  title: 'R-L results (V rms from the meter, φ from the scope)',
  columnLabel: 'F (Hz)',
  columns: sweep,
  column: tableColumn(sweep),
  rows: [
    { id: 'VR', label: 'VR', unit: 'V', capture: (c) => acReadingAcross(c, part('rbox')) },
    { id: 'VL', label: 'VL', unit: 'V', capture: (c) => acReadingAcross(c, part('lbox')) },
    {
      id: 'phi',
      label: 'φ',
      unit: '°',
      decimals: 1,
      capture: (c) => {
        const p = currentPhase(c);
        return p === null ? null : Math.abs(p);
      },
    },
    {
      id: 'XL',
      label: 'XL',
      unit: 'Ω',
      decimals: 0,
      derive: (cells) => (cells.VR && cells.VL ? (cells.VL * 560) / cells.VR : null),
    },
  ],
  note: 'For each frequency: type it on the generator, put the meter (AC V) across R and press Record, then across L and Record again. φ is read from the scope with each Record. XL = VL ÷ I, with I = VR ÷ 560 Ω.',
};
export const rlSeries: ExperimentDefinition = {
  id: 'ac-rl',
  profileId: 'epu-lab',
  code: 'AC 01',
  title: 'R-L series circuit',
  summary: 'A.C. circuits lab, experiment 1: voltages, phase angle and XL from 200 Hz to 10 kHz.',
  objective:
    'Find VR, VL and the phase angle of a series R-L circuit (R = 560 Ω, L = 72 mH, 10 Vpp) and see how frequency changes them.',
  theory:
    'The current lags the source voltage by φ: tan φ = XL ÷ R with XL = 2πfL, and V² = VR² + VL². The meter reads RMS; 10 Vpp is 3.54 V RMS.',
  station: true,
  steps: [
    {
      text: 'Set the decade resistor to 560 Ω and the decade inductor to 72 mH.',
      check: (c) => {
        const l = c.part('lbox.L');
        return (
          Math.abs(ohms(c, 'rbox') - 560) < 0.5 &&
          l?.kind === 'inductor' &&
          Math.abs(l.inductanceHenries - 0.072) < 1e-6
        );
      },
    },
    {
      text: 'Set the generator to 10 Vpp and switch its OUTPUT on.',
      check: (c) => Math.abs(vpp(c) - 10) < 0.05 && !!generator(c)?.enabled,
    },
    {
      text: 'Wire the series loop: generator OUTPUT → R → L → generator ⏚.',
      check: (c) => seriesLoop(c, part('rbox'), part('lbox')),
    },
    scopeStep,
  ],
  tables: [rlTable],
  theoryValues: (c) => {
    const f = generator(c)?.frequencyHz ?? 1000;
    const xl = 2 * Math.PI * f * 0.072;
    const z = Math.hypot(560, xl);
    const v = 10 / (2 * Math.SQRT2);
    return [
      { label: `At ${f} Hz · XL = 2πfL`, value: `${xl.toFixed(1)} Ω` },
      { label: 'Z = √(R² + XL²)', value: `${z.toFixed(1)} Ω` },
      {
        label: 'φ = atan(XL ÷ R)',
        value: `${((Math.atan(xl / 560) * 180) / Math.PI).toFixed(1)}°`,
      },
      { label: 'VR = V·R ÷ Z', value: `${((v * 560) / z).toFixed(2)} V` },
      { label: 'VL = V·XL ÷ Z', value: `${((v * xl) / z).toFixed(2)} V` },
    ];
  },
  createBench: () => acBench('ac-rl'),
};

const rcSweep = ['200', '440', '500', '1000', '4000', '6000', '8000', '10000'];
const rcTable: ExperimentTable = {
  id: 'rc',
  title: 'R-C results (V rms from the meter, φ from the scope)',
  columnLabel: 'F (Hz)',
  columns: rcSweep,
  column: tableColumn(rcSweep),
  rows: [
    { id: 'VR', label: 'VR', unit: 'V', capture: (c) => acReadingAcross(c, part('rbox')) },
    { id: 'VC', label: 'VC', unit: 'V', capture: (c) => acReadingAcross(c, part('cbox')) },
    {
      id: 'phi',
      label: 'φ',
      unit: '°',
      decimals: 1,
      capture: (c) => {
        const p = currentPhase(c);
        return p === null ? null : Math.abs(p);
      },
    },
    {
      id: 'XC',
      label: 'XC',
      unit: 'Ω',
      decimals: 0,
      derive: (cells) => (cells.VR && cells.VC ? (cells.VC * 1000) / cells.VR : null),
    },
    {
      id: 'Z',
      label: 'Z',
      unit: 'Ω',
      decimals: 0,
      derive: (cells) =>
        cells.VR && cells.VC ? (Math.hypot(cells.VR, cells.VC) * 1000) / cells.VR : null,
    },
  ],
  note: 'For each frequency: put the meter (AC V) across R and press Record, then across C and Record again. I = VR ÷ 1 kΩ, so XC = VC ÷ I and Z = √(VR² + VC²) ÷ I. The 440 Hz row is for the discussion diagrams.',
};
export const rcSeries: ExperimentDefinition = {
  id: 'ac-rc',
  profileId: 'epu-lab',
  code: 'AC 02',
  title: 'R-C series circuit',
  summary:
    'A.C. circuits lab, experiment 2: voltages, phase angle, XC and Z from 200 Hz to 10 kHz.',
  objective:
    'Find VR, VC, the phase angle, XC and Z of a series R-C circuit (R = 1 kΩ, C = 0.5 µF, 10 Vpp) across frequency.',
  theory:
    'The current leads the source voltage by φ: tan φ = XC ÷ R with XC = 1 ÷ (2πfC), and V² = VR² + VC².',
  station: true,
  steps: [
    {
      text: 'Set the decade resistor to 1 kΩ and the decade capacitor to 0.5 µF.',
      check: (c) => {
        const cap = c.part('cbox.C');
        return (
          Math.abs(ohms(c, 'rbox') - 1000) < 0.5 &&
          cap?.kind === 'capacitor' &&
          Math.abs(cap.capacitanceFarads - 0.5e-6) < 1e-10
        );
      },
    },
    {
      text: 'Set the generator to 10 Vpp and switch its OUTPUT on.',
      check: (c) => Math.abs(vpp(c) - 10) < 0.05 && !!generator(c)?.enabled,
    },
    {
      text: 'Wire the series loop: generator OUTPUT → R → C → generator ⏚.',
      check: (c) => seriesLoop(c, part('rbox'), part('cbox')),
    },
    scopeStep,
  ],
  tables: [rcTable],
  theoryValues: (c) => {
    const f = generator(c)?.frequencyHz ?? 1000;
    const xc = 1 / (2 * Math.PI * f * 0.5e-6);
    const z = Math.hypot(1000, xc);
    const v = 10 / (2 * Math.SQRT2);
    return [
      { label: `At ${f} Hz · XC = 1 ÷ 2πfC`, value: `${xc.toFixed(1)} Ω` },
      { label: 'Z = √(R² + XC²)', value: `${z.toFixed(1)} Ω` },
      {
        label: 'φ = atan(XC ÷ R)',
        value: `${((Math.atan(xc / 1000) * 180) / Math.PI).toFixed(1)}°`,
      },
      { label: 'VR = V·R ÷ Z', value: `${((v * 1000) / z).toFixed(2)} V` },
      { label: 'VC = V·XC ÷ Z', value: `${((v * xc) / z).toFixed(2)} V` },
    ];
  },
  createBench: () => acBench('ac-rc'),
};

const PHASES = ['U', 'V', 'W'] as const;
const COLS = ['A', 'B', 'C'] as const;
const plus = 'rect.A1',
  minus = 'rect.A4';
/** Each phase drives the middle of its own diode leg; tops form +, bottoms form −. */
const bridgeWired = (c: StepContext) => {
  const legs = COLS.map((col) => PHASES.find((p) => c.connected(`bench.${p}`, `rect.${col}2`)));
  return (
    COLS.every((col) => c.connected(`rect.${col}2`, `rect.${col}3`)) &&
    new Set(legs.filter(Boolean)).size === 3 &&
    COLS.every((col) => c.connected(`rect.${col}1`, plus) && c.connected(`rect.${col}4`, minus)) &&
    !c.connected(plus, minus)
  );
};
const loadWired = (c: StepContext) =>
  bridgeWired(c) && c.connected('rect.F1', plus) && c.connected('rect.F4', minus);
/** CH1 across the load with its ground on the − bus. */
const outputTrace = (c: StepContext) => {
  if (!c.connected('scope.ch1', plus) || !c.connected('scope.ch1.gnd', minus)) return null;
  const t = c.scope().ch1;
  return t.referenced ? measureChannel(t.time, coupled(t.values, 'DC')) : null;
};
const benchOn = (c: StepContext) => {
  const u = c.part('bench.phaseU');
  return u?.kind === 'ac-source' && u.enabled;
};
const loadMeter = (c: StepContext, mode: 'dc-voltage' | 'ac-voltage') => {
  const m = c.meter();
  return m.range.mode === mode && m.status === 'valid' && c.meterAcross(plus, minus)
    ? m.value
    : null;
};
const LOAD_OHMS = 1000;
export const threePhaseRectifier: ExperimentDefinition = {
  id: 'pe-3ph-bridge',
  profileId: 'epu-lab',
  code: 'PE 04',
  title: 'Three-phase full-wave rectifier',
  summary:
    'Power electronics, experiment 4: the six-diode bridge on your bench’s 12 V transformer.',
  objective:
    'Build the three-phase bridge on the power electronic trainer, plot input and output, and measure the average and RMS output across the load.',
  theory:
    'Each diode conducts for 2π/3 in the order 12, 23, 34, 45, 56, 61. The output follows the line voltage: Vdc = 3√3·Vmax ÷ π and Vrms = 1.655·Vmax (Vmax = phase peak). The ripple is at 6 × 50 Hz. The sheet’s figure uses 50 V; your bench transformer gives 12 V per phase.',
  station: true,
  drawer: 'lab-boards',
  steps: [
    {
      text: 'Star-connect the secondary: join X, Y and Z. No neutral wire goes to the load.',
      check: (c) => c.connected('bench.X', 'bench.Y') && c.connected('bench.Y', 'bench.Z'),
    },
    {
      text: 'Bridge: U, V and W each to the middle of one diode column (join rows 2 and 3). Join the tops (row 1) as + and the bottoms (row 4) as −.',
      hint: 'Diodes on the board point up: current flows from row 2 to row 1 and from row 4 to row 3.',
      check: bridgeWired,
    },
    {
      text: 'Load Rc: connect the 1 kΩ column (F) across + and −.',
      check: loadWired,
    },
    {
      text: 'Turn on the bench and view the output on CH1, ground on −. Press AUTO.',
      hint: 'Only one ground position is safe: the scope grounds are earthed.',
      check: (c) => loadWired(c) && benchOn(c) && (outputTrace(c)?.frequency ?? 0) > 250,
      record: (c) => {
        const m = outputTrace(c)!;
        return `Ripple ${m.vpp.toFixed(2)} Vpp at ${m.frequency!.toFixed(0)} Hz`;
      },
    },
    {
      text: 'AVO meter across the load on DC V (200 range): the average output.',
      check: (c) => loadWired(c) && benchOn(c) && loadMeter(c, 'dc-voltage') !== null,
      record: (c) => `Vdc = ${c.meter().text} V`,
    },
  ],
  tables: [
    {
      id: 'output',
      title: 'Output across Rc = 1 kΩ',
      columnLabel: 'Reading',
      columns: ['Measured'],
      column: (c) => (loadWired(c) && benchOn(c) ? 'Measured' : null),
      rows: [
        {
          id: 'Vdc',
          label: 'Vdc',
          unit: 'V',
          capture: (c) => loadMeter(c, 'dc-voltage') ?? outputTrace(c)?.mean ?? null,
        },
        { id: 'Vrms', label: 'Vrms', unit: 'V', capture: (c) => outputTrace(c)?.rms ?? null },
        { id: 'Vpp', label: 'Ripple', unit: 'Vpp', capture: (c) => outputTrace(c)?.vpp ?? null },
        {
          id: 'f',
          label: 'Ripple f',
          unit: 'Hz',
          decimals: 0,
          capture: (c) => outputTrace(c)?.frequency ?? null,
        },
        {
          id: 'Idc',
          label: 'Idc = Vdc ÷ Rc',
          unit: 'mA',
          derive: (x) => (x.Vdc ? (x.Vdc / LOAD_OHMS) * 1000 : null),
        },
        {
          id: 'Irms',
          label: 'Irms = Vrms ÷ Rc',
          unit: 'mA',
          derive: (x) => (x.Vrms ? (x.Vrms / LOAD_OHMS) * 1000 : null),
        },
        {
          id: 'eta',
          label: 'η = (Vdc ÷ Vrms)²',
          unit: '%',
          derive: (x) => (x.Vdc && x.Vrms ? (x.Vdc / x.Vrms) ** 2 * 100 : null),
        },
        {
          id: 'FF',
          label: 'Form factor',
          decimals: 4,
          derive: (x) => (x.Vdc && x.Vrms ? x.Vrms / x.Vdc : null),
        },
        {
          id: 'RF',
          label: 'Ripple factor',
          unit: '%',
          derive: (x) =>
            x.Vdc && x.Vrms ? Math.sqrt(Math.max(0, (x.Vrms / x.Vdc) ** 2 - 1)) * 100 : null,
        },
      ],
      note: 'Record reads Vdc from the meter (DC V across the load) or the scope mean, and Vrms, ripple and f from the scope’s MEASURE. A DT-9205A on AC V reads only the ripple, not the output’s RMS.',
    },
  ],
  theoryValues: () => {
    const vm = 12 * Math.SQRT2;
    const vdc = (3 * Math.sqrt(3) * vm) / Math.PI;
    const vrms = 1.6554 * vm;
    const ff = vrms / vdc;
    return [
      { label: 'Vmax (phase peak) = 12·√2', value: `${vm.toFixed(2)} V` },
      { label: 'Vdc = 3√3·Vmax ÷ π', value: `${vdc.toFixed(2)} V` },
      { label: 'Vrms = 1.655·Vmax', value: `${vrms.toFixed(2)} V` },
      { label: 'Idc = Vdc ÷ Rc', value: `${((vdc / LOAD_OHMS) * 1000).toFixed(2)} mA` },
      { label: 'Irms = Vrms ÷ Rc', value: `${((vrms / LOAD_OHMS) * 1000).toFixed(2)} mA` },
      { label: 'η = (Vdc ÷ Vrms)²', value: `${((vdc / vrms) ** 2 * 100).toFixed(2)} %` },
      { label: 'Form factor = Vrms ÷ Vdc', value: ff.toFixed(4) },
      {
        label: 'Ripple factor = √(FF² − 1)',
        value: `${(Math.sqrt(ff * ff - 1) * 100).toFixed(2)} %`,
      },
      { label: 'Ripple frequency = 6f', value: '300 Hz' },
      { label: 'Real bridge: two diode drops', value: '≈ 1.4 V lower' },
    ];
  },
  createBench: () =>
    labStation(
      'pe-3ph-bridge',
      instantiateEquipment(RECTIFIER_BOARD_ID, 'rect', { x: 1270, y: 300 }, { removable: true }),
    ),
};

/** Figure: L → wattmeter COM→C → PF meter COM→C → ammeter → load → N; both voltage coils to N. */
const LOADS = [
  { type: 'R', box: 'rload', part: 'rload.R' },
  { type: 'L', box: 'lload', part: 'lload.L' },
  { type: 'C', box: 'cload', part: 'cload.C' },
] as const;
const ammeterOut = (c: StepContext) =>
  c.connected('pf.C', 'amm.A') ? 'amm.B' : c.connected('pf.C', 'amm.B') ? 'amm.A' : null;
const metersWired = (c: StepContext) =>
  c.connected('mains.L', 'watt.COM') &&
  c.connected('watt.C', 'pf.COM') &&
  ammeterOut(c) !== null &&
  c.connected('watt.V', 'mains.N') &&
  c.connected('pf.V', 'mains.N') &&
  !c.connected('mains.L', 'mains.N');
/** The single load between the ammeter output and N, or null. */
const connectedLoad = (c: StepContext) => {
  const out = ammeterOut(c);
  if (!out) return null;
  const loads = LOADS.filter(
    (l) =>
      (c.connected(`${l.box}.A`, out) && c.connected(`${l.box}.B`, 'mains.N')) ||
      (c.connected(`${l.box}.B`, out) && c.connected(`${l.box}.A`, 'mains.N')),
  );
  return loads.length === 1 ? loads[0] : null;
};
const voltmeterOnLoad = (c: StepContext) => {
  const out = ammeterOut(c);
  return (
    !!out &&
    ((c.connected('volt.B', out) && c.connected('volt.A', 'mains.N')) ||
      (c.connected('volt.A', out) && c.connected('volt.B', 'mains.N')))
  );
};
const mainsOn = (c: StepContext) => {
  const s = c.part('mains.source');
  return s?.kind === 'ac-source' && s.enabled;
};
const measuring = (c: StepContext) => metersWired(c) && connectedLoad(c) !== null && mainsOn(c);
const loadValue = (c: StepContext) => {
  const load = connectedLoad(c);
  const p = load && c.part(load.part);
  if (!p) return null;
  if (p.kind === 'resistor') return p.resistanceOhms;
  if (p.kind === 'inductor') return p.inductanceHenries;
  if (p.kind === 'capacitor') return p.capacitanceFarads * 1e6;
  return null;
};
export const singlePhasePower: ExperimentDefinition = {
  id: 'net-power',
  profileId: 'epu-lab',
  code: 'NET 01',
  title: 'Power in single-phase circuits',
  summary:
    'Electrical network lab, experiment 1: wattmeter and power-factor meter with R, L and C loads.',
  objective:
    'Measure power and power factor of R, L and C loads on the 220 V, 50 Hz supply with a wattmeter, a cos φ meter, an ammeter and a voltmeter, and compare with P = IV cos θ.',
  theory:
    'A resistor takes P = VI at cos θ = 1. An inductor’s current lags (cos θ lag, P only from its winding resistance); a capacitor’s current leads with P ≈ 0. The supply’s 6.3 A breaker trips on overload.',
  station: true,
  steps: [
    {
      text: 'Current coils in series from L: wattmeter COM → C, then PF meter COM → C, then the ammeter.',
      hint: 'Both voltage coils (V) go to N, as in the figure.',
      check: metersWired,
    },
    {
      text: 'Connect one load from the ammeter to N. Start with the rheostat (R).',
      check: (c) => metersWired(c) && connectedLoad(c) !== null,
    },
    {
      text: 'Voltmeter across the load.',
      check: (c) => metersWired(c) && voltmeterOnLoad(c),
    },
    {
      text: 'Close the breaker and read all four meters.',
      check: (c) => measuring(c) && voltmeterOnLoad(c),
    },
  ],
  tables: [
    {
      id: 'power',
      title: 'Results · 220 V, 50 Hz',
      columnLabel: 'Load',
      columns: ['R₁', 'R₂', 'L₁', 'L₂', 'C₁', 'C₂'],
      column: (c) => {
        if (!measuring(c)) return null;
        return { R: 'R', L: 'L', C: 'C' }[connectedLoad(c)!.type];
      },
      rows: [
        { id: 'value', label: 'Value', unit: 'Ω/H/µF', decimals: 2, capture: loadValue },
        {
          id: 'W',
          label: 'Power',
          unit: 'W',
          decimals: 1,
          capture: (c) => coilMeterReading('watt', c.circuit, c.result).watts,
        },
        {
          id: 'pf',
          label: 'cos θ',
          decimals: 3,
          capture: (c) => coilMeterReading('pf', c.circuit, c.result).powerFactor,
        },
        {
          id: 'I',
          label: 'I',
          unit: 'A',
          decimals: 3,
          capture: (c) => ammeterReading('amm', c.result),
        },
        {
          id: 'V',
          label: 'V',
          unit: 'V',
          decimals: 1,
          capture: (c) => (voltmeterOnLoad(c) ? panelVoltmeter('volt', c.circuit, c.result) : null),
        },
        {
          id: 'P',
          label: 'IV cos θ',
          unit: 'W',
          decimals: 1,
          derive: (x) => (x.I && x.V && x.pf !== undefined ? x.I * x.V * x.pf : null),
        },
      ],
      note: 'Record takes the load’s value and all four meters. Two readings per load: change the value between them. Values: R in Ω, L in H, C in µF.',
    },
  ],
  theoryValues: (c) => {
    const load = connectedLoad(c);
    const p = load && c.part(load.part);
    if (!p) return [{ label: 'Connect a load', value: 'to see its theory' }];
    const w = 2 * Math.PI * 50;
    const [r, x, name] =
      p.kind === 'resistor'
        ? [p.resistanceOhms, 0, `R = ${p.resistanceOhms} Ω`]
        : p.kind === 'inductor'
          ? [
              p.seriesOhms,
              w * p.inductanceHenries,
              `L = ${p.inductanceHenries} H (${p.seriesOhms} Ω winding)`,
            ]
          : p.kind === 'capacitor'
            ? [
                0,
                -1 / (w * p.capacitanceFarads),
                `C = ${(p.capacitanceFarads * 1e6).toFixed(1)} µF`,
              ]
            : [1, 0, ''];
    const z = Math.hypot(r, x);
    const i = 220 / z;
    const pf = r / z;
    return [
      { label: 'Load', value: name },
      { label: 'Z', value: `${z.toFixed(1)} Ω` },
      { label: 'I = V ÷ Z', value: `${i.toFixed(3)} A` },
      { label: 'cos θ = R ÷ Z', value: `${pf.toFixed(3)} ${x > 0 ? 'lag' : x < 0 ? 'lead' : ''}` },
      { label: 'P = IV cos θ', value: `${(i * 220 * pf).toFixed(1)} W` },
    ];
  },
  createBench: () =>
    makeBench(
      'net-power',
      [
        instantiateEquipment(MAINS_ID, 'mains', { x: 20, y: 60 }),
        instantiateEquipment(WATTMETER_ID, 'watt', { x: 350, y: 20 }),
        instantiateEquipment(PF_METER_ID, 'pf', { x: 630, y: 20 }),
        instantiateEquipment(AC_AMMETER_ID, 'amm', { x: 910, y: 30 }),
        instantiateEquipment(AC_VOLTMETER_ID, 'volt', { x: 1140, y: 30 }),
        instantiateEquipment(RHEOSTAT_ID, 'rload', { x: 350, y: 340 }),
        instantiateEquipment(LOAD_INDUCTOR_ID, 'lload', { x: 720, y: 340 }),
        instantiateEquipment(LOAD_CAPACITOR_ID, 'cload', { x: 1090, y: 340 }),
      ],
      defaultMeterSettings.rangeId,
      'epu-lab',
    ),
};

/** The machine's internal wiring for this bench: each winding's two terminal numbers. */
const machineMap = (c: StepContext) =>
  MACHINE_VARIANTS[c.bench.equipment.find((e) => e.id === 'dcm')?.definitionId ?? ''];
const term = (n: number) => `dcm.T${n}`;
const pairText = (code: number) => `${Math.floor(code / 10)}–${code % 10}`;
const pairCode = ([a, b]: [number, number]) => Math.min(a, b) * 10 + Math.max(a, b);
const identify = (ohms: number) =>
  ohms > 50 ? WINDINGS.shunt.label : ohms >= 1.5 ? WINDINGS.armature.label : WINDINGS.series.label;
/** The one winding carrying current, if exactly one does. */
const conducting = (c: StepContext): Winding | null => {
  const map = machineMap(c);
  if (!map) return null;
  const live = (Object.keys(map) as Winding[]).filter((w) => {
    const rms = c.result.rmsCurrents?.[`dcm.${w}`];
    return (rms ?? Math.abs(c.result.componentCurrents[`dcm.${w}`] ?? 0)) > 1e-4;
  });
  return live.length === 1 ? live[0] : null;
};
/** The winding the ohmmeter (VΩ/COM) is across. */
const ohmmeterOn = (c: StepContext): Winding | null => {
  const map = machineMap(c);
  const m = c.meter();
  if (!map || m.range.mode !== 'resistance' || m.status !== 'valid') return null;
  return (
    (Object.keys(map) as Winding[]).find((w) => c.meterAcross(term(map[w][0]), term(map[w][1]))) ??
    null
  );
};
const lampSeries = (c: StepContext): Winding | null => {
  const w = conducting(c);
  const map = machineMap(c);
  const mains = c.part('mains.source');
  if (!w || !map || mains?.kind !== 'ac-source' || !mains.enabled) return null;
  const [a, b] = map[w].map(term);
  const lampEnd = (t: string) => c.connected(t, 'lamp.A') || c.connected(t, 'lamp.B');
  const ok = (c.connected(a, 'mains.L') && lampEnd(b)) || (c.connected(b, 'mains.L') && lampEnd(a));
  return ok && (c.connected('lamp.A', 'mains.N') || c.connected('lamp.B', 'mains.N')) ? w : null;
};
const lampWatts = (c: StepContext) => {
  const rms =
    c.result.rmsCurrents?.['lamp.filament'] ??
    Math.abs(c.result.componentCurrents['lamp.filament'] ?? 0);
  return rms * rms * LAMP_HOT_OHMS;
};
/** Method 3: ammeter (meter) in series with the coil, voltmeter (meter2) across it. */
const vIMethod = (c: StepContext, supply: 'dc' | 'ac'): Winding | null => {
  const w = conducting(c);
  const map = machineMap(c);
  if (!w || !map) return null;
  const amm = c.meter('meter'),
    volt = c.meter('meter2');
  const currentMode = supply === 'dc' ? 'dc-current' : 'ac-current';
  const voltMode = supply === 'dc' ? 'dc-voltage' : 'ac-voltage';
  const source =
    supply === 'dc'
      ? c.powered('supply')
      : c.part('variac.out')?.kind === 'ac-source' &&
        (c.part('variac.out') as { enabled: boolean }).enabled;
  if (!source || amm.range.mode !== currentMode || volt.range.mode !== voltMode) return null;
  if (amm.status !== 'valid' || volt.status !== 'valid') return null;
  return c.meterAcross(term(map[w][0]), term(map[w][1]), 'meter2') ? w : null;
};
const windingPair = (find: (c: StepContext) => Winding | null) => (c: StepContext) => {
  const w = find(c);
  return w ? pairCode(machineMap(c)![w]) : null;
};
const terminalsRow = (find: (c: StepContext) => Winding | null) => ({
  id: 'pair',
  label: 'Terminals',
  capture: windingPair(find),
  format: pairText,
});
const PAIRS = ['Pair 1', 'Pair 2', 'Pair 3'];
export const dcMachineTerminals: ExperimentDefinition = {
  id: 'dcm-terminals',
  profileId: 'epu-lab',
  code: 'DCM 01',
  title: 'Identifying DC machine terminals',
  summary:
    'DC machines lab, experiment 1: find A1–A2, F1–F2 and D1–D2 on an unlabeled terminal box.',
  objective:
    'Identify the armature, shunt field and series field windings of an unlabeled 6-terminal machine with an ohmmeter, a series test lamp, and a supply with ammeter and voltmeter.',
  theory:
    'Shunt field: thin wire, many turns, 100–500 Ω and a large inductance. Armature: 0.5–5 Ω through the brushes. Series field: thick wire, 0.1–2 Ω. The box is wired differently on each new bench.',
  station: true,
  steps: [
    {
      text: 'Method 1 (all supplies off): meter on Ω. Find the pairs that read a resistance; the others read open (1).',
      check: (c) => ohmmeterOn(c) !== null,
    },
    {
      text: 'Method 2: 220 V series lamp. L → one terminal, the other terminal → lamp → N. Close the breaker.',
      hint: 'Bright: armature or series field. Dim or dark: shunt field (high resistance and inductance).',
      check: (c) => lampSeries(c) !== null,
    },
    {
      text: 'Method 3 (DC): supply + → ammeter (meter, mA) → coil → supply −, second meter (DC V) across the coil. Use 2–5 V.',
      check: (c) => vIMethod(c, 'dc') !== null,
    },
    {
      text: 'Method 3 with the variac (AC, meters on AC ranges): compare how much current each coil takes.',
      hint: 'Discussion 2: why does F1–F2 take almost no AC current?',
      check: (c) => vIMethod(c, 'ac') !== null,
    },
  ],
  tables: [
    {
      id: 'ohm',
      title: 'Method 1 · ohmmeter',
      columnLabel: 'Pair',
      columns: PAIRS,
      slotKey: 'pair',
      column: (c) => (ohmmeterOn(c) ? 'Pair' : null),
      rows: [
        terminalsRow(ohmmeterOn),
        {
          id: 'R',
          label: 'R',
          unit: 'Ω',
          decimals: 1,
          capture: (c) => (ohmmeterOn(c) ? c.meter().value : null),
        },
        { id: 'id', label: 'Winding', derive: (x) => x.R ?? null, format: identify },
      ],
    },
    {
      id: 'lamp',
      title: 'Method 2 · series lamp (220 V)',
      columnLabel: 'Pair',
      columns: PAIRS,
      slotKey: 'pair',
      column: (c) => (lampSeries(c) ? 'Pair' : null),
      rows: [
        terminalsRow(lampSeries),
        {
          id: 'P',
          label: 'Lamp',
          unit: 'W',
          decimals: 1,
          capture: (c) => (lampSeries(c) ? lampWatts(c) : null),
        },
        {
          id: 'glow',
          label: 'Glow',
          derive: (x) => x.P ?? null,
          format: (w) => (w > 60 ? 'Bright' : w > 5 ? 'Dim' : 'No glow'),
        },
      ],
    },
    {
      id: 'dc',
      title: 'Method 3 · DC supply (R = V ÷ I)',
      columnLabel: 'Pair',
      columns: PAIRS,
      slotKey: 'pair',
      column: (c) => (vIMethod(c, 'dc') ? 'Pair' : null),
      rows: [
        terminalsRow((c) => vIMethod(c, 'dc')),
        {
          id: 'V',
          label: 'V',
          unit: 'V',
          decimals: 3,
          capture: (c) => (vIMethod(c, 'dc') ? c.meter('meter2').value : null),
        },
        {
          id: 'I',
          label: 'I',
          unit: 'A',
          decimals: 4,
          capture: (c) => (vIMethod(c, 'dc') ? c.meter('meter').value : null),
        },
        {
          id: 'R',
          label: 'R',
          unit: 'Ω',
          decimals: 1,
          derive: (x) => (x.V && x.I ? x.V / x.I : null),
        },
      ],
      note: 'The ammeter’s shunt is inside the loop but outside the voltmeter, so V ÷ I is the coil alone.',
    },
    {
      id: 'ac',
      title: 'Method 3 · variac, AC (Z = V ÷ I)',
      columnLabel: 'Pair',
      columns: PAIRS,
      slotKey: 'pair',
      column: (c) => (vIMethod(c, 'ac') ? 'Pair' : null),
      rows: [
        terminalsRow((c) => vIMethod(c, 'ac')),
        {
          id: 'V',
          label: 'V',
          unit: 'V',
          decimals: 2,
          capture: (c) => (vIMethod(c, 'ac') ? c.meter('meter2').value : null),
        },
        {
          id: 'I',
          label: 'I',
          unit: 'A',
          decimals: 4,
          capture: (c) => (vIMethod(c, 'ac') ? c.meter('meter').value : null),
        },
        {
          id: 'Z',
          label: 'Z',
          unit: 'Ω',
          decimals: 1,
          derive: (x) => (x.V && x.I ? x.V / x.I : null),
        },
      ],
    },
  ],
  createBench: () => {
    const variants = Object.keys(MACHINE_VARIANTS);
    const variant = variants[Math.floor(Math.random() * variants.length)];
    return makeBench(
      'dcm-terminals',
      [
        instantiateEquipment(variant, 'dcm', { x: 40, y: 60 }),
        meter(380, -40),
        instantiateEquipment('dt9205a-v1', 'meter2', { x: 680, y: -40 }),
        instantiateEquipment(MAINS_ID, 'mains', { x: 990, y: 0 }),
        instantiateEquipment(LAMP_ID, 'lamp', { x: 1320, y: 10 }),
        supply(990, 290),
        instantiateEquipment(VARIAC_ID, 'variac', { x: 1320, y: 290 }),
      ],
      'ohm-200',
      'epu-lab',
    );
  },
};

export const experiments: ExperimentDefinition[] = [
  threePhaseRectifier,
  powerBench,
  transistorBench,
  rlSeries,
  rcSeries,
  singlePhasePower,
  dcMachineTerminals,
  generatorOcc,
  generatorSpeed,
  generatorCritical,
  generatorLoad,
  firstCircuit,
  measuringCurrent,
  seriesDivider,
  parallelBranches,
  measuringResistance,
  openBench,
];
export const experimentById = (id: string) => experiments.find((e) => e.id === id);
export const defaultExperiment = firstCircuit;
