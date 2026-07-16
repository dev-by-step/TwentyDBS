import { buildCsvOpportunityRow } from 'src/modules/internal-entity/__tests__/factories/csv-opportunity-row.factory';
import { type CsvOpportunityRow } from 'src/modules/internal-entity/services/import-csv-opportunities-parser.service';

export const buildOpportunityCsvFixtureRows = (): CsvOpportunityRow[] => [
  buildCsvOpportunityRow({
    id: '510dc787-4e71-46d5-bdf2-28676e5ecfdf',
    name: 'WeKnow POC',
    entityName: 'WEKNOW',
  }),
  buildCsvOpportunityRow({
    id: '497ff55a-3288-4c04-b07a-6236dfb0e9db',
    name: 'WeKnow',
    entityName: 'WEKNOW',
  }),
  buildCsvOpportunityRow({
    id: '3acd130d-2e00-407c-9dcd-7ea6aa2a1da6',
    name: 'WeKnow',
    entityName: 'WEKNOW',
  }),
  buildCsvOpportunityRow({
    id: 'b45bba5c-2308-4c58-b3ef-0c31c5f808d7',
    name: 'Lockup APP',
    entityName: 'DEVBYSTEP',
  }),
  buildCsvOpportunityRow({
    id: 'f0688e4b-e8f1-4e79-9830-eb8a0bdeeff0',
    name: 'Atelier IA',
    entityName: 'ALLSENSIA',
  }),
  buildCsvOpportunityRow({
    id: 'c191eba1-4707-41f0-9ff4-165aa15049b3',
    name: 'WeKnow',
    entityName: 'WEKNOW',
  }),
  buildCsvOpportunityRow({
    id: '3a9467a9-22b7-48e6-9937-472d29317580',
    name: 'WeKnow',
    entityName: 'WEKNOW',
  }),
  buildCsvOpportunityRow({
    id: '3d57ac11-62f1-421c-a5f7-aa5559aa58f3',
    name: 'WeKnow',
    entityName: 'WEKNOW',
  }),
  buildCsvOpportunityRow({
    id: 'bf23a382-02e3-4108-82b5-04fd6e243a05',
    name: 'WeKnow POC',
    entityName: 'WEKNOW',
  }),
  buildCsvOpportunityRow({
    id: '4c615043-745c-4456-8fa9-be7194d8d006',
    name: 'WeKnow Bilbao',
    entityName: 'WEKNOW',
  }),
];
