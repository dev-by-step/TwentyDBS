import { faker } from '@faker-js/faker';

export type TestInternalEntity = {
  id: string;
  name: string;
  color: string;
};

export const buildInternalEntity = (
  overrides: Partial<TestInternalEntity> = {},
): TestInternalEntity => ({
  id: faker.string.uuid(),
  name: `ENTITY_${faker.string.alphanumeric(8).toUpperCase()}`,
  color: faker.color.rgb({ format: 'hex' }),
  ...overrides,
});
