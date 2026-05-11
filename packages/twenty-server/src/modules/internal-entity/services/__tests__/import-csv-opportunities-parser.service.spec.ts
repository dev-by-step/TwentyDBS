import { access, readFile, stat } from 'node:fs/promises';

import { faker } from '@faker-js/faker';
import { unparse } from 'papaparse';

import { ImportCsvOpportunitiesParserService } from 'src/modules/internal-entity/services/import-csv-opportunities-parser.service';

jest.mock('node:fs/promises', () => ({
  access: jest.fn(),
  readFile: jest.fn(),
  stat: jest.fn(),
}));

const CSV_COLUMNS = [
  'Id',
  'Nom',
  'Société',
  'Montant / Amount',
  'Montant / Currency',
  'Entreprise Id',
  'Point de contact Id',
  'Étape',
] as const;

type CsvRawRow = Record<(typeof CSV_COLUMNS)[number], string>;

const buildCsvRow = (overrides: Partial<CsvRawRow> = {}): CsvRawRow => ({
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

const buildCsv = (rows: CsvRawRow[]): string =>
  unparse(rows, {
    delimiter: ',',
    header: true,
    columns: [...CSV_COLUMNS],
  });

describe('ImportCsvOpportunitiesParserService', () => {
  const mockedAccess = access as jest.MockedFunction<typeof access>;
  const mockedReadFile = readFile as jest.MockedFunction<typeof readFile>;
  const mockedStat = stat as jest.MockedFunction<typeof stat>;

  let service: ImportCsvOpportunitiesParserService;

  beforeEach(() => {
    service = new ImportCsvOpportunitiesParserService();

    mockedAccess.mockResolvedValue(undefined);
  });

  const mockCsvFile = (csvContent: string, size = csvContent.length) => {
    mockedStat.mockResolvedValue({
      size,
    } as Awaited<ReturnType<typeof stat>>);
    mockedReadFile.mockResolvedValue(csvContent);
  };

  it('should parse and validate CSV opportunities', async () => {
    const opportunityId = faker.string.uuid();
    const secondOpportunityId = faker.string.uuid();
    const companyId = faker.string.uuid();
    const personId = faker.string.uuid();

    mockCsvFile(
      buildCsv([
        buildCsvRow({
          Id: opportunityId,
          Nom: 'Deal A',
          Société: JSON.stringify(['WEKNOW']),
          'Montant / Amount': '1200',
          'Montant / Currency': 'USD',
          'Entreprise Id': companyId,
          'Point de contact Id': personId,
          Étape: 'NEW',
        }),
        buildCsvRow({
          Id: secondOpportunityId,
          Nom: 'Deal B',
          Société: JSON.stringify([' DEVBYSTEP ']),
          'Montant / Amount': '',
          'Montant / Currency': 'EUR',
          'Entreprise Id': '',
          'Point de contact Id': '',
          Étape: 'QUALIFIED',
        }),
      ]),
    );

    await expect(service.readCsvOpportunities()).resolves.toStrictEqual([
      {
        id: opportunityId,
        name: 'Deal A',
        entityName: 'WEKNOW',
        amount: 1200,
        currency: 'USD',
        companyId,
        personId,
        stage: 'NEW',
      },
      {
        id: secondOpportunityId,
        name: 'Deal B',
        entityName: 'DEVBYSTEP',
        amount: 0,
        currency: 'EUR',
        companyId: null,
        personId: null,
        stage: 'QUALIFIED',
      },
    ]);
  });

  it('should reject missing required headers', async () => {
    const opportunityId = faker.string.uuid();

    mockCsvFile(`Id,Nom,Étape\n${opportunityId},Deal A,NEW`);

    await expect(service.readCsvOpportunities()).rejects.toThrow(
      'Colonnes obligatoires manquantes dans le CSV: Société',
    );
  });

  it('should reject invalid opportunity UUIDs', async () => {
    mockCsvFile(buildCsv([buildCsvRow({ Id: 'not-a-uuid' })]));

    await expect(service.readCsvOpportunities()).rejects.toThrow(
      'Id ligne 2 invalide: not-a-uuid',
    );
  });

  it('should reject duplicate opportunity IDs', async () => {
    const opportunityId = faker.string.uuid();

    mockCsvFile(
      buildCsv([
        buildCsvRow({ Id: opportunityId, Nom: 'Deal A' }),
        buildCsvRow({ Id: opportunityId, Nom: 'Deal B' }),
      ]),
    );

    await expect(service.readCsvOpportunities()).rejects.toThrow(
      `Id opportunité dupliqué dans le CSV: ${opportunityId}`,
    );
  });

  it('should reject files over the configured size limit before reading them', async () => {
    mockedStat.mockResolvedValue({
      size: 1024 * 1024 + 1,
    } as Awaited<ReturnType<typeof stat>>);

    await expect(service.readCsvOpportunities()).rejects.toThrow(
      'CSV trop volumineux',
    );
    expect(mockedReadFile).not.toHaveBeenCalled();
  });
});
