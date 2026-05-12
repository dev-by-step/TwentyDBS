import { faker } from '@faker-js/faker';

export const RAW_CSV_COLUMNS = [
  'Id',
  'Nom',
  'Société',
  'Montant / Amount',
  'Montant / Currency',
  'Entreprise Id',
  'Point de contact Id',
  'Étape',
] as const;

export type RawCsvOpportunityRow = Record<
  (typeof RAW_CSV_COLUMNS)[number],
  string
>;

export const buildRawCsvOpportunityRow = (
  overrides: Partial<RawCsvOpportunityRow> = {},
): RawCsvOpportunityRow => ({
  Id: faker.string.uuid(),
  Nom: faker.commerce.productName(),
  Société: JSON.stringify(['WEKNOW']),
  'Montant / Amount': String(faker.number.int({ min: 100, max: 100_000 })),
  'Montant / Currency': 'EUR',
  'Entreprise Id': '',
  'Point de contact Id': '',
  Étape: 'NEW',
  ...overrides,
});
