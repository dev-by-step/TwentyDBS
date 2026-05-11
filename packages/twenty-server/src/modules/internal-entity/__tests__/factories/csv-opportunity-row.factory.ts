import { faker } from '@faker-js/faker';

import { type CsvOpportunityRow } from 'src/modules/internal-entity/services/import-csv-opportunities-parser.service';

export const buildCsvOpportunityRow = (
  overrides: Partial<CsvOpportunityRow> = {},
): CsvOpportunityRow => ({
  id: faker.string.uuid(),
  name: faker.commerce.productName(),
  entityName: 'WEKNOW',
  amount: faker.number.int({ min: 100, max: 100_000 }),
  currency: 'EUR',
  companyId: null,
  personId: null,
  stage: 'NEW',
  ...overrides,
});
