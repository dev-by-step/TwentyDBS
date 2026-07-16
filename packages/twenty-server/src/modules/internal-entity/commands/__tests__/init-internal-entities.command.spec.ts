import { faker } from '@faker-js/faker';

import { type WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type FieldMetadataService } from 'src/engine/metadata-modules/field-metadata/services/field-metadata.service';
import { type WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { type ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { type RoleService } from 'src/engine/metadata-modules/role/role.service';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { type GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';
import { buildCsvOpportunityRow } from 'src/modules/internal-entity/__tests__/factories/csv-opportunity-row.factory';
import {
  buildCompanyRecord,
  buildPersonRecord,
} from 'src/modules/internal-entity/__tests__/factories/workspace-record.factory';
import { InitInternalEntitiesCommand } from 'src/modules/internal-entity/commands/init-internal-entities.command';
import { INTERNAL_ENTITY_SEEDS } from 'src/modules/internal-entity/constants/internal-entity-seeds.constant';
import { type InternalEntityAuditLoggerService } from 'src/modules/internal-entity/services/internal-entity-audit-logger.service';
import { type InternalEntityConfigurationService } from 'src/modules/internal-entity/services/internal-entity-configuration.service';
import {
  type ImportCsvOpportunitiesParserService,
  OpportunityCsvNotFoundError,
} from 'src/modules/internal-entity/services/import-csv-opportunities-parser.service';
import { INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS } from 'src/modules/internal-entity/utils/internal-entity-command.utils';

type MockLogger = {
  log: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

type InitInternalEntitiesCommandInternals = {
  seedInternalEntities: (args: {
    dataSource: GlobalWorkspaceDataSource;
    internalEntitySqlTable: string;
    opportunitySqlTable: string;
    personEntityMembershipSqlTable: string;
    companyEntityMembershipSqlTable: string;
    workspaceMemberEntityMembershipSqlTable: string;
    calendarEventEntityAudienceSqlTable: string;
    workspaceId: string;
  }) => Promise<void>;
  backfillOpportunities: (
    dataSource: GlobalWorkspaceDataSource,
    opportunitySqlTable: string,
  ) => Promise<boolean>;
  backfillCompanyMembershipsFromOpportunities: (
    dataSource: GlobalWorkspaceDataSource,
    opportunitySqlTable: string,
    companyEntityMembershipSqlTable: string,
  ) => Promise<void>;
  backfillWorkspaceMemberMembershipsFromUsers: (
    dataSource: GlobalWorkspaceDataSource,
    internalEntitySqlTable: string,
    workspaceMemberSqlTable: string,
    workspaceMemberEntityMembershipSqlTable: string,
  ) => Promise<void>;
  backfillPersonMembershipsFromCompanies: (
    dataSource: GlobalWorkspaceDataSource,
    personSqlTable: string,
    companyEntityMembershipSqlTable: string,
    personEntityMembershipSqlTable: string,
  ) => Promise<void>;
  cleanupPrimaryDevWorkspaceMemberships: (args: {
    workspaceId: string;
    dataSource: GlobalWorkspaceDataSource;
    internalEntitySqlTable: string;
    companySqlTable: string;
    personSqlTable: string;
    companyEntityMembershipSqlTable: string;
    personEntityMembershipSqlTable: string;
    workspaceMemberSqlTable: string;
    workspaceMemberEntityMembershipSqlTable: string;
  }) => Promise<void>;
  verifyMigration: (
    dataSource: GlobalWorkspaceDataSource,
    opportunitySqlTable: string,
    options?: {
      shouldThrowOnUnresolvedOpportunities?: boolean;
    },
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
  const buildCommandContext = (csvRows = [buildCsvOpportunityRow()]) => {
    const workspaceId = faker.string.uuid();
    const opportunityId = faker.string.uuid();

    const importCsvOpportunitiesParserService = {
      readCsvOpportunities: jest.fn().mockResolvedValue(csvRows),
    };
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ id: opportunityId }]),
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
    const internalEntityAuditLoggerService = {
      logInternalEntityMerge: jest.fn(),
    };

    const command = new InitInternalEntitiesCommand(
      {} as WorkspaceIteratorService,
      {} as ObjectMetadataService,
      {} as FieldMetadataService,
      {} as WorkspaceManyOrAllFlatEntityMapsCacheService,
      importCsvOpportunitiesParserService as unknown as ImportCsvOpportunitiesParserService,
      {} as RoleService,
      internalEntityConfigurationService as unknown as InternalEntityConfigurationService,
      internalEntityAuditLoggerService as unknown as InternalEntityAuditLoggerService,
    );
    const logger = setCommandLogger(command);

    return {
      workspaceId,
      opportunityId,
      command,
      commandInternals:
        command as unknown as InitInternalEntitiesCommandInternals,
      dataSource: dataSource as unknown as GlobalWorkspaceDataSource,
      dataSourceMock: dataSource,
      importCsvOpportunitiesParserService,
      logger,
    };
  };

  it('should seed internal entities without any repoint or delete query when there is no duplicate', async () => {
    const { commandInternals, dataSource, dataSourceMock, workspaceId } =
      buildCommandContext();

    dataSourceMock.query.mockResolvedValueOnce([]);

    await commandInternals.seedInternalEntities({
      dataSource,
      internalEntitySqlTable: '"workspace_abc"."internalEntity"',
      opportunitySqlTable: '"workspace_abc"."opportunity"',
      personEntityMembershipSqlTable:
        '"workspace_abc"."personEntityMembership"',
      companyEntityMembershipSqlTable:
        '"workspace_abc"."companyEntityMembership"',
      workspaceMemberEntityMembershipSqlTable:
        '"workspace_abc"."workspaceMemberEntityMembership"',
      calendarEventEntityAudienceSqlTable:
        '"workspace_abc"."calendarEventEntityAudience"',
      workspaceId,
    });

    // Duplicate lookup + final upsert only: no repoint, no delete.
    expect(dataSourceMock.query).toHaveBeenCalledTimes(2);

    const [duplicateLookupQuery, duplicateLookupParameters] =
      dataSourceMock.query.mock.calls[0];

    expect(duplicateLookupQuery).toContain(
      'FROM "workspace_abc"."internalEntity"',
    );
    expect(duplicateLookupQuery).toContain('AS "duplicateId"');
    expect(duplicateLookupQuery).toContain('AS "canonicalId"');
    expect(duplicateLookupParameters).toEqual(
      expect.arrayContaining([
        INTERNAL_ENTITY_SEEDS.WEKNOW.id,
        INTERNAL_ENTITY_SEEDS.WEKNOW.name,
        workspaceId,
      ]),
    );

    const [query, parameters, queryRunner, options] =
      dataSourceMock.query.mock.calls[1];

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
        workspaceId,
      ]),
    );
    expect(queryRunner).toBeUndefined();
    expect(options).toBe(INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS);
  });

  it('should repoint every entity reference to the canonical entity before deleting a duplicate', async () => {
    const { commandInternals, dataSource, dataSourceMock, workspaceId } =
      buildCommandContext();
    const duplicateId = faker.string.uuid();
    const canonicalId = INTERNAL_ENTITY_SEEDS.WEKNOW.id;

    dataSourceMock.query.mockResolvedValueOnce([{ duplicateId, canonicalId }]);

    await commandInternals.seedInternalEntities({
      dataSource,
      internalEntitySqlTable: '"workspace_abc"."internalEntity"',
      opportunitySqlTable: '"workspace_abc"."opportunity"',
      personEntityMembershipSqlTable:
        '"workspace_abc"."personEntityMembership"',
      companyEntityMembershipSqlTable:
        '"workspace_abc"."companyEntityMembership"',
      workspaceMemberEntityMembershipSqlTable:
        '"workspace_abc"."workspaceMemberEntityMembership"',
      calendarEventEntityAudienceSqlTable:
        '"workspace_abc"."calendarEventEntityAudience"',
      workspaceId,
    });

    const calls = dataSourceMock.query.mock.calls as Array<[string, unknown[]]>;

    // Lookup, opportunity repoint, 4 junction tables x (dedupe delete +
    // repoint update), calendarChannel repoint, duplicate delete, final
    // upsert.
    expect(calls).toHaveLength(1 + 1 + 4 * 2 + 1 + 1 + 1);

    const opportunityRepoint = calls.find(
      ([query]) =>
        query.includes('UPDATE "workspace_abc"."opportunity"') &&
        query.includes('SET "internalEntityId" = $1'),
    );

    expect(opportunityRepoint?.[1]).toEqual([canonicalId, duplicateId]);

    for (const [table, sourceColumn] of [
      ['personEntityMembership', 'personId'],
      ['companyEntityMembership', 'companyId'],
      ['workspaceMemberEntityMembership', 'workspaceMemberId'],
      ['calendarEventEntityAudience', 'calendarEventId'],
    ]) {
      const dedupeDelete = calls.find(
        ([query]) =>
          query.includes(`DELETE FROM "workspace_abc"."${table}"`) &&
          query.includes(`"${sourceColumn}"`),
      );

      expect(dedupeDelete?.[1]).toEqual([duplicateId, canonicalId]);

      const repointUpdate = calls.find(
        ([query]) =>
          query.includes(`UPDATE "workspace_abc"."${table}"`) &&
          query.includes('SET "internalEntityId" = $1'),
      );

      expect(repointUpdate?.[1]).toEqual([canonicalId, duplicateId]);
    }

    const calendarChannelRepoint = calls.find(([query]) =>
      query.includes('UPDATE core."calendarChannel"'),
    );

    expect(calendarChannelRepoint?.[1]).toEqual([
      duplicateId,
      canonicalId,
      workspaceId,
    ]);

    const duplicateDelete = calls.find(
      ([query]) =>
        query.includes('DELETE FROM "workspace_abc"."internalEntity"') &&
        query.includes('ANY($1::uuid[])'),
    );

    expect(duplicateDelete?.[1]).toEqual([[duplicateId]]);

    const finalUpsert = calls.find(([query]) =>
      query.includes('INSERT INTO "workspace_abc"."internalEntity"'),
    );

    expect(finalUpsert).toBeDefined();
  });

  it('should backfill opportunities in one batch and skip unknown entities', async () => {
    const opportunityRow = buildCsvOpportunityRow({
      entityName: 'WEKNOW',
    });
    const unknownEntityRow = buildCsvOpportunityRow({
      entityName: 'UNKNOWN',
    });
    const { commandInternals, dataSource, dataSourceMock, logger } =
      buildCommandContext([opportunityRow, unknownEntityRow]);

    await expect(
      commandInternals.backfillOpportunities(
        dataSource,
        '"workspace_abc"."opportunity"',
      ),
    ).resolves.toBe(true);

    expect(dataSourceMock.query).toHaveBeenCalledTimes(1);

    const [query, parameters, queryRunner, options] =
      dataSourceMock.query.mock.calls[0];

    expect(query).toContain(
      'UPDATE "workspace_abc"."opportunity" AS opportunity',
    );
    expect(query).toContain('AND opportunity."internalEntityId" IS NULL');
    expect(query).not.toContain('IS DISTINCT FROM');
    expect(query).toContain(
      'FROM (VALUES ($1::uuid, $2::uuid)) AS csv_values(id, internal_entity_id)',
    );
    expect(query).toContain('RETURNING opportunity.id');
    expect(query).not.toContain('ANGLE_INTELLIGENCE');
    expect(parameters).toStrictEqual([
      opportunityRow.id,
      INTERNAL_ENTITY_SEEDS.WEKNOW.id,
    ]);
    expect(queryRunner).toBeUndefined();
    expect(options).toBe(INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS);
    expect(logger.warn).toHaveBeenCalledWith(
      'InternalEntity inconnue(s) dans le CSV: UNKNOWN. Ajoutez-les à INTERNAL_ENTITY_SEEDS ou corrigez le CSV avant de relancer.',
    );
  });

  it('should not run a fallback update when no CSV entity can be resolved', async () => {
    const unknownEntityRow = buildCsvOpportunityRow({ entityName: 'UNKNOWN' });
    const { commandInternals, dataSource, dataSourceMock, logger } =
      buildCommandContext([unknownEntityRow]);

    await expect(
      commandInternals.backfillOpportunities(
        dataSource,
        '"workspace_abc"."opportunity"',
      ),
    ).resolves.toBe(true);

    expect(dataSourceMock.query).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'InternalEntity inconnue(s) dans le CSV: UNKNOWN. Ajoutez-les à INTERNAL_ENTITY_SEEDS ou corrigez le CSV avant de relancer.',
    );
  });

  it('should skip the optional CSV backfill when the local migration file is absent', async () => {
    const {
      commandInternals,
      dataSource,
      dataSourceMock,
      importCsvOpportunitiesParserService,
      logger,
    } = buildCommandContext();

    importCsvOpportunitiesParserService.readCsvOpportunities.mockRejectedValue(
      new OpportunityCsvNotFoundError(),
    );

    await expect(
      commandInternals.backfillOpportunities(
        dataSource,
        '"workspace_abc"."opportunity"',
      ),
    ).resolves.toBe(false);

    expect(dataSourceMock.query).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'docs/opportunity.csv introuvable, backfill CSV ignoré',
    );
  });

  it('should preserve manually reassigned CSV opportunities', async () => {
    const opportunityRow = buildCsvOpportunityRow({
      entityName: 'WEKNOW',
    });
    const { commandInternals, dataSource, dataSourceMock } =
      buildCommandContext([opportunityRow]);

    await expect(
      commandInternals.backfillOpportunities(
        dataSource,
        '"workspace_abc"."opportunity"',
      ),
    ).resolves.toBe(true);

    expect(dataSourceMock.query).toHaveBeenCalledTimes(1);

    const [query, parameters, queryRunner, options] =
      dataSourceMock.query.mock.calls[0];

    expect(query).toContain(
      'UPDATE "workspace_abc"."opportunity" AS opportunity',
    );
    expect(query).toContain('AND opportunity."internalEntityId" IS NULL');
    expect(query).not.toContain('IS DISTINCT FROM');
    expect(query).not.toContain('created_by_user');
    expect(query).not.toContain('owner_user');
    expect(parameters).toStrictEqual([
      opportunityRow.id,
      INTERNAL_ENTITY_SEEDS.WEKNOW.id,
    ]);
    expect(queryRunner).toBeUndefined();
    expect(options).toBe(INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS);
  });

  it('should warn instead of failing when opportunities remain without the optional CSV', async () => {
    const { commandInternals, dataSource, dataSourceMock, logger } =
      buildCommandContext();

    dataSourceMock.query.mockResolvedValueOnce([{ count: '6' }]);

    await expect(
      commandInternals.verifyMigration(
        dataSource,
        '"workspace_abc"."opportunity"',
        {
          shouldThrowOnUnresolvedOpportunities: false,
        },
      ),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      '6 opportunité(s) sans internalEntityId après migration. Ajoutez les entreprises manquantes à INTERNAL_ENTITY_SEEDS, corrigez le CSV ou migrez explicitement ces opportunités.',
    );
  });

  it('should fail when opportunities remain despite an available CSV', async () => {
    const { commandInternals, dataSource, dataSourceMock } =
      buildCommandContext();

    dataSourceMock.query.mockResolvedValueOnce([{ count: '6' }]);

    await expect(
      commandInternals.verifyMigration(
        dataSource,
        '"workspace_abc"."opportunity"',
      ),
    ).rejects.toThrow(
      '6 opportunité(s) sans internalEntityId après migration. Ajoutez les entreprises manquantes à INTERNAL_ENTITY_SEEDS, corrigez le CSV ou migrez explicitement ces opportunités.',
    );
  });

  it('should backfill company memberships from tagged opportunities', async () => {
    const { commandInternals, dataSource, dataSourceMock, logger } =
      buildCommandContext();
    const company = buildCompanyRecord();

    dataSourceMock.query
      .mockResolvedValueOnce([
        {
          recordId: company.id,
          internalEntityId: INTERNAL_ENTITY_SEEDS.WEKNOW.id,
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
    expect(insertParameters[1]).toBe(company.id);
    expect(insertParameters[2]).toBe(INTERNAL_ENTITY_SEEDS.WEKNOW.id);
    expect(insertQueryRunner).toBeUndefined();
    expect(insertOptions).toBe(INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS);
    expect(logger.log).toHaveBeenCalledWith(
      '1 membership(s) candidat(s) traité(s) pour Company <- Opportunity',
    );
  });

  it('should backfill all internal entities for full admin workspace members', async () => {
    const { commandInternals, dataSource, dataSourceMock, logger } =
      buildCommandContext();
    const workspaceMemberId = faker.string.uuid();

    dataSourceMock.query
      .mockResolvedValueOnce([
        {
          recordId: workspaceMemberId,
          internalEntityId: INTERNAL_ENTITY_SEEDS.WEKNOW.id,
        },
        {
          recordId: workspaceMemberId,
          internalEntityId: INTERNAL_ENTITY_SEEDS.ANGLE_INTELLIGENCE.id,
        },
      ])
      .mockResolvedValueOnce([]);

    await commandInternals.backfillWorkspaceMemberMembershipsFromUsers(
      dataSource,
      '"workspace_abc"."internalEntity"',
      '"workspace_abc"."workspaceMember"',
      '"workspace_abc"."workspaceMemberEntityMembership"',
    );

    expect(dataSourceMock.query).toHaveBeenCalledTimes(2);

    const [selectQuery, selectParameters, selectQueryRunner, selectOptions] =
      dataSourceMock.query.mock.calls[0];

    expect(selectQuery).toContain('INNER JOIN LATERAL');
    expect(selectQuery).toContain('SELECT core_user."entityId"');
    expect(selectQuery).toContain(
      'FROM "workspace_abc"."internalEntity" internal_entity',
    );
    expect(selectQuery).toContain(
      'core_user."canAccessFullAdminPanel" IS TRUE',
    );
    expect(selectQuery).toContain('internal_entity."deletedAt" IS NULL');
    expect(selectParameters).toStrictEqual([]);
    expect(selectQueryRunner).toBeUndefined();
    expect(selectOptions).toBe(INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS);

    const [insertQuery, insertParameters, insertQueryRunner, insertOptions] =
      dataSourceMock.query.mock.calls[1];

    expect(insertQuery).toContain(
      'INSERT INTO "workspace_abc"."workspaceMemberEntityMembership"',
    );
    expect(insertQuery).toContain('"workspaceMemberId"');
    expect(insertParameters).toHaveLength(6);
    expect(insertParameters).toEqual(
      expect.arrayContaining([
        workspaceMemberId,
        INTERNAL_ENTITY_SEEDS.WEKNOW.id,
        INTERNAL_ENTITY_SEEDS.ANGLE_INTELLIGENCE.id,
      ]),
    );
    expect(insertQueryRunner).toBeUndefined();
    expect(insertOptions).toBe(INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS);
    expect(logger.log).toHaveBeenCalledWith(
      '2 membership(s) candidat(s) traité(s) pour Workspace Member <- User',
    );
  });

  it('should backfill person memberships from tagged companies', async () => {
    const { commandInternals, dataSource, dataSourceMock, logger } =
      buildCommandContext();
    const person = buildPersonRecord();

    dataSourceMock.query
      .mockResolvedValueOnce([
        {
          recordId: person.id,
          internalEntityId: INTERNAL_ENTITY_SEEDS.WEKNOW.id,
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
    expect(insertParameters[1]).toBe(person.id);
    expect(insertParameters[2]).toBe(INTERNAL_ENTITY_SEEDS.WEKNOW.id);
    expect(insertQueryRunner).toBeUndefined();
    expect(insertOptions).toBe(INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS);
    expect(logger.log).toHaveBeenCalledWith(
      '1 membership(s) candidat(s) traité(s) pour Person <- Company',
    );
  });

  it('should prune non canonical demo memberships on the primary dev workspace', async () => {
    const { commandInternals, dataSource, dataSourceMock, logger } =
      buildCommandContext();

    dataSourceMock.query
      .mockResolvedValueOnce([{ id: faker.string.uuid() }])
      .mockResolvedValueOnce([{ id: faker.string.uuid() }]);

    await commandInternals.cleanupPrimaryDevWorkspaceMemberships({
      workspaceId: SEED_APPLE_WORKSPACE_ID,
      dataSource,
      internalEntitySqlTable: '"workspace_abc"."internalEntity"',
      companySqlTable: '"workspace_abc"."company"',
      personSqlTable: '"workspace_abc"."person"',
      companyEntityMembershipSqlTable:
        '"workspace_abc"."companyEntityMembership"',
      personEntityMembershipSqlTable:
        '"workspace_abc"."personEntityMembership"',
      workspaceMemberSqlTable: '"workspace_abc"."workspaceMember"',
      workspaceMemberEntityMembershipSqlTable:
        '"workspace_abc"."workspaceMemberEntityMembership"',
    });

    expect(dataSourceMock.query).toHaveBeenCalledTimes(5);
    expect(dataSourceMock.query.mock.calls[0][0]).toContain(
      'DELETE FROM "workspace_abc"."companyEntityMembership" membership',
    );
    expect(dataSourceMock.query.mock.calls[0][0]).toContain(
      `LOWER(REPLACE(REPLACE(company."name", ' ', ''), '_', ''))`,
    );
    expect(dataSourceMock.query.mock.calls[1][0]).toContain(
      'DELETE FROM "workspace_abc"."personEntityMembership" membership',
    );
    expect(dataSourceMock.query.mock.calls[2][0]).toContain(
      'DELETE FROM "workspace_abc"."workspaceMemberEntityMembership" membership',
    );
    expect(dataSourceMock.query.mock.calls[3][0]).toContain(
      'SELECT workspace_member."id" AS "recordId"',
    );
    expect(dataSourceMock.query.mock.calls[4][0]).toContain(
      'INSERT INTO "workspace_abc"."workspaceMemberEntityMembership"',
    );
    expect(logger.log).toHaveBeenCalledWith(
      '1 company entity membership(s) hors règle supprimé(s)',
    );
    expect(logger.log).toHaveBeenCalledWith(
      '1 person entity membership(s) hors règle supprimé(s)',
    );
  });

  it('should skip demo membership cleanup outside the primary dev workspace', async () => {
    const { commandInternals, dataSource, dataSourceMock } =
      buildCommandContext();

    await commandInternals.cleanupPrimaryDevWorkspaceMemberships({
      workspaceId: faker.string.uuid(),
      dataSource,
      internalEntitySqlTable: '"workspace_abc"."internalEntity"',
      companySqlTable: '"workspace_abc"."company"',
      personSqlTable: '"workspace_abc"."person"',
      companyEntityMembershipSqlTable:
        '"workspace_abc"."companyEntityMembership"',
      personEntityMembershipSqlTable:
        '"workspace_abc"."personEntityMembership"',
      workspaceMemberSqlTable: '"workspace_abc"."workspaceMember"',
      workspaceMemberEntityMembershipSqlTable:
        '"workspace_abc"."workspaceMemberEntityMembership"',
    });

    expect(dataSourceMock.query).not.toHaveBeenCalled();
  });
});
