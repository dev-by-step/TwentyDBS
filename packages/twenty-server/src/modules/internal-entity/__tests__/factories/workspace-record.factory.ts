import { faker } from '@faker-js/faker';

export type CompanyRecord = {
  id: string;
  name: string;
};

export type OpportunityRecord = {
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

export type WorkspaceMemberRecord = {
  id: string;
};

export type WorkspaceRecord = {
  id: string;
  name: string;
};

export const buildCompanyRecord = (
  overrides: Partial<CompanyRecord> = {},
): CompanyRecord => ({
  id: faker.string.uuid(),
  name: faker.company.name(),
  ...overrides,
});

export const buildOpportunityRecord = (
  overrides: Partial<OpportunityRecord> = {},
): OpportunityRecord => ({
  id: faker.string.uuid(),
  name: faker.commerce.productName(),
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

export const buildWorkspaceMemberRecord = (
  overrides: Partial<WorkspaceMemberRecord> = {},
): WorkspaceMemberRecord => ({
  id: faker.string.uuid(),
  ...overrides,
});

export const buildWorkspaceRecord = (
  overrides: Partial<WorkspaceRecord> = {},
): WorkspaceRecord => ({
  id: faker.string.uuid(),
  name: faker.company.name(),
  ...overrides,
});
