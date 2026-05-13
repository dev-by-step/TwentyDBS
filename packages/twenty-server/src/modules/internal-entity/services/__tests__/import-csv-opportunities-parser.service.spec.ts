import { access, readFile, stat } from 'node:fs/promises';

import {
  buildRawCsvOpportunityCsv,
  buildRawCsvOpportunityRow,
} from 'src/modules/internal-entity/__tests__/factories/raw-csv-opportunity-row.factory';
import {
  buildCompanyRecord,
  buildPersonRecord,
} from 'src/modules/internal-entity/__tests__/factories/workspace-record.factory';
import { ImportCsvOpportunitiesParserService } from 'src/modules/internal-entity/services/import-csv-opportunities-parser.service';

jest.mock('node:fs/promises', () => ({
  access: jest.fn(),
  readFile: jest.fn(),
  stat: jest.fn(),
}));

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
    const company = buildCompanyRecord();
    const person = buildPersonRecord();
    const row1 = buildRawCsvOpportunityRow({
      Nom: 'Deal A',
      Société: JSON.stringify(['WEKNOW']),
      'Montant / Amount': '1200',
      'Montant / Currency': 'USD',
      'Entreprise Id': company.id,
      'Point de contact Id': person.id,
      Étape: 'NEW',
    });
    const row2 = buildRawCsvOpportunityRow({
      Nom: 'Deal B',
      Société: JSON.stringify([' DEVBYSTEP ']),
      'Montant / Amount': '',
      'Montant / Currency': 'EUR',
      'Entreprise Id': '',
      'Point de contact Id': '',
      Étape: 'QUALIFIED',
    });

    mockCsvFile(
      buildRawCsvOpportunityCsv({
        rows: [row1, row2],
      }),
    );

    await expect(service.readCsvOpportunities()).resolves.toStrictEqual([
      {
        id: row1.Id,
        name: 'Deal A',
        entityName: 'WEKNOW',
        amount: 1200,
        currency: 'USD',
        companyId: row1['Entreprise Id'],
        personId: row1['Point de contact Id'],
        stage: 'NEW',
      },
      {
        id: row2.Id,
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
    const rawOpportunityRow = buildRawCsvOpportunityRow({
      Société: '',
    });

    mockCsvFile(
      buildRawCsvOpportunityCsv({
        columns: ['Id', 'Nom', 'Étape'],
        rows: [rawOpportunityRow],
      }),
    );

    await expect(service.readCsvOpportunities()).rejects.toThrow(
      'Colonnes obligatoires manquantes dans le CSV: Société',
    );
  });

  it('should reject invalid opportunity UUIDs', async () => {
    mockCsvFile(
      buildRawCsvOpportunityCsv({
        rows: [
          buildRawCsvOpportunityRow({
            Id: 'not-a-uuid',
            Nom: 'Deal A',
            Société: JSON.stringify(['WEKNOW']),
            'Montant / Amount': '1200',
            'Montant / Currency': 'EUR',
            Étape: 'NEW',
          }),
        ],
      }),
    );

    await expect(service.readCsvOpportunities()).rejects.toThrow(
      'Id ligne 2 invalide: not-a-uuid',
    );
  });

  it('should reject duplicate opportunity IDs', async () => {
    const row = buildRawCsvOpportunityRow({
      Nom: 'Deal A',
    });
    const duplicateRow = buildRawCsvOpportunityRow({
      Id: row.Id,
      Nom: 'Deal B',
    });

    mockCsvFile(
      buildRawCsvOpportunityCsv({
        rows: [row, duplicateRow],
      }),
    );

    await expect(service.readCsvOpportunities()).rejects.toThrow(
      `Id opportunité dupliqué dans le CSV: ${row.Id}`,
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
