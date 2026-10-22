import type { EquipmentDefinition } from '../domain/models';
import { GENERATOR } from '../machines/dcGenerator';

/**
 * DC machine lab (Esselte Studium set), from the photos in references/machine-lab.
 * Socket placement follows the photos; values that the photos cannot show are assumptions listed
 * in docs/devices/*.md.
 */
export const MG_SET_ID = 'mg-set-v1';
export const FIELD_RHEOSTAT_ID = 'rheostat-field-v1';
export const LOAD_RHEOSTAT_ID = 'rheostat-load-v1';
export const CONSOLE_ID = 'supply-console-v1';
export const LOAD_SWITCH_ID = 'load-switch-v1';

/**
 * Motor–generator set. Only the DC machine's terminal panel carries sockets: F1–F2 (shunt field),
 * A1–A2 (armature), D1–D2 (series field) in two columns, the right column lower, and the small
 * TG pair. The armature EMF and resistance are added by the circuit assembly from the machine
 * state; the field windings are fixed resistors here.
 */
export const MG_PANEL = { x: 40, y: 290, width: 900, height: 200 };
export const MOTOR_BOX_AT = { x: 626, y: 0, width: 232, height: 124 };
export const MOTOR_BOX: [string, number, number][] = [
  ['W2', 686, 30],
  ['U2', 750, 30],
  ['V2', 814, 30],
  ['U1', 686, 92],
  ['V1', 750, 92],
  ['W1', 814, 92],
];
/** DC resistance of each prime-mover winding (assumed, typical for 1.1 kW). */
export const MOTOR_WINDING_OHMS = 7;
const col1 = 520,
  col2 = 620,
  row = (n: number) => MG_PANEL.y + 38 + n * 46;
export const mgSet: EquipmentDefinition = {
  id: MG_SET_ID,
  name: 'Motor–generator set (Esselte Studium)',
  kind: 'mg-set',
  size: { width: 980, height: 510 },
  fixedValues: true,
  limits: {},
  terminals: [
    { key: 'F1', label: 'F1', x: col1, y: row(0), color: 'black' },
    { key: 'F2', label: 'F2', x: col2, y: row(0) + 16, color: 'black' },
    { key: 'A1', label: 'A1', x: col1, y: row(1), color: 'black' },
    { key: 'A2', label: 'A2', x: col2, y: row(1) + 16, color: 'black' },
    { key: 'D1', label: 'D1', x: col1, y: row(2), color: 'black' },
    { key: 'D2', label: 'D2', x: col2, y: row(2) + 16, color: 'black' },
    { key: 'TG1', label: 'TG', x: col1, y: row(3) - 6, color: 'black' },
    { key: 'TG2', label: 'TG', x: col2, y: row(3) + 6, color: 'black' },
    // Prime-mover terminal box (IEC layout): U1 V1 W1 in front, W2 U2 V2 behind, so horizontal
    // links make a star and vertical links make a delta.
    ...MOTOR_BOX.map(([key, x, y]) => ({ key, label: key, x, y, color: 'black' as const })),
  ],
  components: [
    ...(['U', 'V', 'W'] as const).map((p) => ({
      key: `winding-${p}`,
      kind: 'resistor' as const,
      a: `${p}1`,
      b: `${p}2`,
      resistanceOhms: MOTOR_WINDING_OHMS,
      section: true,
    })),
    { key: 'shunt', kind: 'resistor', a: 'F1', b: 'F2', resistanceOhms: GENERATOR.shuntFieldOhms },
    {
      key: 'series',
      kind: 'resistor',
      a: 'D1',
      b: 'D2',
      resistanceOhms: GENERATOR.seriesFieldOhms,
    },
  ],
};

/**
 * Slide rheostat: winding A–B with the slider C. The two sections are separate resistors whose
 * sum is the whole winding; the slider position is their ratio. The rating plates are not
 * photographed: field rheostat 2 kΩ / 1 A and load rheostat 300 Ω / 5 A are assumptions sized
 * for sheets 2–5.
 */
export const RHEOSTATS = {
  [FIELD_RHEOSTAT_ID]: { ohms: 2000, amps: 1, name: 'Field rheostat' },
  [LOAD_RHEOSTAT_ID]: { ohms: 300, amps: 5, name: 'Load rheostat' },
} as const;
/** Contact resistance at the very end of the winding. */
export const SLIDER_CONTACT_OHMS = 0.5;
const rheostat = (id: keyof typeof RHEOSTATS): EquipmentDefinition => {
  const { ohms, name } = RHEOSTATS[id];
  return {
    id,
    name: `${name} (slide)`,
    kind: 'slide-rheostat',
    size: { width: 540, height: 180 },
    limits: { resistanceOhms: [SLIDER_CONTACT_OHMS, ohms + SLIDER_CONTACT_OHMS] },
    terminals: [
      { key: 'A', label: 'A', x: 34, y: 140, color: 'black' },
      { key: 'C', label: 'C', x: 34, y: 46, color: 'black' },
      { key: 'B', label: 'B', x: 506, y: 140, color: 'black' },
    ],
    components: [
      // Slider at the B end on delivery: A–C is the whole winding (the safe start for a field).
      {
        key: 'ac',
        kind: 'resistor',
        a: 'A',
        b: 'C',
        resistanceOhms: ohms + SLIDER_CONTACT_OHMS,
        section: true,
      },
      {
        key: 'cb',
        kind: 'resistor',
        a: 'C',
        b: 'B',
        resistanceOhms: SLIDER_CONTACT_OHMS,
        section: true,
      },
    ],
  };
};
export const fieldRheostat = rheostat(FIELD_RHEOSTAT_ID);
export const loadRheostat = rheostat(LOAD_RHEOSTAT_ID);

/** Slider position 0 (at A) … 1 (at B) from the two section resistances. */
export function sliderPosition(acOhms: number, cbOhms: number): number {
  const total = acOhms + cbOhms - 2 * SLIDER_CONTACT_OHMS;
  return total > 0 ? Math.min(1, Math.max(0, (acOhms - SLIDER_CONTACT_OHMS) / total)) : 0;
}
export function sectionOhms(totalOhms: number, position: number): { ac: number; cb: number } {
  const x = Math.min(1, Math.max(0, position));
  return {
    ac: SLIDER_CONTACT_OHMS + x * totalOhms,
    cb: SLIDER_CONTACT_OHMS + (1 - x) * totalOhms,
  };
}

/**
 * Control and power supply console. Confirmed by the lab: the big knob sets a DC voltage; on the
 * side, the left sockets give 220 V and the middle ones 110 V; every socket is black. Assumed:
 * the knob's output (0–220 V) is on the posts beside the front voltmeter and is metered by the
 * two front meters; START (black) and STOP (red) switch every output; 10 A protection.
 * The front view and the side panel are drawn side by side so every socket is reachable.
 */
export const CONSOLE_FRONT_WIDTH = 400;
export const console220: EquipmentDefinition = {
  id: CONSOLE_ID,
  name: 'Control and power supply console',
  kind: 'supply-console',
  size: { width: 720, height: 470 },
  limits: { voltageVolts: [0, 220] },
  terminals: [
    // Front, beside the upper (voltmeter) meter: variable DC.
    { key: 'VP', label: '+', x: 46, y: 92, color: 'black' },
    { key: 'VN', label: '−', x: 46, y: 140, color: 'black' },
    // Side panel socket block: left column 220 V DC, middle column 110 V DC.
    { key: 'P220', label: '+', x: 492, y: 262, color: 'black' },
    { key: 'N220', label: '−', x: 492, y: 310, color: 'black' },
    { key: 'P110', label: '+', x: 560, y: 262, color: 'black' },
    { key: 'N110', label: '−', x: 560, y: 310, color: 'black' },
  ],
  components: [
    {
      key: 'var',
      kind: 'dc-source',
      positive: 'VP',
      negative: 'VN',
      voltageVolts: 0,
      currentLimitAmps: 10,
    },
    {
      key: 'dc220',
      kind: 'dc-source',
      positive: 'P220',
      negative: 'N220',
      voltageVolts: 220,
      currentLimitAmps: 10,
      fixed: true,
    },
    {
      key: 'dc110',
      kind: 'dc-source',
      positive: 'P110',
      negative: 'N110',
      voltageVolts: 110,
      currentLimitAmps: 10,
      fixed: true,
    },
  ],
};

/**
 * "LASTBRYTARE / LOAD SWITCH 380V ~ 16A": a three-pole rotary switch, 0 / I. Inputs 1, 3, 5 in
 * the left column, outputs 2, 4, 6 in the right column, which starts lower (as photographed).
 * The pole numbering follows the usual switch convention; the plate is not legible.
 */
export const SWITCH_CLOSED_OHMS = 0.002;
export const SWITCH_OPEN_OHMS = 1e9;
export const loadSwitch: EquipmentDefinition = {
  id: LOAD_SWITCH_ID,
  name: 'Load switch (Lastbrytare)',
  kind: 'load-switch',
  size: { width: 260, height: 430 },
  limits: { resistanceOhms: [SWITCH_CLOSED_OHMS, SWITCH_OPEN_OHMS] },
  terminals: [
    { key: '1', label: '1', x: 52, y: 238, color: 'black' },
    { key: '3', label: '3', x: 52, y: 284, color: 'black' },
    { key: '5', label: '5', x: 52, y: 330, color: 'black' },
    { key: '2', label: '2', x: 200, y: 304, color: 'black' },
    { key: '4', label: '4', x: 200, y: 350, color: 'black' },
    { key: '6', label: '6', x: 200, y: 396, color: 'black' },
  ],
  components: ['1', '3', '5'].map((a, i) => ({
    key: `pole${i + 1}`,
    kind: 'resistor' as const,
    a,
    b: String(Number(a) + 1),
    resistanceOhms: SWITCH_OPEN_OHMS,
    section: true,
  })),
};

/**
 * Three-phase supply R S T N, 380 V between lines, 220 V to N, 50 Hz, with a three-pole breaker.
 * The lab confirms the prime mover runs from an R S T source; where those sockets sit on the real
 * benches is not photographed, so this is its own panel for now.
 */
export const THREE_PHASE_ID = 'three-phase-supply-v1';
export const threePhaseSupply: EquipmentDefinition = {
  id: THREE_PHASE_ID,
  name: 'Three-phase supply R S T',
  kind: 'three-phase-supply',
  size: { width: 420, height: 250 },
  limits: {},
  terminals: (['R', 'S', 'T', 'N'] as const).map((key, i) => ({
    key,
    label: key,
    x: 70 + i * 92,
    y: 196,
    color: 'black' as const,
  })),
  components: [],
};

/**
 * Frequency inverter (variable-speed drive) for the prime mover. The sheets vary the generator
 * speed from 200 to 1500 rpm, which a 50 Hz induction motor cannot do on its own; how the lab
 * really does it is not known yet, so this is an assumed, generic V/f drive: L1 L2 L3 in from
 * R S T, U V W out to the motor, 0–55 Hz, RUN / STOP.
 */
export const INVERTER_ID = 'frequency-inverter-v1';
export const INVERTER_DEFAULT_HZ = 47;
export const INVERTER_MAX_HZ = 55;
export const frequencyInverter: EquipmentDefinition = {
  id: INVERTER_ID,
  name: 'Frequency inverter (assumed)',
  kind: 'frequency-inverter',
  size: { width: 300, height: 270 },
  limits: {},
  terminals: [
    ...(['L1', 'L2', 'L3'] as const).map((key, i) => ({
      key,
      label: key,
      x: 60 + i * 90,
      y: 46,
      color: 'black' as const,
    })),
    ...(['U', 'V', 'W'] as const).map((key, i) => ({
      key,
      label: key,
      x: 60 + i * 90,
      y: 226,
      color: 'black' as const,
    })),
  ],
  components: [],
};

export const machineLabEquipment = [
  frequencyInverter,
  mgSet,
  fieldRheostat,
  loadRheostat,
  console220,
  loadSwitch,
  threePhaseSupply,
];
