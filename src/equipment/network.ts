import type { EquipmentDefinition } from '../domain/models';

/**
 * Electrical network lab (sheet: measuring power in single-phase circuits, 220 V 50 Hz).
 * Assumptions to confirm: the supply neutral is earthed (TN system) and protected by the
 * bench's 6.3 A breaker; the wattmeter current coil is 0.05 Ω and its voltage coil 20 kΩ;
 * moving-iron ammeter 0–5 A (0.02 Ω) and voltmeter 0–300 V (10 kΩ); loads are a 10–300 Ω
 * rheostat, a 0.2–1.5 H inductor (10 Ω winding) and a 2–40 µF capacitor bank.
 */
export const MAINS_ID = 'mains-supply-v1';
export const WATTMETER_ID = 'wattmeter-v1';
export const PF_METER_ID = 'pf-meter-v1';
export const AC_AMMETER_ID = 'ac-ammeter-v1';
export const AC_VOLTMETER_ID = 'ac-voltmeter-v1';
export const RHEOSTAT_ID = 'rheostat-v1';
export const LOAD_INDUCTOR_ID = 'load-inductor-v1';
export const LOAD_CAPACITOR_ID = 'load-capacitor-v1';
export const MAINS_BREAKER_AMPS = 6.3;

export const mainsSupply: EquipmentDefinition = {
  id: MAINS_ID,
  name: 'Single-phase supply',
  kind: 'mains-supply',
  size: { width: 300, height: 250 },
  limits: {},
  terminals: [
    { key: 'L', label: 'L', x: 90, y: 200, color: 'red' },
    { key: 'N', label: 'N', x: 210, y: 200, color: 'blue', earthed: true },
  ],
  components: [
    {
      key: 'source',
      kind: 'ac-source',
      a: 'L',
      b: 'N',
      rmsVolts: 220,
      frequencyHz: 50,
      phaseDegrees: 0,
      seriesOhms: 0.3,
    },
  ],
};

/** Analog panel meters: current coil between COM and C, voltage coil between COM and V. */
const coilMeter = (
  id: string,
  name: string,
  kind: 'wattmeter' | 'pf-meter',
): EquipmentDefinition => ({
  id,
  name,
  kind,
  size: { width: 250, height: 230 },
  fixedValues: true,
  limits: {},
  terminals: [
    { key: 'COM', label: 'COM', x: 50, y: 195, color: 'black' },
    { key: 'C', label: 'C', x: 125, y: 195, color: 'red' },
    { key: 'V', label: 'V', x: 200, y: 195, color: 'red' },
  ],
  components: [
    { key: 'current', kind: 'resistor', a: 'COM', b: 'C', resistanceOhms: 0.05 },
    {
      key: 'voltage',
      kind: 'resistor',
      a: 'COM',
      b: 'V',
      resistanceOhms: 20000,
      measurementInput: true,
    },
  ],
});
export const wattmeter = coilMeter(WATTMETER_ID, 'Wattmeter', 'wattmeter');
export const pfMeter = coilMeter(PF_METER_ID, 'Power factor meter', 'pf-meter');
export const acAmmeter: EquipmentDefinition = {
  id: AC_AMMETER_ID,
  name: 'AC ammeter 0–5 A',
  kind: 'ac-ammeter',
  size: { width: 200, height: 200 },
  fixedValues: true,
  limits: {},
  terminals: [
    { key: 'A', label: '0', x: 55, y: 165, color: 'black' },
    { key: 'B', label: '5A~', x: 145, y: 165, color: 'red' },
  ],
  components: [{ key: 'coil', kind: 'resistor', a: 'A', b: 'B', resistanceOhms: 0.02 }],
};
export const acVoltmeter: EquipmentDefinition = {
  id: AC_VOLTMETER_ID,
  name: 'AC voltmeter 0–300 V',
  kind: 'ac-voltmeter',
  size: { width: 200, height: 200 },
  fixedValues: true,
  limits: {},
  terminals: [
    { key: 'A', label: '0', x: 55, y: 165, color: 'black' },
    { key: 'B', label: '300V~', x: 145, y: 165, color: 'red' },
  ],
  components: [
    {
      key: 'coil',
      kind: 'resistor',
      a: 'A',
      b: 'B',
      resistanceOhms: 10000,
      measurementInput: true,
    },
  ],
};
export const rheostat: EquipmentDefinition = {
  id: RHEOSTAT_ID,
  name: 'Rheostat',
  kind: 'load',
  size: { width: 340, height: 150 },
  limits: { resistanceOhms: [10, 300] },
  terminals: [
    { key: 'A', label: 'A', x: 35, y: 115, color: 'black' },
    { key: 'B', label: 'B', x: 305, y: 115, color: 'black' },
  ],
  components: [{ key: 'R', kind: 'resistor', a: 'A', b: 'B', resistanceOhms: 150 }],
};
export const loadInductor: EquipmentDefinition = {
  id: LOAD_INDUCTOR_ID,
  name: 'Inductive load',
  kind: 'load',
  size: { width: 340, height: 150 },
  limits: { inductanceHenries: [0.2, 1.5] },
  terminals: [
    { key: 'A', label: 'A', x: 35, y: 115, color: 'black' },
    { key: 'B', label: 'B', x: 305, y: 115, color: 'black' },
  ],
  components: [
    { key: 'L', kind: 'inductor', a: 'A', b: 'B', inductanceHenries: 0.5, seriesOhms: 10 },
  ],
};
export const loadCapacitor: EquipmentDefinition = {
  id: LOAD_CAPACITOR_ID,
  name: 'Capacitive load',
  kind: 'load',
  size: { width: 340, height: 150 },
  limits: { capacitanceFarads: [2e-6, 40e-6] },
  terminals: [
    { key: 'A', label: 'A', x: 35, y: 115, color: 'black' },
    { key: 'B', label: 'B', x: 305, y: 115, color: 'black' },
  ],
  components: [{ key: 'C', kind: 'capacitor', a: 'A', b: 'B', capacitanceFarads: 10e-6 }],
};

export const networkEquipment = [
  mainsSupply,
  wattmeter,
  pfMeter,
  acAmmeter,
  acVoltmeter,
  rheostat,
  loadInductor,
  loadCapacitor,
];
