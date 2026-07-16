import { faker } from '@faker-js/faker';

import { type CsvOpportunityRow } from 'src/modules/internal-entity/services/import-csv-opportunities-parser.service';

export const buildCsvOpportunityRow = (
  overrides: Partial<CsvOpportunityRow> = {},
): CsvOpportunityRow => ({
  id: faker.string.uuid(),
  name: faker.commerce.productName(),
  entityName: 'WEKNOW',
  ...overrides,
});
