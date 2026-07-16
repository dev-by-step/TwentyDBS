import { access, readFile, stat } from 'node:fs/promises';

import { faker } from '@faker-js/faker';
import { type QueryRunner } from 'typeorm';

import { type WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { type GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';
import { buildWorkspaceRecord } from 'src/modules/internal-entity/__tests__/factories/workspace-record.factory';
import {
  buildRawCsvOpportunityCsv,
  buildRawCsvOpportunityRow,
} from 'src/modules/internal-entity/__tests__/factories/raw-csv-opportunity-row.factory';
import { ImportCsvCommand } from 'src/modules/internal-entity/commands/import-csv.command';
import { INTERNAL_ENTITY_SEEDS } from 'src/modules/internal-entity/constants/internal-entity-seeds.constant';
import { type InternalEntityConfigurationService } from 'src/modules/internal-entity/services/internal-entity-configuration.service';
import { INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS } from 'src/modules/internal-entity/utils/internal-entity-command.utils';

type FullCsvOpportunityRow = {
  id: string;
  name: string;
  entityName: string | null;
  amount: number;
  currency: string;
  companyId: string | null;
  personId: string | null;
  stage: string;
};

type MockLogger = {
  log: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

type MockQueryRunner = QueryRunner & {
  connect: jest.Mock;
  startTransaction: jest.Mock;
  commitTransaction: jest.Mock;
  rollbackTransaction: jest.Mock;
  release: jest.Mock;
  isTransactionActive: boolean;
};

type DataSourceQueryCall = [
  query: string,
  parameters?: unknown[],
  queryRunner?: QueryRunner,
  options?: unknown,
];

jest.mock('node:fs/promises', () => ({
  access: jest.fn(),
  readFile: jest.fn(),
  stat: jest.fn(),
}));

const buildQueryRunner = (): MockQueryRunner => {
  const queryRunner = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn(async () => {
      queryRunner.isTransactionActive = true;
    }),
    commitTransaction: jest.fn(async () => {
      queryRunner.isTransactionActive = false;
    }),
    rollbackTransaction: jest.fn(async () => {
      queryRunner.isTransactionActive = false;
    }),
    release: jest.fn().mockResolvedValue(undefined),
    isTransactionActive: false,
  } as MockQueryRunner;

  return queryRunner;
};

const setCommandLogger = (command: unknown): MockLogger => {
  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  (command as { logger: MockLogger }).logger = logger;

  return logger;
};

const buildFullCsvOpportunityRow = (
  overrides: Partial<FullCsvOpportunityRow> = {},
): FullCsvOpportunityRow => ({
  id: faker.string.uuid(),
  name: 'Default Opportunity',
  entityName: 'WEKNOW',
  amount: 0,
  currency: 'EUR',
  companyId: null,
  personId: null,
  stage: 'NEW',
  ...overrides,
});

const buildFixtureCsvContent = (rows: FullCsvOpportunityRow[]) =>
  buildRawCsvOpportunityCsv({
    rows: rows.map((row) =>
      buildRawCsvOpportunityRow({
        Id: row.id,
        Nom: row.name,
        Société: row.entityName ? JSON.stringify([row.entityName]) : '',
        'Montant / Amount': String(row.amount),
        'Montant / Currency': row.currency,
        'Entreprise Id': row.companyId ?? '',
        'Point de contact Id': row.personId ?? '',
        Étape: row.stage,
      }),
    ),
  });

describe('ImportCsvCommand', () => {
  const mockedAccess = access as jest.MockedFunction<typeof access>;
  const mockedReadFile = readFile as jest.MockedFunction<typeof readFile>;
  const mockedStat = stat as jest.MockedFunction<typeof stat>;

  beforeEach(() => {
    mockedAccess.mockResolvedValue(undefined);
  });

  const buildCommandContext = (
    csvRows: FullCsvOpportunityRow[] | null = null,
  ) => {
    const workspace = buildWorkspaceRecord();
    const defaultRows: FullCsvOpportunityRow[] = [
      buildFullCsvOpportunityRow({
        id: '510dc787-4e71-46d5-bdf2-28676e5ecfdf',
        name: 'WeKnow POC',
        entityName: 'WEKNOW',
        amount: 6000,
        currency: 'EUR',
        companyId: '003f2bd8-d8a5-4efd-b4af-4fd094214bb3',
        personId: 'a627b96e-25b5-48fb-bb6f-d42b443f8f81',
        stage: 'GAGNE',
      }),
      buildFullCsvOpportunityRow({
        id: 'b45bba5c-2308-4c58-b3ef-0c31c5f808d7',
        name: 'Lockup APP',
        entityName: 'DEVBYSTEP',
        amount: 11400,
        currency: 'EUR',
        companyId: '600d1bd7-89ea-4d8f-8e80-b2ae04ef8946',
        personId: '77f10d29-0fd0-4dc3-af0f-b2914ad1fa65',
        stage: 'PROPOSITION_ENVOYEE',
      }),
      buildFullCsvOpportunityRow({
        entityName: 'UNKNOWN',
      }),
    ];

    const resolvedRows = csvRows ?? defaultRows;
    const [row1, row2, ignoredRow] = resolvedRows;

    const objectMetadataService = {
      findOneWithinWorkspace: jest.fn().mockImplementation(
        async (
          _workspaceId: string,
          {
            where,
          }: {
            where: {
              nameSingular: string;
            };
          },
        ) => ({
          nameSingular: where.nameSingular,
          isCustom: false,
        }),
      ),
    };
    const queryRunner = buildQueryRunner();
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
      query: jest.fn(
        async (query: string, parameters: unknown[] | undefined) => {
          if (query.includes('INSERT INTO') && query.includes('"company"')) {
            return Array.from(
              { length: (parameters?.length ?? 0) / 3 },
              (_, index) => ({
                id: parameters?.[index * 3],
              }),
            );
          }

          if (query.includes('INSERT INTO') && query.includes('"person"')) {
            return Array.from(
              { length: (parameters?.length ?? 0) / 6 },
              (_, index) => ({
                id: parameters?.[index * 6],
              }),
            );
          }

          if (
            query.includes('INSERT INTO') &&
            query.includes('"opportunity"')
          ) {
            return Array.from(
              { length: (parameters?.length ?? 0) / 9 },
              (_, index) => ({
                id: parameters?.[index * 9],
              }),
            );
          }

          return [];
        },
      ),
    };
    const internalEntityConfigurationService = {
      getInternalEntitySeeds: jest
        .fn()
        .mockReturnValue(Object.values(INTERNAL_ENTITY_SEEDS)),
      resolveInternalEntityId: jest.fn(
        (entityName: string | null) =>
          INTERNAL_ENTITY_SEEDS[entityName ?? '']?.id ?? null,
      ),
    };
    const command = new ImportCsvCommand(
      {} as WorkspaceIteratorService,
      objectMetadataService as unknown as ObjectMetadataService,
      internalEntityConfigurationService as unknown as InternalEntityConfigurationService,
    );
    const logger = setCommandLogger(command);

    return {
      command,
      dataSource: dataSource as unknown as GlobalWorkspaceDataSource,
      dataSourceMock: dataSource,
      ignoredRow,
      logger,
      objectMetadataService,
      queryRunner,
      row1,
      row2,
      workspaceId: workspace.id,
    };
  };

  const mockCsvRows = (rows: FullCsvOpportunityRow[]) => {
    const csvContent = buildFixtureCsvContent(rows);

    mockedStat.mockResolvedValue({
      size: csvContent.length,
    } as Awaited<ReturnType<typeof stat>>);
    mockedReadFile.mockResolvedValue(csvContent);
  };

  it('should build contiguous placeholders without inventing company or person labels', async () => {
    const {
      command,
      dataSource,
      dataSourceMock,
      ignoredRow,
      logger,
      objectMetadataService,
      queryRunner,
      row1,
      row2,
      workspaceId,
    } = buildCommandContext();

    mockCsvRows([row1, row2, ignoredRow]);

    await command.runOnWorkspace({
      workspaceId,
      dataSource,
      options: {},
      index: 0,
      total: 1,
    });

    expect(objectMetadataService.findOneWithinWorkspace).toHaveBeenCalledTimes(
      3,
    );
    expect(queryRunner.connect).toHaveBeenCalledTimes(1);
    expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);

    const queryCalls = dataSourceMock.query.mock.calls as DataSourceQueryCall[];

    const companyInsertCall = queryCalls.find(
      ([query]) =>
        typeof query === 'string' &&
        query.includes('INSERT INTO') &&
        query.includes('"company"'),
    );
    const personInsertCall = queryCalls.find(
      ([query]) =>
        typeof query === 'string' &&
        query.includes('INSERT INTO') &&
        query.includes('"person"'),
    );
    const opportunityInsertCall = queryCalls.find(
      ([query]) =>
        typeof query === 'string' &&
        query.includes('INSERT INTO') &&
        query.includes('"opportunity"'),
    );

    expect(companyInsertCall?.[0]).toContain(
      'VALUES ($1, $2, $3, NOW(), NOW()), ($4, $5, $6, NOW(), NOW())',
    );
    expect(companyInsertCall?.[1]).toStrictEqual([
      row1.companyId,
      null,
      1,
      row2.companyId,
      null,
      2,
    ]);
    expect(companyInsertCall?.[2]).toBe(queryRunner);
    expect(companyInsertCall?.[3]).toBe(INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS);

    expect(personInsertCall?.[0]).toContain(
      'VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()), ($7, $8, $9, $10, $11, $12, NOW(), NOW())',
    );
    expect(personInsertCall?.[1]).toStrictEqual([
      row1.personId,
      null,
      null,
      `${row1.personId}@import.local`,
      row1.companyId,
      1,
      row2.personId,
      null,
      null,
      `${row2.personId}@import.local`,
      row2.companyId,
      2,
    ]);

    expect(opportunityInsertCall?.[0]).toContain(
      'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()), ($10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())',
    );
    expect(opportunityInsertCall?.[1]).toStrictEqual([
      row1.id,
      row1.name,
      row1.amount * 1_000_000,
      row1.currency,
      row1.stage,
      row1.personId,
      row1.companyId,
      INTERNAL_ENTITY_SEEDS.WEKNOW.id,
      1,
      row2.id,
      row2.name,
      row2.amount * 1_000_000,
      row2.currency,
      row2.stage,
      row2.personId,
      row2.companyId,
      INTERNAL_ENTITY_SEEDS.DEVBYSTEP.id,
      2,
    ]);

    expect(logger.warn).toHaveBeenCalledWith(
      `InternalEntity UNKNOWN introuvable, opportunité ${ignoredRow.id} ignorée`,
    );
  });

  it('should stay coherent with the real opportunity CSV fixture', async () => {
    const csvRows: FullCsvOpportunityRow[] = [
      buildFullCsvOpportunityRow({
        id: '510dc787-4e71-46d5-bdf2-28676e5ecfdf',
        name: 'WeKnow POC',
        entityName: 'WEKNOW',
        amount: 6000,
        currency: 'EUR',
        companyId: '003f2bd8-d8a5-4efd-b4af-4fd094214bb3',
        personId: 'a627b96e-25b5-48fb-bb6f-d42b443f8f81',
        stage: 'GAGNE',
      }),
      buildFullCsvOpportunityRow({
        id: '497ff55a-3288-4c04-b07a-6236dfb0e9db',
        name: 'WeKnow',
        entityName: 'WEKNOW',
        amount: 17480,
        currency: 'EUR',
        companyId: '4f4a99a1-c23a-42fc-ade9-82d5b8e4abf0',
        personId: null,
        stage: 'PROPOSITION_ENVOYEE',
      }),
      buildFullCsvOpportunityRow({
        id: '3acd130d-2e00-407c-9dcd-7ea6aa2a1da6',
        name: 'WeKnow',
        entityName: 'WEKNOW',
        amount: 23880,
        currency: 'EUR',
        companyId: '7e52732e-b8a4-47b3-bccd-6474f8512c32',
        personId: '83dfa94d-f251-4933-8c88-4ebe6e2fd34d',
        stage: 'PROPOSITION_ENVOYEE',
      }),
      buildFullCsvOpportunityRow({
        id: 'b45bba5c-2308-4c58-b3ef-0c31c5f808d7',
        name: 'Lockup APP',
        entityName: 'DEVBYSTEP',
        amount: 11400,
        currency: 'EUR',
        companyId: '600d1bd7-89ea-4d8f-8e80-b2ae04ef8946',
        personId: '77f10d29-0fd0-4dc3-af0f-b2914ad1fa65',
        stage: 'PROPOSITION_ENVOYEE',
      }),
      buildFullCsvOpportunityRow({
        id: 'f0688e4b-e8f1-4e79-9830-eb8a0bdeeff0',
        name: 'Atelier IA',
        entityName: 'ALLSENSIA',
        amount: 1500,
        currency: 'EUR',
        companyId: '2e36a7cf-2fc1-4d38-aa23-1cf81293ac2a',
        personId: null,
        stage: 'GAGNE',
      }),
      buildFullCsvOpportunityRow({
        id: 'c191eba1-4707-41f0-9ff4-165aa15049b3',
        name: 'WeKnow',
        entityName: 'WEKNOW',
        amount: 13080,
        currency: 'EUR',
        companyId: 'c3ee4ed3-f272-436c-a953-352c68e213c2',
        personId: 'ead6a76c-a7eb-460a-b607-9380f83c3b9f',
        stage: 'PROPOSITION_ENVOYEE',
      }),
      buildFullCsvOpportunityRow({
        id: '3a9467a9-22b7-48e6-9937-472d29317580',
        name: 'WeKnow',
        entityName: 'WEKNOW',
        amount: 28800,
        currency: 'EUR',
        companyId: 'a38a99f8-3f45-4d76-b64d-af303792f187',
        personId: null,
        stage: 'PROPOSITION_ENVOYEE',
      }),
      buildFullCsvOpportunityRow({
        id: '3d57ac11-62f1-421c-a5f7-aa5559aa58f3',
        name: 'WeKnow',
        entityName: 'WEKNOW',
        amount: 23280,
        currency: 'EUR',
        companyId: '25b70fbe-0897-4a9a-b6bc-ffc9c32082d5',
        personId: null,
        stage: 'PROPOSITION_ENVOYEE',
      }),
      buildFullCsvOpportunityRow({
        id: 'bf23a382-02e3-4108-82b5-04fd6e243a05',
        name: 'WeKnow POC',
        entityName: 'WEKNOW',
        amount: 0,
        currency: 'EUR',
        companyId: '0da4097e-638a-4fa0-94a7-e507c1486322',
        personId: null,
        stage: 'PROPOSITION_A_TRAITER',
      }),
      buildFullCsvOpportunityRow({
        id: '4c615043-745c-4456-8fa9-be7194d8d006',
        name: 'WeKnow Bilbao',
        entityName: 'WEKNOW',
        amount: 0,
        currency: 'EUR',
        companyId: 'a9711843-4577-4737-b144-3e18626b502b',
        personId: null,
        stage: 'RDV_PLANIFIE',
      }),
    ];

    const { command, dataSource, dataSourceMock, logger, workspaceId } =
      buildCommandContext(csvRows);

    mockCsvRows(csvRows);

    await command.runOnWorkspace({
      workspaceId,
      dataSource,
      options: {},
      index: 0,
      total: 1,
    });

    const queryCalls = dataSourceMock.query.mock.calls as DataSourceQueryCall[];

    const companyInsertCall = queryCalls.find(
      ([query]) =>
        typeof query === 'string' &&
        query.includes('INSERT INTO') &&
        query.includes('"company"'),
    );
    const personInsertCall = queryCalls.find(
      ([query]) =>
        typeof query === 'string' &&
        query.includes('INSERT INTO') &&
        query.includes('"person"'),
    );
    const opportunityInsertCall = queryCalls.find(
      ([query]) =>
        typeof query === 'string' &&
        query.includes('INSERT INTO') &&
        query.includes('"opportunity"'),
    );

    expect(companyInsertCall?.[1]).toHaveLength(30);
    expect(personInsertCall?.[1]).toHaveLength(24);
    expect(opportunityInsertCall?.[1]).toHaveLength(90);

    expect(companyInsertCall?.[1]).toEqual(
      expect.arrayContaining([
        csvRows[0].companyId,
        null,
        1,
        csvRows[9].companyId,
        null,
        10,
      ]),
    );

    expect(personInsertCall?.[1]).toStrictEqual([
      csvRows[0].personId,
      null,
      null,
      `${csvRows[0].personId}@import.local`,
      csvRows[0].companyId,
      1,
      csvRows[2].personId,
      null,
      null,
      `${csvRows[2].personId}@import.local`,
      csvRows[2].companyId,
      2,
      csvRows[3].personId,
      null,
      null,
      `${csvRows[3].personId}@import.local`,
      csvRows[3].companyId,
      3,
      csvRows[5].personId,
      null,
      null,
      `${csvRows[5].personId}@import.local`,
      csvRows[5].companyId,
      4,
    ]);

    expect(opportunityInsertCall?.[1]).toEqual(
      expect.arrayContaining([
        csvRows[0].id,
        csvRows[0].name,
        csvRows[0].amount * 1_000_000,
        INTERNAL_ENTITY_SEEDS.WEKNOW.id,
        csvRows[3].id,
        csvRows[3].name,
        csvRows[3].amount * 1_000_000,
        INTERNAL_ENTITY_SEEDS.DEVBYSTEP.id,
        csvRows[4].id,
        csvRows[4].name,
        csvRows[4].amount * 1_000_000,
        INTERNAL_ENTITY_SEEDS.ALLSENSIA.id,
      ]),
    );

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenLastCalledWith(
      'Import terminé : 10 entreprise(s), 4 personne(s), 10 opportunité(s)',
    );
  });
});
