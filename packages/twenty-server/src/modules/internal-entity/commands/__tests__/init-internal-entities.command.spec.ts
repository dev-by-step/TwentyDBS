import { randomUUID } from 'node:crypto';

import {
  buildCsvOpportunityRow,
  buildInternalEntitySeed,
} from 'src/modules/internal-entity/__tests__/internal-entity-test.factory';
import { type WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type FieldMetadataService } from 'src/engine/metadata-modules/field-metadata/services/field-metadata.service';
import { type WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { type ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { type GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';
import { InitInternalEntitiesCommand } from 'src/modules/internal-entity/commands/init-internal-entities.command';
import { buildUnknownInternalEntitiesCsvWarning } from 'src/modules/internal-entity/constants/import-csv-opportunities.constant';
import { type InternalEntityConfigurationService } from 'src/modules/internal-entity/services/internal-entity-configuration.service';
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
  backfillCompanyMembershipsFromOpportunities: (
    dataSource: GlobalWorkspaceDataSource,
    opportunitySqlTable: string,
    companyEntityMembershipSqlTable: string,
  ) => Promise<void>;
  backfillPersonMembershipsFromCompanies: (
    dataSource: GlobalWorkspaceDataSource,
    personSqlTable: string,
    companyEntityMembershipSqlTable: string,
    personEntityMembershipSqlTable: string,
  ) => Promise<void>;
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

describe('InitInternalEntitiesCommand', () => {
  const buildCommandContext = (csvRows: CsvOpportunityRow[] = []) => {
    const workspaceId = randomUUID();
    const configuredInternalEntity = buildInternalEntitySeed({
      name: 'WEKNOW',
    });
    const importCsvOpportunitiesParserService = {
      readCsvOpportunities: jest.fn().mockResolvedValue(csvRows),
    };
    const internalEntityConfigurationService = {
      getInternalEntitySeeds: jest
        .fn()
        .mockReturnValue([configuredInternalEntity]),
      resolveInternalEntityId: jest.fn((entityName: string | null) =>
        entityName === configuredInternalEntity.name
          ? configuredInternalEntity.id
          : null,
      ),
    };
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ id: randomUUID() }]),
    };
    const command = new InitInternalEntitiesCommand(
      {} as WorkspaceIteratorService,
      {} as ObjectMetadataService,
      {} as FieldMetadataService,
      {} as WorkspaceManyOrAllFlatEntityMapsCacheService,
      internalEntityConfigurationService as unknown as InternalEntityConfigurationService,
      importCsvOpportunitiesParserService as unknown as ImportCsvOpportunitiesParserService,
    );
    const logger = setCommandLogger(command);

    return {
      command,
      commandInternals:
        command as unknown as InitInternalEntitiesCommandInternals,
      configuredInternalEntity,
      dataSource: dataSource as unknown as GlobalWorkspaceDataSource,
      dataSourceMock: dataSource,
      internalEntityConfigurationService,
      importCsvOpportunitiesParserService,
      logger,
      workspaceId,
    };
  };

  it('should seed internal entities in a single upsert query', async () => {
    const {
      commandInternals,
      configuredInternalEntity,
      dataSource,
      dataSourceMock,
      workspaceId,
    } = buildCommandContext();

    await commandInternals.seedInternalEntities(
      dataSource,
      '"workspace_abc"."internalEntity"',
      workspaceId,
    );

    expect(dataSourceMock.query).toHaveBeenCalledTimes(1);

    const [query, parameters, queryRunner, options] =
      dataSourceMock.query.mock.calls[0];

    expect(query).toContain('INSERT INTO "workspace_abc"."internalEntity"');
    expect(query).toContain('ON CONFLICT ("id") DO UPDATE');
    expect(query).toContain('VALUES ($1, $2, $3, $4, 0, NOW(), NOW())');
    expect(parameters).toStrictEqual([
      configuredInternalEntity.id,
      configuredInternalEntity.name,
      configuredInternalEntity.color,
      workspaceId,
    ]);
    expect(queryRunner).toBeUndefined();
    expect(options).toBe(INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS);
  });

  it('should backfill opportunities in one batch and skip unknown entities', async () => {
    const opportunityRow = buildCsvOpportunityRow({
      entityName: 'WEKNOW',
    });
    const unknownEntityRow = buildCsvOpportunityRow({
      entityName: 'UNKNOWN',
    });
    const {
      commandInternals,
      configuredInternalEntity,
      dataSource,
      dataSourceMock,
      logger,
    } = buildCommandContext([opportunityRow, unknownEntityRow]);

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
      opportunityRow.id,
      configuredInternalEntity.id,
    ]);
    expect(queryRunner).toBeUndefined();
    expect(options).toBe(INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS);
    expect(logger.warn).toHaveBeenCalledWith(
      buildUnknownInternalEntitiesCsvWarning(['UNKNOWN']),
    );
  });

  it('should not run a fallback update when no CSV entity can be resolved', async () => {
    const unknownEntityRow = buildCsvOpportunityRow({
      entityName: 'UNKNOWN',
    });
    const { commandInternals, dataSource, dataSourceMock, logger } =
      buildCommandContext([unknownEntityRow]);

    await commandInternals.backfillOpportunities(
      dataSource,
      '"workspace_abc"."opportunity"',
    );

    expect(dataSourceMock.query).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      buildUnknownInternalEntitiesCsvWarning(['UNKNOWN']),
    );
  });

  it('should backfill company memberships from tagged opportunities', async () => {
    const {
      commandInternals,
      configuredInternalEntity,
      dataSource,
      dataSourceMock,
      logger,
    } = buildCommandContext();
    const companyId = randomUUID();

    dataSourceMock.query
      .mockResolvedValueOnce([
        {
          recordId: companyId,
          internalEntityId: configuredInternalEntity.id,
        },
      ])
      .mockResolvedValueOnce([]);

    await commandInternals.backfillCompanyMembershipsFromOpportunities(
      dataSource,
      '"workspace_abc"."opportunity"',
      '"workspace_abc"."companyEntityMembership"',
    );

    expect(dataSourceMock.query).toHaveBeenCalledTimes(2);

    const [selectQuery, selectParameters, selectQueryRunner, selectOptions] =
      dataSourceMock.query.mock.calls[0];

    expect(selectQuery).toContain('SELECT DISTINCT opportunity."companyId"');
    expect(selectQuery).toContain('opportunity."internalEntityId"');
    expect(selectParameters).toStrictEqual([]);
    expect(selectQueryRunner).toBeUndefined();
    expect(selectOptions).toBe(INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS);

    const [insertQuery, insertParameters, insertQueryRunner, insertOptions] =
      dataSourceMock.query.mock.calls[1];

    expect(insertQuery).toContain(
      'INSERT INTO "workspace_abc"."companyEntityMembership"',
    );
    expect(insertQuery).toContain('"companyId"');
    expect(insertQuery).toContain('source.internal_entity_id');
    expect(insertParameters).toHaveLength(3);
    expect(insertParameters[1]).toBe(companyId);
    expect(insertParameters[2]).toBe(configuredInternalEntity.id);
    expect(insertQueryRunner).toBeUndefined();
    expect(insertOptions).toBe(INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS);
    expect(logger.log).toHaveBeenCalledWith(
      '1 membership(s) candidat(s) traité(s) pour Company <- Opportunity',
    );
  });

  it('should backfill person memberships from tagged companies', async () => {
    const {
      commandInternals,
      configuredInternalEntity,
      dataSource,
      dataSourceMock,
      logger,
    } = buildCommandContext();
    const personId = randomUUID();

    dataSourceMock.query
      .mockResolvedValueOnce([
        {
          recordId: personId,
          internalEntityId: configuredInternalEntity.id,
        },
      ])
      .mockResolvedValueOnce([]);

    await commandInternals.backfillPersonMembershipsFromCompanies(
      dataSource,
      '"workspace_abc"."person"',
      '"workspace_abc"."companyEntityMembership"',
      '"workspace_abc"."personEntityMembership"',
    );

    expect(dataSourceMock.query).toHaveBeenCalledTimes(2);

    const [selectQuery] = dataSourceMock.query.mock.calls[0];

    expect(selectQuery).toContain('SELECT DISTINCT person."id" AS "recordId"');
    expect(selectQuery).toContain(
      'INNER JOIN "workspace_abc"."companyEntityMembership" company_membership',
    );

    const [insertQuery, insertParameters, insertQueryRunner, insertOptions] =
      dataSourceMock.query.mock.calls[1];

    expect(insertQuery).toContain(
      'INSERT INTO "workspace_abc"."personEntityMembership"',
    );
    expect(insertQuery).toContain('"personId"');
    expect(insertParameters).toHaveLength(3);
    expect(insertParameters[1]).toBe(personId);
    expect(insertParameters[2]).toBe(configuredInternalEntity.id);
    expect(insertQueryRunner).toBeUndefined();
    expect(insertOptions).toBe(INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS);
    expect(logger.log).toHaveBeenCalledWith(
      '1 membership(s) candidat(s) traité(s) pour Person <- Company',
    );
  });
});
