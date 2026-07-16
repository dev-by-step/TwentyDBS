import { access, readFile, stat } from 'node:fs/promises';

import {
  buildRawCsvOpportunityCsv,
  buildRawCsvOpportunityRow,
} from 'src/modules/internal-entity/__tests__/factories/raw-csv-opportunity-row.factory';
import {
  ImportCsvOpportunitiesParserService,
  OpportunityCsvNotFoundError,
} from 'src/modules/internal-entity/services/import-csv-opportunities-parser.service';

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
    const row1 = buildRawCsvOpportunityRow({
      Nom: 'Deal A',
      Société: JSON.stringify(['WEKNOW']),
      Étape: 'NEW',
    });
    const row2 = buildRawCsvOpportunityRow({
      Nom: 'Deal B',
      Société: JSON.stringify([' DEVBYSTEP ']),
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
      },
      {
        id: row2.Id,
        name: 'Deal B',
        entityName: 'DEVBYSTEP',
      },
    ]);
  });

  it('should reject missing required headers', async () => {
    const rawOpportunityRow = buildRawCsvOpportunityRow({
      Société: '',
    });

    mockCsvFile(
      buildRawCsvOpportunityCsv({
        columns: ['Id', 'Nom'],
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

  it('should reject a non-JSON Société value', async () => {
    mockCsvFile(
      buildRawCsvOpportunityCsv({
        rows: [
          buildRawCsvOpportunityRow({
            Nom: 'Deal A',
            Société: 'WEKNOW',
            Étape: 'NEW',
          }),
        ],
      }),
    );

    await expect(service.readCsvOpportunities()).rejects.toThrow(
      'Société ligne 2 doit être un tableau JSON valide',
    );
  });

  it('should reject an empty JSON array in Société', async () => {
    mockCsvFile(
      buildRawCsvOpportunityCsv({
        rows: [
          buildRawCsvOpportunityRow({
            Nom: 'Deal A',
            Société: JSON.stringify([]),
            Étape: 'NEW',
          }),
        ],
      }),
    );

    await expect(service.readCsvOpportunities()).rejects.toThrow(
      'Société ligne 2 doit être un tableau JSON non vide',
    );
  });

  it('should reject a Société array whose first entry is not a non-empty string', async () => {
    mockCsvFile(
      buildRawCsvOpportunityCsv({
        rows: [
          buildRawCsvOpportunityRow({
            Nom: 'Deal A',
            Société: JSON.stringify([123]),
            Étape: 'NEW',
          }),
        ],
      }),
    );

    await expect(service.readCsvOpportunities()).rejects.toThrow(
      'Société ligne 2 doit contenir une chaîne non vide en première position',
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

  it('should throw a dedicated error when the optional CSV file is absent', async () => {
    mockedAccess.mockRejectedValue(new Error('File not found'));

    await expect(service.readCsvOpportunities()).rejects.toBeInstanceOf(
      OpportunityCsvNotFoundError,
    );
  });
});
