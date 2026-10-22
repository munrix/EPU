import type { Workbench } from '../domain/models';
import { componentPins, isActive } from '../domain/models';
import { DisjointSet } from '../electrical/connectivity/buildCircuit';
import {
  CONSOLE_ID,
  FIELD_RHEOSTAT_ID,
  LOAD_RHEOSTAT_ID,
  LOAD_SWITCH_ID,
  MG_SET_ID,
  SWITCH_OPEN_OHMS,
  THREE_PHASE_ID,
} from '../equipment/machineLab';
import { instantiateEquipment } from '../equipment/registry';
import { GENERATOR } from '../machines/dcGenerator';
import { makeBench } from './bench';
import type { ExperimentDefinition, ExperimentTable, StepContext } from './types';

/**
 * The generator bench (DC machine lab, sheets 2–5): the motor–generator set, the supply console,
 * a field rheostat, a load rheostat, the load switch and three multimeters standing in for the
 * sheets' 1 A ammeter (meter), 0–300 V voltmeter (meter2) and 6–12 A ammeter (meter3), whose own
 * photos have not been supplied.
 */
export function generatorBench(experimentId: string): Workbench {
  const bench = makeBench(
    experimentId,
    [
      instantiateEquipment(FIELD_RHEOSTAT_ID, 'rf', { x: 40, y: 20 }, { label: 'Rf' }),
      instantiateEquipment(LOAD_RHEOSTAT_ID, 'rl', { x: 620, y: 20 }, { label: 'RL' }),
      instantiateEquipment(LOAD_SWITCH_ID, 'sw', { x: 1210, y: 0 }),
      instantiateEquipment('dt9205a-v1', 'meter', { x: 1510, y: -20 }, { label: 'If' }),
      instantiateEquipment('dt9205a-v1', 'meter2', { x: 1810, y: -20 }, { label: 'V' }),
      instantiateEquipment('dt9205a-v1', 'meter3', { x: 2110, y: -20 }, { label: 'IL' }),
      instantiateEquipment(MG_SET_ID, 'mg', { x: 40, y: 520 }),
      instantiateEquipment(CONSOLE_ID, 'console', { x: 1080, y: 540 }),
      instantiateEquipment(THREE_PHASE_ID, 'rst', { x: 660, y: 236 }),
    ],
    'dca-20',
    'epu-lab',
  );
  return {
    ...bench,
    instrumentSettings: {
      ...bench.instrumentSettings,
      meter2: { ...bench.instrumentSettings.meter2, rangeId: 'dc-1000' },
    },
  };
}

const machine = (c: StepContext) => c.result.machines?.mg;
/**
 * The set runs at the induction motor's speed, fixed by the 50 Hz supply (about 1490 rpm with
 * the generator unloaded). The sheets' 1400 rpm needs a speed control the photos do not show,
 * so any steady forward running speed is accepted and recorded with each reading.
 */
const atRatedSpeed = (c: StepContext) =>
  machine(c)?.motorStatus === 'running' && (machine(c)?.rpm ?? 0) > 0.9 * GENERATOR.ratedRpm;

/**
 * How the shunt field is fed, judged from the wiring alone: from the console (separately
 * excited), from the machine's own armature (self-excited), or neither.
 */
export function excitationMode(c: StepContext): 'separate' | 'self' | null {
  const sets = new DisjointSet();
  const internal = new Set(['mg.emf', 'mg.armature', 'mg.shunt', 'mg.series', 'mg.tacho']);
  for (const part of c.circuit.components) {
    if (internal.has(part.id) || !isActive(part)) continue;
    if (part.kind === 'resistor' && part.resistanceOhms >= SWITCH_OPEN_OHMS / 10) continue;
    const [a, ...rest] = componentPins(part).map((t) => c.circuit.terminalToNode[t]);
    rest.forEach((b) => sets.union(a, b));
  }
  const group = (t: string) => sets.find(c.circuit.terminalToNode[t]);
  const field = [group('mg.F1'), group('mg.F2')];
  const touches = (terminals: string[]) => terminals.some((t) => field.includes(group(t)));
  if (touches(['mg.A1', 'mg.A2'])) return 'self';
  if (
    touches([
      'console.P220',
      'console.P110',
      'console.VP',
      'console.N220',
      'console.N110',
      'console.VN',
    ])
  )
    return 'separate';
  return null;
}

/** Field current on the field ammeter, only when that meter is in series with F1–F2. */
export function fieldAmps(c: StepContext): number | null {
  const m = c.meter('meter');
  if (m.range.mode !== 'dc-current' || m.status !== 'valid' || m.value === null) return null;
  if (Math.abs(m.value) < 0.005) return 0;
  return c.meterInSeries('mg.shunt', 'meter') ? Math.abs(m.value) : null;
}
/** Armature voltage on the voltmeter across A1–A2. */
export function armatureVolts(c: StepContext): number | null {
  const m = c.meter('meter2');
  if (m.range.mode !== 'dc-voltage' || m.status !== 'valid' || m.value === null) return null;
  return c.meterAcross('mg.A1', 'mg.A2', 'meter2') ? m.value : null;
}

const UP = ['0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6'];
const LOOP = [
  ...UP.slice(0, -1).map((v) => `${v} ↑`),
  '0.6',
  ...UP.slice(0, -1)
    .reverse()
    .map((v) => `${v} ↓`),
];
/** The sheet column matching the field current now on the ammeter (within ±0.012 A). */
function occColumn(c: StepContext, mode: 'separate' | 'self', loop: boolean): string | null {
  if (excitationMode(c) !== mode && fieldAmps(c) !== 0) return null;
  const i = fieldAmps(c);
  if (i === null || armatureVolts(c) === null || !atRatedSpeed(c)) return null;
  const nominal = UP.find((v) => Math.abs(Number(v) - i) <= 0.012);
  if (nominal === undefined) return null;
  const m = machine(c)!;
  const falling = m.excitationAmps < (c.bench.machines?.mg?.peakFieldAmps ?? 0) - 0.01;
  // Table 1 is the no-load curve taken with If rising; readings on the way down belong to table 2.
  if (!loop) return falling ? null : nominal;
  if (nominal === '0.6') return '0.6';
  return `${nominal} ${falling ? '↓' : '↑'}`;
}
const occRows = [
  { id: 'If', label: 'If', unit: 'A', decimals: 2, capture: fieldAmps },
  { id: 'Eo', label: 'Eo', unit: 'V', decimals: 1, capture: armatureVolts },
  {
    id: 'n',
    label: 'n',
    unit: 'rpm',
    decimals: 0,
    capture: (c: StepContext) => machine(c)?.rpm ?? null,
  },
];
const occTables = (mode: 'separate' | 'self', part: string): ExperimentTable[] => [
  {
    id: `${part}-noload`,
    title: `${part} · Table 1 · no-load characteristic (constant speed)`,
    columnLabel: 'If (A)',
    columns: UP,
    column: (c) => occColumn(c, mode, false),
    rows: occRows,
    note: 'Taken with If rising (record it on the way up, together with the first half of table 2).',
  },
  {
    id: `${part}-loop`,
    title: `${part} · Table 2 · magnetization characteristic, up and down`,
    columnLabel: 'If (A)',
    columns: LOOP,
    column: (c) => occColumn(c, mode, true),
    rows: occRows,
    note: 'Go up to 0.6 A without turning back, then down. Turning back early starts the falling curve from there.',
  },
];

export const generatorOcc: ExperimentDefinition = {
  id: 'dcm-occ',
  profileId: 'epu-lab',
  code: 'DCM 02',
  title: 'Open-circuit and magnetization characteristics',
  summary:
    'DC machines lab, experiment 2: Eo against If at constant speed, separately excited (A) and self-excited (B), up and down.',
  objective:
    'Obtain the no-load (open-circuit) curve and the magnetization loop of the DC generator, first with the field fed from the 220 V DC supply, then from its own armature.',
  theory:
    'Eg = PZΦN / 60A = CΦN. At constant speed Eo follows the flux, so the curve has the shape of the iron’s B–H curve: residual voltage at If = 0, a straight part, then saturation. Coming down, the iron keeps some magnetism, so Eo is higher than on the way up.',
  station: true,
  steps: [
    {
      text: 'Part A. Field circuit: 220 V DC + → field rheostat (A and slider C) → ammeter (meter on 20A DC) → F1; F2 → 220 V DC −.',
      hint: 'Use the rheostat between one end and the slider. Across both ends (A–B) the slider changes nothing.',
      check: (c) => excitationMode(c) === 'separate' && c.meterInSeries('mg.shunt', 'meter'),
    },
    {
      text: 'Voltmeter (meter2 on DC V 1000) across the armature: VΩ → A1, COM → A2.',
      check: (c) => armatureVolts(c) !== null,
    },
    {
      text: 'Prime mover: link W2–U2–V2 in its terminal box (star), then R → U1, S → V1, T → W1 (through the load switch poles if you like). Switch the R S T breaker on.',
      hint: 'Star, because each winding is rated 220 V and R S T is 380 V between lines. Turning backwards? Swap two phases. Humming? A phase is missing.',
      check: atRatedSpeed,
    },
    {
      text: 'With no field current (console off or field lead removed), read the residual voltage.',
      hint: 'Sheet step 3: the voltage comes from the magnetism left in the poles.',
      check: (c) =>
        atRatedSpeed(c) &&
        Math.abs(machine(c)?.shuntAmps ?? 1) < 0.002 &&
        armatureVolts(c) !== null,
      record: (c) =>
        `Residual voltage ${armatureVolts(c)?.toFixed(1)} V at ${machine(c)!.rpm.toFixed(0)} rpm`,
    },
    {
      text: 'Raise If in steps of 0.1 A up to 0.6 A, recording Eo at each step (Record).',
      check: (c) => (c.bench.machines?.mg?.peakFieldAmps ?? 0) >= 0.59,
    },
    {
      text: 'Now lower If in steps back to 0, recording the falling curve.',
      check: (c) =>
        (c.bench.machines?.mg?.peakFieldAmps ?? 0) >= 0.59 &&
        Math.abs(machine(c)?.shuntAmps ?? 1) < 0.05,
    },
    {
      text: 'Part B. Self-excited: A1 → field rheostat → ammeter → F1; F2 → A2 (field across its own armature). Leave the voltmeter on A1–A2.',
      check: (c) => excitationMode(c) === 'self' && c.meterInSeries('mg.shunt', 'meter'),
    },
    {
      text: 'With the set running, let the voltage build up, then take both tables again.',
      hint: 'No build-up? Reduce the field rheostat (below the critical resistance), or swap the F1–F2 leads: a reversed field cancels the residual flux.',
      check: (c) =>
        excitationMode(c) === 'self' && atRatedSpeed(c) && (armatureVolts(c) ?? 0) > 150,
      record: (c) =>
        `Built up to ${armatureVolts(c)?.toFixed(1)} V with If = ${fieldAmps(c)?.toFixed(2)} A`,
    },
  ],
  tables: [...occTables('separate', 'A'), ...occTables('self', 'B')],
  createBench: () => generatorBench('dcm-occ'),
};
