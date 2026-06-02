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
  seedInternalEntities: (
    dataSource: GlobalWorkspaceDataSource,
    internalEntitySqlTable: string,
    workspaceMemberEntityMembershipSqlTable: string,
    workspaceId: string,
  ) => Promise<void>;
  backfillOpportunities: (
    dataSource: GlobalWorkspaceDataSource,
    opportunitySqlTable: string,
  ) => Promise<void>;
  backfillOpportunitiesFromWorkspaceMembers: (
    dataSource: GlobalWorkspaceDataSource,
    opportunitySqlTable: string,
    workspaceMemberSqlTable: string,
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
    const command = new InitInternalEntitiesCommand(
      {} as WorkspaceIteratorService,
      {} as ObjectMetadataService,
      {} as FieldMetadataService,
      {} as WorkspaceManyOrAllFlatEntityMapsCacheService,
      importCsvOpportunitiesParserService as unknown as ImportCsvOpportunitiesParserService,
      {} as RoleService,
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

  it('should normalize duplicate internal entities before seeding them', async () => {
    const { commandInternals, dataSource, dataSourceMock, workspaceId } =
      buildCommandContext();

    await commandInternals.seedInternalEntities(
      dataSource,
      '"workspace_abc"."internalEntity"',
      '"workspace_abc"."workspaceMemberEntityMembership"',
      workspaceId,
    );

    expect(dataSourceMock.query).toHaveBeenCalledTimes(3);

    const [membershipUpdateQuery, membershipUpdateParameters] =
      dataSourceMock.query.mock.calls[0];

    expect(membershipUpdateQuery).toContain(
      'UPDATE "workspace_abc"."workspaceMemberEntityMembership"',
    );
    expect(membershipUpdateQuery).toContain('duplicate_entity_ids');
    expect(membershipUpdateQuery).toContain(
      'SET "internalEntityId" = duplicate_entity_ids.canonical_id',
    );
    expect(membershipUpdateParameters).toEqual(
      expect.arrayContaining([
        INTERNAL_ENTITY_SEEDS.WEKNOW.id,
        INTERNAL_ENTITY_SEEDS.WEKNOW.name,
        workspaceId,
      ]),
    );

    const [duplicateDeleteQuery, duplicateDeleteParameters] =
      dataSourceMock.query.mock.calls[1];

    expect(duplicateDeleteQuery).toContain(
      'DELETE FROM "workspace_abc"."internalEntity"',
    );
    expect(duplicateDeleteQuery).toContain('duplicate_entity_ids');
    expect(duplicateDeleteParameters).toEqual(membershipUpdateParameters);

    const [query, parameters, queryRunner, options] =
      dataSourceMock.query.mock.calls[2];

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

  it('should backfill opportunities in one batch and skip unknown entities', async () => {
    const opportunityRow = buildCsvOpportunityRow({
      entityName: 'WEKNOW',
    });
    const unknownEntityRow = buildCsvOpportunityRow({
      entityName: 'UNKNOWN',
    });
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

    await commandInternals.backfillOpportunities(
      dataSource,
      '"workspace_abc"."opportunity"',
    );

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
    ).resolves.toBeUndefined();

    expect(dataSourceMock.query).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'docs/opportunity.csv introuvable, backfill CSV ignoré',
    );
  });

  it('should backfill remaining opportunities from workspace member entities', async () => {
    const { commandInternals, dataSource, dataSourceMock, logger } =
      buildCommandContext();

    await commandInternals.backfillOpportunitiesFromWorkspaceMembers(
      dataSource,
      '"workspace_abc"."opportunity"',
      '"workspace_abc"."workspaceMember"',
    );

    expect(dataSourceMock.query).toHaveBeenCalledTimes(1);

    const [query, parameters, queryRunner, options] =
      dataSourceMock.query.mock.calls[0];

    expect(query).toContain(
      'UPDATE "workspace_abc"."opportunity" AS opportunity',
    );
    expect(query).toContain(
      'LEFT JOIN "workspace_abc"."workspaceMember" created_by_member',
    );
    expect(query).toContain('LEFT JOIN core."user" created_by_user');
    expect(query).toContain(
      'COALESCE(created_by_user."entityId", owner_user."entityId")',
    );
    expect(parameters).toStrictEqual([]);
    expect(queryRunner).toBeUndefined();
    expect(options).toBe(INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS);
    expect(logger.log).toHaveBeenCalledWith(
      '1 opportunité(s) rattachée(s) via les membres du workspace',
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
