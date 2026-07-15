import { faker } from '@faker-js/faker';

import { type InternalEntitySeed } from 'src/modules/internal-entity/constants/internal-entity-seeds.constant';

export const buildInternalEntitySeed = (
  overrides: Partial<InternalEntitySeed> = {},
): InternalEntitySeed => ({
  id: faker.string.uuid(),
  name: `ENTITY_${faker.string.alphanumeric(8).toUpperCase()}`,
  color: faker.color.rgb({ format: 'hex' }),
  ...overrides,
});
