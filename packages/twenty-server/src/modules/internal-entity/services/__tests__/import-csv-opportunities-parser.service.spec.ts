import { access, readFile, stat } from 'node:fs/promises';

import { buildCsvOpportunityRow } from 'src/modules/internal-entity/__tests__/factories/csv-opportunity-row.factory';
import {
  buildRawCsvOpportunityCsv,
  buildRawCsvOpportunityRow,
} from 'src/modules/internal-entity/__tests__/factories/raw-csv-opportunity-row.factory';
import {
  buildCompanyRecord,
  buildPersonRecord,
} from 'src/modules/internal-entity/__tests__/factories/workspace-record.factory';
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
    const opportunityRow = buildCsvOpportunityRow({
      companyId: company.id,
      personId: person.id,
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
    const rawOpportunityRow = buildRawCsvOpportunityRow({
      Id: opportunityRow.id,
      Nom: opportunityRow.name,
      Société: JSON.stringify([opportunityRow.entityName]),
      'Montant / Amount': String(opportunityRow.amount),
      'Montant / Currency': opportunityRow.currency,
      'Entreprise Id': opportunityRow.companyId ?? '',
      'Point de contact Id': opportunityRow.personId ?? '',
      Étape: opportunityRow.stage,
    });
    const rawSecondOpportunityRow = buildRawCsvOpportunityRow({
      Id: secondOpportunityRow.id,
      Nom: secondOpportunityRow.name,
      Société: JSON.stringify([` ${secondOpportunityRow.entityName} `]),
      'Montant / Amount': '',
      'Montant / Currency': secondOpportunityRow.currency,
      'Entreprise Id': '',
      'Point de contact Id': '',
      Étape: secondOpportunityRow.stage,
    });

    mockCsvFile(
      buildRawCsvOpportunityCsv({
        rows: [rawOpportunityRow, rawSecondOpportunityRow],
      }),
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
      buildCsvMissingRequiredHeadersError(['Société']),
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
    const opportunityRow = buildCsvOpportunityRow({
      entityName: 'WEKNOW',
    });
    const rawOpportunityRow = buildRawCsvOpportunityRow({
      Id: opportunityRow.id,
      Nom: opportunityRow.name,
      Société: JSON.stringify([opportunityRow.entityName]),
      'Montant / Amount': String(opportunityRow.amount),
      'Montant / Currency': opportunityRow.currency,
      Étape: opportunityRow.stage,
    });
    const duplicateRawOpportunityRow = buildRawCsvOpportunityRow({
      Id: opportunityRow.id,
      Nom: 'Deal B',
      Société: JSON.stringify([opportunityRow.entityName]),
      'Montant / Amount': '1300',
      'Montant / Currency': 'EUR',
      Étape: 'NEW',
    });

    mockCsvFile(
      buildRawCsvOpportunityCsv({
        rows: [rawOpportunityRow, duplicateRawOpportunityRow],
      }),
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
