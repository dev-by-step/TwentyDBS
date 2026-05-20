import { randomUUID } from 'node:crypto';

import {
  DEFAULT_INTERNAL_ENTITY_SEEDS,
  type InternalEntitySeed,
} from 'src/modules/internal-entity/constants/internal-entity-seeds.constant';
import { type CsvOpportunityRow } from 'src/modules/internal-entity/services/import-csv-opportunities-parser.service';

const DEFAULT_COLOR = '#2563EB';
const DEFAULT_ENTITY_NAME =
  DEFAULT_INTERNAL_ENTITY_SEEDS[0]?.name ?? 'WEKNOW';

export const buildInternalEntitySeed = (
  overrides: Partial<InternalEntitySeed> = {},
): InternalEntitySeed => ({
  id: randomUUID(),
  name: `ENTITY_${randomUUID().slice(0, 8).toUpperCase()}`,
  color: DEFAULT_COLOR,
  ...overrides,
});

export const buildCsvOpportunityRow = (
  overrides: Partial<CsvOpportunityRow> = {},
): CsvOpportunityRow => ({
  id: randomUUID(),
  name: `Deal ${randomUUID().slice(0, 8)}`,
  entityName: DEFAULT_ENTITY_NAME,
  amount: 1200,
  currency: 'EUR',
  companyId: null,
  personId: null,
  stage: 'NEW',
  ...overrides,
});
