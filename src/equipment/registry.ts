import type {
  ValueField,
  Component,
  Equipment,
  EquipmentDefinition,
  Point,
  Terminal,
  Workbench,
} from '../domain/models';
import { labEquipment } from './lab';
import { networkEquipment } from './network';
import { machineEquipment } from './machines';
import { machineLabEquipment } from './machineLab';

export const equipmentRegistry: Record<string, EquipmentDefinition> = {
  ...Object.fromEntries(
    [...labEquipment, ...networkEquipment, ...machineEquipment, ...machineLabEquipment].map((d) => [
      d.id,
      d,
    ]),
  ),
  'dc-supply-v1': {
    id: 'dc-supply-v1',
    name: 'DC power supply',
    kind: 'dc-supply',
    size: { width: 290, height: 335 },
    terminals: [
      { key: 'positive', label: '+', x: 207, y: 275, color: 'red' },
      { key: 'negative', label: '−', x: 82, y: 275, color: 'black' },
    ],
    components: [
      {
        key: 'source',
        kind: 'dc-source',
        positive: 'positive',
        negative: 'negative',
        voltageVolts: 12,
        currentLimitAmps: 1,
      },
    ],
    limits: { voltageVolts: [0, 60], currentLimitAmps: [0.001, 5] },
  },
  'resistor-v1': {
    id: 'resistor-v1',
    name: 'Resistive load',
    kind: 'resistor',
    size: { width: 225, height: 245 },
    terminals: [
      { key: 'A', label: 'A', x: 53, y: 188, color: 'red' },
      { key: 'B', label: 'B', x: 172, y: 188, color: 'black' },
    ],
    components: [{ key: 'resistor', kind: 'resistor', a: 'A', b: 'B', resistanceOhms: 1000 }],
    limits: { resistanceOhms: [1, 1e6] },
  },
  'resistor-unknown-v1': {
    id: 'resistor-unknown-v1',
    name: 'Unknown resistor',
    kind: 'resistor',
    size: { width: 225, height: 245 },
    terminals: [
      { key: 'A', label: 'A', x: 53, y: 188, color: 'red' },
      { key: 'B', label: 'B', x: 172, y: 188, color: 'black' },
    ],
    components: [{ key: 'resistor', kind: 'resistor', a: 'A', b: 'B', resistanceOhms: 4700 }],
    limits: { resistanceOhms: [1, 1e6] },
    concealValues: true,
  },
  'dt9205a-v1': {
    id: 'dt9205a-v1',
    name: 'DT-9205A multimeter',
    kind: 'multimeter',
    size: { width: 270, height: 470 },
    terminals: [
      { key: '20A', label: '20A', x: 45, y: 390, color: 'black' },
      { key: 'mA', label: 'mA', x: 105, y: 390, color: 'black' },
      { key: 'COM', label: 'COM', x: 165, y: 390, color: 'black' },
      { key: 'V', label: 'VΩ', x: 225, y: 390, color: 'red' },
    ],
    components: [],
    limits: {},
  },
};

export const terminalId = (equipmentId: string, key: string) => `${equipmentId}.${key}`;
export const componentId = (equipmentId: string, key: string) => `${equipmentId}.${key}`;

export function definitionOf(equipment: Pick<Equipment, 'definitionId'>): EquipmentDefinition {
  const definition = equipmentRegistry[equipment.definitionId];
  if (!definition) throw new Error(`Unknown equipment definition: ${equipment.definitionId}`);
  return definition;
}

export interface EquipmentInstance {
  equipment: Equipment;
  terminals: Terminal[];
  components: Component[];
  internalLinks: [string, string][];
}

/** Creates equipment from its definition. Terminal and component IDs derive from the instance ID. */
export function instantiateEquipment(
  definitionId: string,
  id: string,
  position: Point,
  options: {
    label?: string;
    removable?: boolean;
    values?: Partial<Record<ValueField, number>>;
  } = {},
): EquipmentInstance {
  const definition = equipmentRegistry[definitionId];
  if (!definition) throw new Error(`Unknown equipment definition: ${definitionId}`);
  const terminals: Terminal[] = definition.terminals.map((t) => ({
    id: terminalId(id, t.key),
    equipmentId: id,
    label: t.label,
    position: { x: t.x, y: t.y },
    connector: 'banana-4mm',
    color: t.color,
    stackable: true,
    ...(t.earthed ? { earthed: true } : {}),
  }));
  const pin = (key: string) => terminalId(id, key);
  const components: Component[] = definition.components.map((c): Component => {
    const cid = componentId(id, c.key);
    switch (c.kind) {
      case 'resistor':
        return {
          id: cid,
          kind: 'resistor',
          a: pin(c.a),
          b: pin(c.b),
          resistanceOhms: definition.fixedValues
            ? c.resistanceOhms
            : (options.values?.resistanceOhms ?? c.resistanceOhms),
          ...(c.measurementInput ? { measurementInput: true } : {}),
          ...(c.section ? { section: true } : {}),
        };
      case 'dc-source':
        return {
          id: cid,
          kind: 'dc-source',
          positive: pin(c.positive),
          negative: pin(c.negative),
          voltageVolts: c.fixed ? c.voltageVolts : (options.values?.voltageVolts ?? c.voltageVolts),
          currentLimitAmps: c.fixed
            ? c.currentLimitAmps
            : (options.values?.currentLimitAmps ?? c.currentLimitAmps),
          enabled: false,
        };
      case 'capacitor':
        return {
          id: cid,
          kind: 'capacitor',
          a: pin(c.a),
          b: pin(c.b),
          capacitanceFarads: options.values?.capacitanceFarads ?? c.capacitanceFarads,
          polarized: c.polarized,
        };
      case 'inductor':
        return {
          id: cid,
          kind: 'inductor',
          a: pin(c.a),
          b: pin(c.b),
          inductanceHenries: options.values?.inductanceHenries ?? c.inductanceHenries,
          seriesOhms: c.seriesOhms,
        };
      case 'diode':
        return {
          id: cid,
          kind: 'diode',
          anode: pin(c.anode),
          cathode: pin(c.cathode),
          model: c.model,
        };
      case 'npn':
        return {
          id: cid,
          kind: 'npn',
          collector: pin(c.collector),
          base: pin(c.base),
          emitter: pin(c.emitter),
          model: c.model,
        };
      case 'ac-source':
        return {
          id: cid,
          kind: 'ac-source',
          a: pin(c.a),
          b: pin(c.b),
          rmsVolts: options.values?.rmsVolts ?? c.rmsVolts,
          frequencyHz: options.values?.frequencyHz ?? c.frequencyHz,
          phaseDegrees: c.phaseDegrees,
          seriesOhms: c.seriesOhms,
          enabled: false,
        };
    }
  });
  return {
    equipment: {
      id,
      definitionId,
      label: options.label,
      position,
      movable: true,
      removable: options.removable,
      terminalIds: terminals.map((t) => t.id),
      componentIds: components.map((c) => c.id),
    },
    terminals,
    components,
    internalLinks: (definition.internalLinks ?? []).map(([a, b]) => [pin(a), pin(b)]),
  };
}

export function equipmentComponents(bench: Workbench, equipment: Equipment): Component[] {
  return equipment.componentIds
    .map((id) => bench.components.find((c) => c.id === id))
    .filter((c): c is Component => c !== undefined);
}
