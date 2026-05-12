import { faker } from '@faker-js/faker';

export type CompanyRecord = {
  id: string;
  name: string;
};

export type PersonRecord = {
  id: string;
  name: {
    firstName: string;
    lastName: string;
  };
};

export const buildCompanyRecord = (
  overrides: Partial<CompanyRecord> = {},
): CompanyRecord => ({
  id: faker.string.uuid(),
  name: faker.company.name(),
  ...overrides,
});

export const buildPersonRecord = (
  overrides: Partial<PersonRecord> = {},
): PersonRecord => ({
  id: faker.string.uuid(),
  name: {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
  },
  ...overrides,
});
