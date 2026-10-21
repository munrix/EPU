import type { LabProfile } from '../domain/models';
import { experiments } from '../experiments/catalog';

export const dcProfile: LabProfile = {
  id: 'dc',
  title: 'DC circuits',
  equipmentDefinitionIds: ['dc-supply-v1', 'resistor-v1', 'resistor-unknown-v1', 'dt9205a-v1'],
  experimentIds: experiments.filter((e) => e.profileId === 'dc').map((e) => e.id),
};
