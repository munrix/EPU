import type { Workbench } from '../domain/models';
import { definitionOf, type EquipmentInstance } from '../equipment/registry';
import { defaultMeterSettings } from '../instruments/multimeter';
import { defaultMachineState } from '../machines/dcGenerator';

export function makeBench(
  experimentId: string,
  instances: EquipmentInstance[],
  meterRangeId = defaultMeterSettings.rangeId,
  profileId = 'dc',
): Workbench {
  const meters = instances.filter((i) => definitionOf(i.equipment).kind === 'multimeter');
  return {
    schemaVersion: 3,
    profileId,
    experimentId,
    instrumentSettings: Object.fromEntries(
      meters.map((m) => [m.equipment.id, { ...defaultMeterSettings, rangeId: meterRangeId }]),
    ),
    equipment: instances.map((i) => i.equipment),
    terminals: instances.flatMap((i) => i.terminals),
    components: instances.flatMap((i) => i.components),
    internalLinks: instances.flatMap((i) => i.internalLinks),
    plugs: [],
    cables: [],
    ...machinesFor(instances),
  };
}
const machinesFor = (instances: EquipmentInstance[]) => {
  const sets = instances.filter((i) => definitionOf(i.equipment).kind === 'mg-set');
  return sets.length
    ? { machines: Object.fromEntries(sets.map((i) => [i.equipment.id, defaultMachineState])) }
    : {};
};
