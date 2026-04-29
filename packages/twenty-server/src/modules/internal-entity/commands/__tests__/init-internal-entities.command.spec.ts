import { type WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type FieldMetadataService } from 'src/engine/metadata-modules/field-metadata/services/field-metadata.service';
import { type WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { type ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { type GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';
import { InitInternalEntitiesCommand } from 'src/modules/internal-entity/commands/init-internal-entities.command';
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

type InitInternalEntitiesCommandInternals = {
  seedInternalEntities: (
    dataSource: GlobalWorkspaceDataSource,
    internalEntitySqlTable: string,
    workspaceId: string,
  ) => Promise<void>;
  backfillOpportunities: (
    dataSource: GlobalWorkspaceDataSource,
    opportunitySqlTable: string,
  ) => Promise<void>;
};

const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';
const OPPORTUNITY_ID = '550e8400-e29b-41d4-a716-446655440001';
const UNKNOWN_OPPORTUNITY_ID = '550e8400-e29b-41d4-a716-446655440002';

const setCommandLogger = (command: unknown): MockLogger => {
  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  (command as { logger: MockLogger }).logger = logger;

  return logger;
};

describe('InitInternalEntitiesCommand', () => {
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

  const buildCommandContext = (csvRows: CsvOpportunityRow[] = []) => {
    const importCsvOpportunitiesParserService = {
      readCsvOpportunities: jest.fn().mockResolvedValue(csvRows),
    };
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ id: OPPORTUNITY_ID }]),
    };
    const command = new InitInternalEntitiesCommand(
      {} as WorkspaceIteratorService,
      {} as ObjectMetadataService,
      {} as FieldMetadataService,
      {} as WorkspaceManyOrAllFlatEntityMapsCacheService,
      importCsvOpportunitiesParserService as unknown as ImportCsvOpportunitiesParserService,
    );
    const logger = setCommandLogger(command);

    return {
      command,
      commandInternals:
        command as unknown as InitInternalEntitiesCommandInternals,
      dataSource: dataSource as unknown as GlobalWorkspaceDataSource,
      dataSourceMock: dataSource,
      importCsvOpportunitiesParserService,
      logger,
    };
  };

  it('should seed internal entities in a single upsert query', async () => {
    const { commandInternals, dataSource, dataSourceMock } =
      buildCommandContext();

    await commandInternals.seedInternalEntities(
      dataSource,
      '"workspace_abc"."internalEntity"',
      WORKSPACE_ID,
    );

    expect(dataSourceMock.query).toHaveBeenCalledTimes(1);

    const [query, parameters, queryRunner, options] =
      dataSourceMock.query.mock.calls[0];

    expect(query).toContain('INSERT INTO "workspace_abc"."internalEntity"');
    expect(query).toContain('ON CONFLICT ("id") DO UPDATE');
    expect(query).toContain('VALUES ($1, $2, $3, $4, 0, NOW(), NOW())');
    expect(parameters).toHaveLength(
      Object.values(INTERNAL_ENTITY_SEEDS).length * 4,
    );
    expect(parameters).toEqual(
      expect.arrayContaining([
        INTERNAL_ENTITY_SEEDS.WEKNOW.id,
        INTERNAL_ENTITY_SEEDS.WEKNOW.name,
        INTERNAL_ENTITY_SEEDS.WEKNOW.color,
        WORKSPACE_ID,
      ]),
    );
    expect(queryRunner).toBeUndefined();
    expect(options).toBe(INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS);
  });

  it('should backfill opportunities in one batch and skip unknown entities', async () => {
    const { commandInternals, dataSource, dataSourceMock, logger } =
      buildCommandContext([opportunityRow, unknownEntityRow]);

    await commandInternals.backfillOpportunities(
      dataSource,
      '"workspace_abc"."opportunity"',
    );

    expect(dataSourceMock.query).toHaveBeenCalledTimes(1);

    const [query, parameters, queryRunner, options] =
      dataSourceMock.query.mock.calls[0];

    expect(query).toContain(
      'UPDATE "workspace_abc"."opportunity" AS opportunity',
    );
    expect(query).toContain(
      'FROM (VALUES ($1::uuid, $2::uuid)) AS csv_values(id, internal_entity_id)',
    );
    expect(query).toContain('RETURNING opportunity.id');
    expect(query).not.toContain('ANGLE_INTELLIGENCE');
    expect(parameters).toStrictEqual([
      OPPORTUNITY_ID,
      INTERNAL_ENTITY_SEEDS.WEKNOW.id,
    ]);
    expect(queryRunner).toBeUndefined();
    expect(options).toBe(INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS);
    expect(logger.warn).toHaveBeenCalledWith(
      'InternalEntity inconnue(s) dans le CSV: UNKNOWN. Ajoutez-les à INTERNAL_ENTITY_SEEDS ou corrigez le CSV avant de relancer.',
    );
  });

  it('should not run a fallback update when no CSV entity can be resolved', async () => {
    const { commandInternals, dataSource, dataSourceMock, logger } =
      buildCommandContext([unknownEntityRow]);

    await commandInternals.backfillOpportunities(
      dataSource,
      '"workspace_abc"."opportunity"',
    );

    expect(dataSourceMock.query).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'InternalEntity inconnue(s) dans le CSV: UNKNOWN. Ajoutez-les à INTERNAL_ENTITY_SEEDS ou corrigez le CSV avant de relancer.',
    );
  });
});
