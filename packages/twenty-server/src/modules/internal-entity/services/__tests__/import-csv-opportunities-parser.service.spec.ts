import { access, readFile, stat } from 'node:fs/promises';

import { ImportCsvOpportunitiesParserService } from 'src/modules/internal-entity/services/import-csv-opportunities-parser.service';

jest.mock('node:fs/promises', () => ({
  access: jest.fn(),
  readFile: jest.fn(),
  stat: jest.fn(),
}));

const OPPORTUNITY_ID = '550e8400-e29b-41d4-a716-446655440001';
const SECOND_OPPORTUNITY_ID = '550e8400-e29b-41d4-a716-446655440002';
const COMPANY_ID = '550e8400-e29b-41d4-a716-446655440003';
const PERSON_ID = '550e8400-e29b-41d4-a716-446655440004';

const CSV_HEADERS = [
  'Id',
  'Nom',
  'Société',
  'Montant / Amount',
  'Montant / Currency',
  'Entreprise Id',
  'Point de contact Id',
  'Étape',
].join(',');

const buildCsv = (rows: string[]): string => [CSV_HEADERS, ...rows].join('\n');

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
    mockCsvFile(
      buildCsv([
        `${OPPORTUNITY_ID},Deal A,"[""WEKNOW""]",1200,USD,${COMPANY_ID},${PERSON_ID},NEW`,
        `${SECOND_OPPORTUNITY_ID},Deal B,"["" DEVBYSTEP ""]",,EUR,,,QUALIFIED`,
      ]),
    );

    await expect(service.readCsvOpportunities()).resolves.toStrictEqual([
      {
        id: OPPORTUNITY_ID,
        name: 'Deal A',
        entityName: 'WEKNOW',
        amount: 1200,
        currency: 'USD',
        companyId: COMPANY_ID,
        personId: PERSON_ID,
        stage: 'NEW',
      },
      {
        id: SECOND_OPPORTUNITY_ID,
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
    mockCsvFile(`Id,Nom,Étape\n${OPPORTUNITY_ID},Deal A,NEW`);

    await expect(service.readCsvOpportunities()).rejects.toThrow(
      'Colonnes obligatoires manquantes dans le CSV: Société',
    );
  });

  it('should reject invalid opportunity UUIDs', async () => {
    mockCsvFile(buildCsv(['not-a-uuid,Deal A,"[""WEKNOW""]",1200,EUR,,,NEW']));

    await expect(service.readCsvOpportunities()).rejects.toThrow(
      'Id ligne 2 invalide: not-a-uuid',
    );
  });

  it('should reject duplicate opportunity IDs', async () => {
    mockCsvFile(
      buildCsv([
        `${OPPORTUNITY_ID},Deal A,"[""WEKNOW""]",1200,EUR,,,NEW`,
        `${OPPORTUNITY_ID},Deal B,"[""WEKNOW""]",1300,EUR,,,NEW`,
      ]),
    );

    await expect(service.readCsvOpportunities()).rejects.toThrow(
      `Id opportunité dupliqué dans le CSV: ${OPPORTUNITY_ID}`,
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
