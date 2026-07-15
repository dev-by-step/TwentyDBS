import { faker } from '@faker-js/faker';

import {
  INTERNAL_ENTITY_SEEDS,
  type InternalEntitySeed,
} from 'src/modules/internal-entity/constants/internal-entity-seeds.constant';

export const buildInternalEntityTestRecord = (
  overrides: Partial<InternalEntitySeed> = {},
) => ({
  ...INTERNAL_ENTITY_SEEDS.WEKNOW,
  id: faker.string.uuid(),
  ...overrides,
});

export const buildInternalEntitySeed = buildInternalEntityTestRecord;
