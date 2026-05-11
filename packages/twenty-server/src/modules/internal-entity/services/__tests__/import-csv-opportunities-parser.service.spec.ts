import { access, readFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import { buildCsvOpportunityRow } from 'src/modules/internal-entity/__tests__/internal-entity-test.factory';
import {
  buildCsvDuplicateOpportunityIdError,
  buildCsvFileTooLargeError,
  buildCsvMissingRequiredHeadersError,
} from 'src/modules/internal-entity/constants/import-csv-opportunities.constant';
import { ImportCsvOpportunitiesParserService } from 'src/modules/internal-entity/services/import-csv-opportunities-parser.service';

jest.mock('node:fs/promises', () => ({
  access: jest.fn(),
  readFile: jest.fn(),
  stat: jest.fn(),
}));

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
    const opportunityRow = buildCsvOpportunityRow({
      companyId: randomUUID(),
      personId: randomUUID(),
      name: 'Deal A',
      entityName: 'WEKNOW',
      currency: 'USD',
    });
    const secondOpportunityRow = buildCsvOpportunityRow({
      name: 'Deal B',
      entityName: 'DEVBYSTEP',
      amount: 0,
      companyId: null,
      currency: 'EUR',
      personId: null,
      stage: 'QUALIFIED',
    });

    mockCsvFile(
      buildCsv([
        `${opportunityRow.id},${opportunityRow.name},"[""${opportunityRow.entityName}""]",${opportunityRow.amount},${opportunityRow.currency},${opportunityRow.companyId},${opportunityRow.personId},${opportunityRow.stage}`,
        `${secondOpportunityRow.id},${secondOpportunityRow.name},"["" ${secondOpportunityRow.entityName} ""]",,${secondOpportunityRow.currency},,,${secondOpportunityRow.stage}`,
      ]),
    );

    await expect(service.readCsvOpportunities()).resolves.toStrictEqual([
      {
        ...opportunityRow,
      },
      {
        ...secondOpportunityRow,
      },
    ]);
  });

  it('should reject missing required headers', async () => {
    const opportunityRow = buildCsvOpportunityRow({
      entityName: null,
    });

    mockCsvFile(
      `Id,Nom,Étape\n${opportunityRow.id},${opportunityRow.name},${opportunityRow.stage}`,
    );

    await expect(service.readCsvOpportunities()).rejects.toThrow(
      buildCsvMissingRequiredHeadersError(['Société']),
    );
  });

  it('should reject invalid opportunity UUIDs', async () => {
    mockCsvFile(buildCsv(['not-a-uuid,Deal A,"[""WEKNOW""]",1200,EUR,,,NEW']));

    await expect(service.readCsvOpportunities()).rejects.toThrow(
      'Id ligne 2 invalide: not-a-uuid',
    );
  });

  it('should reject duplicate opportunity IDs', async () => {
    const opportunityRow = buildCsvOpportunityRow({
      entityName: 'WEKNOW',
    });

    mockCsvFile(
      buildCsv([
        `${opportunityRow.id},${opportunityRow.name},"[""${opportunityRow.entityName}""]",${opportunityRow.amount},${opportunityRow.currency},,,${opportunityRow.stage}`,
        `${opportunityRow.id},Deal B,"[""${opportunityRow.entityName}""]",1300,EUR,,,NEW`,
      ]),
    );

    await expect(service.readCsvOpportunities()).rejects.toThrow(
      buildCsvDuplicateOpportunityIdError(opportunityRow.id),
    );
  });

  it('should reject files over the configured size limit before reading them', async () => {
    mockedStat.mockResolvedValue({
      size: 1024 * 1024 + 1,
    } as Awaited<ReturnType<typeof stat>>);

    await expect(service.readCsvOpportunities()).rejects.toThrow(
      buildCsvFileTooLargeError(1024 * 1024 + 1),
    );
    expect(mockedReadFile).not.toHaveBeenCalled();
  });
});
