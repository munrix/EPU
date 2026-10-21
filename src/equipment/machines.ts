import type { EquipmentDefinition } from '../domain/models';

/**
 * DC machines lab (sheet: identification of DC machine terminals A1-A2, F1-F2, D1-D2).
 * The terminal box is unlabeled (1–6) and comes in three internal wirings so the exercise
 * cannot be memorized. Winding values follow the sheet's typical ranges; the inductances are
 * assumptions: armature 2.5 Ω / 20 mH, series field 0.8 Ω / 5 mH, shunt field 220 Ω / 20 H.
 * The lamp is 220 V 100 W at its hot resistance (484 Ω); the variac is 0–250 V, 50 Hz, floating.
 */
export type Winding = 'armature' | 'series' | 'shunt';
export const WINDINGS: Record<Winding, { label: string; ohms: number; henries: number }> = {
  armature: { label: 'Armature (A1–A2)', ohms: 2.5, henries: 0.02 },
  series: { label: 'Series field (D1–D2)', ohms: 0.8, henries: 0.005 },
  shunt: { label: 'Shunt field (F1–F2)', ohms: 220, henries: 20 },
};
export const MACHINE_VARIANTS: Record<string, Record<Winding, [number, number]>> = {
  'dc-machine-v1': { armature: [1, 4], series: [2, 6], shunt: [3, 5] },
  'dc-machine-v2': { armature: [2, 5], series: [1, 3], shunt: [4, 6] },
  'dc-machine-v3': { armature: [3, 6], series: [4, 5], shunt: [1, 2] },
};
const machine = (id: string): EquipmentDefinition => ({
  id,
  name: 'DC machine terminal box',
  kind: 'dc-machine',
  size: { width: 300, height: 330 },
  fixedValues: true,
  limits: {},
  terminals: [1, 2, 3, 4, 5, 6].map((n) => ({
    key: `T${n}`,
    label: String(n),
    x: n % 2 ? 90 : 210,
    y: 110 + Math.floor((n - 1) / 2) * 70,
    color: 'black' as const,
  })),
  components: (Object.keys(WINDINGS) as Winding[]).map((w) => ({
    key: w,
    kind: 'inductor' as const,
    a: `T${MACHINE_VARIANTS[id][w][0]}`,
    b: `T${MACHINE_VARIANTS[id][w][1]}`,
    inductanceHenries: WINDINGS[w].henries,
    seriesOhms: WINDINGS[w].ohms,
  })),
});
export const machineVariants = Object.keys(MACHINE_VARIANTS).map(machine);

export const LAMP_ID = 'lamp-100w-v1';
export const LAMP_HOT_OHMS = (220 * 220) / 100;
export const lamp: EquipmentDefinition = {
  id: LAMP_ID,
  name: 'Test lamp 100 W',
  kind: 'lamp',
  size: { width: 170, height: 230 },
  fixedValues: true,
  limits: {},
  terminals: [
    { key: 'A', label: 'A', x: 45, y: 195, color: 'black' },
    { key: 'B', label: 'B', x: 125, y: 195, color: 'black' },
  ],
  components: [
    { key: 'filament', kind: 'resistor', a: 'A', b: 'B', resistanceOhms: LAMP_HOT_OHMS },
  ],
};

export const VARIAC_ID = 'variac-v1';
export const variac: EquipmentDefinition = {
  id: VARIAC_ID,
  name: 'Variac 0–250 V',
  kind: 'variac',
  size: { width: 260, height: 250 },
  limits: { rmsVolts: [0, 250] },
  terminals: [
    { key: 'L', label: 'OUT', x: 90, y: 215, color: 'red' },
    { key: 'N', label: 'OUT', x: 170, y: 215, color: 'black' },
  ],
  components: [
    {
      key: 'out',
      kind: 'ac-source',
      a: 'L',
      b: 'N',
      rmsVolts: 20,
      frequencyHz: 50,
      phaseDegrees: 0,
      seriesOhms: 0.5,
    },
  ],
};

export const machineEquipment = [...machineVariants, lamp, variac];
