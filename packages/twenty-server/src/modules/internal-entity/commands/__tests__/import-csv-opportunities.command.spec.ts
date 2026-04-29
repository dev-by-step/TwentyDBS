import { type QueryRunner } from 'typeorm';

import { type WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { type GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';
import { ImportCsvOpportunitiesCommand } from 'src/modules/internal-entity/commands/import-csv-opportunities.command';
import { INTERNAL_ENTITY_SEEDS } from 'src/modules/internal-entity/constants/internal-entity-seeds.constant';
import {
  type CsvOpportunityRow,
  type ImportCsvOpportunitiesParserService,
} from 'src/modules/internal-entity/services/import-csv-opportunities-parser.service';
import { INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS } from 'src/modules/internal-entity/utils/internal-entity-command.utils';

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

const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';
const OPPORTUNITY_ID = '550e8400-e29b-41d4-a716-446655440001';
const UNKNOWN_OPPORTUNITY_ID = '550e8400-e29b-41d4-a716-446655440002';

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

describe('ImportCsvOpportunitiesCommand', () => {
  const opportunityRow: CsvOpportunityRow = {
    id: OPPORTUNITY_ID,
    name: 'Deal A',
    entityName: 'WEKNOW',
    amount: 1200,
    currency: 'EUR',
    companyId: null,
    personId: null,
    stage: 'NEW',
  };

  const unknownEntityRow: CsvOpportunityRow = {
    ...opportunityRow,
    id: UNKNOWN_OPPORTUNITY_ID,
    entityName: 'UNKNOWN',
  };

  const buildCommandContext = () => {
    const objectMetadataService = {
      findOneWithinWorkspace: jest.fn().mockResolvedValue({
        nameSingular: 'opportunity',
        isCustom: false,
      }),
    };
    const importCsvOpportunitiesParserService = {
      readCsvOpportunities: jest
        .fn()
        .mockResolvedValue([opportunityRow, unknownEntityRow]),
    };
    const queryRunner = buildQueryRunner();
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
      query: jest.fn(async (query: string) => {
        if (query.includes('INSERT INTO')) {
          return [{ id: OPPORTUNITY_ID }];
        }

        if (query.includes('COUNT(*)')) {
          return [{ count: '1' }];
        }

        return [];
      }),
    };
    const command = new ImportCsvOpportunitiesCommand(
      {} as WorkspaceIteratorService,
      objectMetadataService as unknown as ObjectMetadataService,
      importCsvOpportunitiesParserService as unknown as ImportCsvOpportunitiesParserService,
    );
    const logger = setCommandLogger(command);

    return {
      command,
      dataSource: dataSource as unknown as GlobalWorkspaceDataSource,
      dataSourceMock: dataSource,
      importCsvOpportunitiesParserService,
      logger,
      objectMetadataService,
      queryRunner,
    };
  };

  it('should import valid CSV rows in a transaction and skip unknown entities', async () => {
    const {
      command,
      dataSource,
      dataSourceMock,
      logger,
      objectMetadataService,
      queryRunner,
    } = buildCommandContext();

    await command.runOnWorkspace({
      workspaceId: WORKSPACE_ID,
      dataSource,
      options: {},
      index: 0,
      total: 1,
    });

    expect(objectMetadataService.findOneWithinWorkspace).toHaveBeenCalledWith(
      WORKSPACE_ID,
      {
        where: { nameSingular: 'opportunity' },
      },
    );
    expect(queryRunner.connect).toHaveBeenCalledTimes(1);
    expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);

    const queryCalls = dataSourceMock.query.mock.calls as DataSourceQueryCall[];

    const advisoryLockCall = queryCalls.find(
      ([query]) =>
        typeof query === 'string' && query.includes('pg_advisory_xact_lock'),
    );
    const insertCall = queryCalls.find(
      ([query]) => typeof query === 'string' && query.includes('INSERT INTO'),
    );
    const verificationCall = queryCalls.find(
      ([query]) => typeof query === 'string' && query.includes('COUNT(*)'),
    );

    expect(advisoryLockCall?.[1]).toStrictEqual([
      `import-csv-opportunities:${WORKSPACE_ID}`,
    ]);
    expect(insertCall?.[0]).toContain('ON CONFLICT (id) DO NOTHING');
    expect(insertCall?.[0]).toContain('RETURNING id');
    expect(insertCall?.[1]).toStrictEqual([
      OPPORTUNITY_ID,
      'Deal A',
      INTERNAL_ENTITY_SEEDS.WEKNOW.id,
    ]);
    expect(insertCall?.[2]).toBe(queryRunner);
    expect(insertCall?.[3]).toBe(INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS);
    expect(verificationCall?.[1]).toStrictEqual([[OPPORTUNITY_ID]]);
    expect(logger.warn).toHaveBeenCalledWith(
      `InternalEntity UNKNOWN introuvable, opportunité ${UNKNOWN_OPPORTUNITY_ID} ignorée`,
    );
  });

  it('should reject an invalid workspace id before opening a transaction', async () => {
    const { command, dataSourceMock, dataSource } = buildCommandContext();

    await expect(
      command.runOnWorkspace({
        workspaceId: 'workspace;DROP SCHEMA',
        dataSource,
        options: {},
        index: 0,
        total: 1,
      }),
    ).rejects.toThrow('workspaceId invalide: workspace;DROP SCHEMA');

    expect(dataSourceMock.createQueryRunner).not.toHaveBeenCalled();
    expect(dataSourceMock.query).not.toHaveBeenCalled();
  });

  it('should rollback and release the query runner when the insert fails', async () => {
    const { command, dataSource, dataSourceMock, queryRunner } =
      buildCommandContext();
    const insertError = new Error('insert failed');

    dataSourceMock.query.mockImplementation(async (query: string) => {
      if (query.includes('INSERT INTO')) {
        throw insertError;
      }

      return [];
    });

    await expect(
      command.runOnWorkspace({
        workspaceId: WORKSPACE_ID,
        dataSource,
        options: {},
        index: 0,
        total: 1,
      }),
    ).rejects.toThrow(insertError);

    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });
});
