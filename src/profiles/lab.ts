import type { LabProfile } from '../domain/models';
import { labEquipment } from '../equipment/lab';
import { experiments } from '../experiments/catalog';

/** The EPU lab benches, reproduced from photographs. */
export const epuLabProfile: LabProfile = {
  id: 'epu-lab',
  title: 'EPU lab benches',
  equipmentDefinitionIds: [...labEquipment.map((d) => d.id), 'dt9205a-v1'],
  experimentIds: experiments.filter((e) => e.profileId === 'epu-lab').map((e) => e.id),
};
