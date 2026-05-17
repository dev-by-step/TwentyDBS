import { Command } from 'nest-commander';
import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { FieldMetadataService } from 'src/engine/metadata-modules/field-metadata/services/field-metadata.service';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { buildObjectIdByNameMaps } from 'src/engine/metadata-modules/flat-object-metadata/utils/build-object-id-by-name-maps.util';
import { ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { RoleService } from 'src/engine/metadata-modules/role/role.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { PRIMARY_DEV_WORKSPACE_USERS } from 'src/engine/workspace-manager/dev-seeder/core/constants/primary-dev-workspace-data.constant';
import { GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';

import {
  INTERNAL_ENTITY_SEEDS,
  type InternalEntitySeed,
} from 'src/modules/internal-entity/constants/internal-entity-seeds.constant';
import { ImportCsvOpportunitiesParserService } from 'src/modules/internal-entity/services/import-csv-opportunities-parser.service';
import {
  buildWorkspaceSqlTableName,
  INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS,
  resolveInternalEntitySeedId,
  resolveObjectTableNameOrThrow,
  validateUuidOrThrow,
} from 'src/modules/internal-entity/utils/internal-entity-command.utils';
import {
  buildMembershipInsertBatchFromMappings,
  buildMembershipInsertQuery,
  type InternalEntityMembershipInsertMapping,
} from 'src/modules/internal-entity/query-hooks/utils/internal-entity-source-tagging-sql.util';

type FlatMaps = {
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  objectIdByName: Record<string, string>;
};

type OpportunityInternalEntityMapping = {
  opportunityId: string;
  internalEntityId: string;
};

@Command({
  name: 'init-internal-entities',
  description:
    'Crée InternalEntity, les relations M2M Person/Company, seed les entités internes, migre les opportunités existantes',
})
export class InitInternalEntitiesCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly objectMetadataService: ObjectMetadataService,
    private readonly fieldMetadataService: FieldMetadataService,
    private readonly flatEntityMapsCacheService: WorkspaceManyOrAllFlatEntityMapsCacheService,
    private readonly importCsvOpportunitiesParserService: ImportCsvOpportunitiesParserService,
    private readonly roleService: RoleService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    dataSource,
  }: RunOnWorkspaceArgs): Promise<void> {
    if (!isDefined(dataSource)) {
      this.logger.log(
        `Pas de dataSource pour le workspace ${workspaceId}, ignoré`,
      );

      return;
    }

    const validatedWorkspaceId = validateUuidOrThrow(
      workspaceId,
      'workspaceId',
    );
    const schemaName = getWorkspaceSchemaName(validatedWorkspaceId);

    await this.roleService.createEntityManagerRole({
      workspaceId: validatedWorkspaceId,
    });
    await this.ensureMetadataSchema(validatedWorkspaceId);
    const internalEntityTableName = await resolveObjectTableNameOrThrow({
      objectMetadataService: this.objectMetadataService,
      workspaceId: validatedWorkspaceId,
      nameSingular: 'internalEntity',
    });
    const opportunityTableName = await resolveObjectTableNameOrThrow({
      objectMetadataService: this.objectMetadataService,
      workspaceId: validatedWorkspaceId,
      nameSingular: 'opportunity',
    });
    const personTableName = await resolveObjectTableNameOrThrow({
      objectMetadataService: this.objectMetadataService,
      workspaceId: validatedWorkspaceId,
      nameSingular: 'person',
    });
    const companyTableName = await resolveObjectTableNameOrThrow({
      objectMetadataService: this.objectMetadataService,
      workspaceId: validatedWorkspaceId,
      nameSingular: 'company',
    });
    const workspaceMemberTableName = await resolveObjectTableNameOrThrow({
      objectMetadataService: this.objectMetadataService,
      workspaceId: validatedWorkspaceId,
      nameSingular: 'workspaceMember',
    });
    const personEntityMembershipTableName = await resolveObjectTableNameOrThrow(
      {
        objectMetadataService: this.objectMetadataService,
        workspaceId: validatedWorkspaceId,
        nameSingular: 'personEntityMembership',
      },
    );
    const companyEntityMembershipTableName =
      await resolveObjectTableNameOrThrow({
        objectMetadataService: this.objectMetadataService,
        workspaceId: validatedWorkspaceId,
        nameSingular: 'companyEntityMembership',
      });
    const workspaceMemberEntityMembershipTableName =
      await resolveObjectTableNameOrThrow({
        objectMetadataService: this.objectMetadataService,
        workspaceId: validatedWorkspaceId,
        nameSingular: 'workspaceMemberEntityMembership',
      });
    const internalEntitySqlTable = buildWorkspaceSqlTableName(
      schemaName,
      internalEntityTableName,
    );
    const opportunitySqlTable = buildWorkspaceSqlTableName(
      schemaName,
      opportunityTableName,
    );
    const personSqlTable = buildWorkspaceSqlTableName(
      schemaName,
      personTableName,
    );
    const companySqlTable = buildWorkspaceSqlTableName(
      schemaName,
      companyTableName,
    );
    const workspaceMemberSqlTable = buildWorkspaceSqlTableName(
      schemaName,
      workspaceMemberTableName,
    );
    const personEntityMembershipSqlTable = buildWorkspaceSqlTableName(
      schemaName,
      personEntityMembershipTableName,
    );
    const companyEntityMembershipSqlTable = buildWorkspaceSqlTableName(
      schemaName,
      companyEntityMembershipTableName,
    );
    const workspaceMemberEntityMembershipSqlTable = buildWorkspaceSqlTableName(
      schemaName,
      workspaceMemberEntityMembershipTableName,
    );

    await this.seedInternalEntities(
      dataSource,
      internalEntitySqlTable,
      validatedWorkspaceId,
    );
    await this.backfillOpportunities(dataSource, opportunitySqlTable);
    await this.backfillOpportunitiesFromWorkspaceMembers(
      dataSource,
      opportunitySqlTable,
      workspaceMemberSqlTable,
    );
    await this.backfillWorkspaceMemberMembershipsFromUsers(
      dataSource,
      workspaceMemberSqlTable,
      workspaceMemberEntityMembershipSqlTable,
    );
    await this.backfillCompanyMembershipsFromOpportunities(
      dataSource,
      opportunitySqlTable,
      companyEntityMembershipSqlTable,
    );
    await this.backfillPersonMembershipsFromOpportunities(
      dataSource,
      opportunitySqlTable,
      personEntityMembershipSqlTable,
    );
    await this.backfillCompanyMembershipsFromPeople(
      dataSource,
      personSqlTable,
      personEntityMembershipSqlTable,
      companyEntityMembershipSqlTable,
    );
    await this.backfillPersonMembershipsFromCompanies(
      dataSource,
      personSqlTable,
      companyEntityMembershipSqlTable,
      personEntityMembershipSqlTable,
    );
    await this.cleanupPrimaryDevWorkspaceMemberships({
      workspaceId: validatedWorkspaceId,
      dataSource,
      internalEntitySqlTable,
      companySqlTable,
      personSqlTable,
      companyEntityMembershipSqlTable,
      personEntityMembershipSqlTable,
      workspaceMemberSqlTable,
      workspaceMemberEntityMembershipSqlTable,
    });
    await this.verifyMigration(dataSource, opportunitySqlTable);
  }

  private async ensureMetadataSchema(workspaceId: string): Promise<void> {
    this.logger.log('Vérification du schéma InternalEntity...');

    const internalEntityMetadata = await this.ensureObjectMetadata({
      workspaceId,
      nameSingular: 'internalEntity',
      namePlural: 'internalEntities',
      labelSingular: 'Internal Entity',
      labelPlural: 'Internal Entities',
      icon: 'IconBuilding',
    });

    const personEntityMembershipMetadata = await this.ensureObjectMetadata({
      workspaceId,
      nameSingular: 'personEntityMembership',
      namePlural: 'personEntityMemberships',
      labelSingular: 'Person Entity Membership',
      labelPlural: 'Person Entity Memberships',
      icon: 'IconUserCircle',
      skipNameField: true,
    });

    const companyEntityMembershipMetadata = await this.ensureObjectMetadata({
      workspaceId,
      nameSingular: 'companyEntityMembership',
      namePlural: 'companyEntityMemberships',
      labelSingular: 'Company Entity Membership',
      labelPlural: 'Company Entity Memberships',
      icon: 'IconBuildingSkyscraper',
      skipNameField: true,
    });
    const workspaceMemberEntityMembershipMetadata =
      await this.ensureObjectMetadata({
        workspaceId,
        nameSingular: 'workspaceMemberEntityMembership',
        namePlural: 'workspaceMemberEntityMemberships',
        labelSingular: 'Workspace Member Entity Membership',
        labelPlural: 'Workspace Member Entity Memberships',
        icon: 'IconUsers',
        skipNameField: true,
      });

    const personMetadata = await this.findObjectMetadataOrThrow(
      workspaceId,
      'person',
    );
    const companyMetadata = await this.findObjectMetadataOrThrow(
      workspaceId,
      'company',
    );
    const opportunityMetadata = await this.findObjectMetadataOrThrow(
      workspaceId,
      'opportunity',
    );
    const workspaceMemberMetadata = await this.findObjectMetadataOrThrow(
      workspaceId,
      'workspaceMember',
    );

    await this.ensureTextField({
      workspaceId,
      objectMetadataId: internalEntityMetadata.id,
      name: 'color',
      label: 'Color',
      description: 'Hex color for the internal entity',
      icon: 'IconColorSwatch',
      isNullable: false,
      defaultValue: "'#6B7280'",
    });

    await this.ensureUuidField({
      workspaceId,
      objectMetadataId: internalEntityMetadata.id,
      name: 'workspaceId',
      label: 'Workspace Id',
      description: 'Workspace isolation reference for the entity record',
      icon: 'Icon123',
      isNullable: true,
      isUIReadOnly: true,
    });

    await this.ensureRelationField({
      workspaceId,
      objectMetadataId: personMetadata.id,
      name: 'internalEntities',
      label: 'Internal Entities',
      icon: 'IconBuilding',
      relationType: RelationType.ONE_TO_MANY,
      targetFieldLabel: 'Person',
      targetFieldIcon: 'IconUser',
      targetObjectMetadataId: personEntityMembershipMetadata.id,
    });

    await this.ensureRelationField({
      workspaceId,
      objectMetadataId: internalEntityMetadata.id,
      name: 'persons',
      label: 'Persons',
      icon: 'IconUser',
      relationType: RelationType.ONE_TO_MANY,
      targetFieldLabel: 'Internal Entity',
      targetFieldIcon: 'IconBuilding',
      targetObjectMetadataId: personEntityMembershipMetadata.id,
    });

    await this.ensureRelationField({
      workspaceId,
      objectMetadataId: companyMetadata.id,
      name: 'internalEntities',
      label: 'Internal Entities',
      icon: 'IconBuilding',
      relationType: RelationType.ONE_TO_MANY,
      targetFieldLabel: 'Company',
      targetFieldIcon: 'IconBuildingSkyscraper',
      targetObjectMetadataId: companyEntityMembershipMetadata.id,
    });

    await this.ensureRelationField({
      workspaceId,
      objectMetadataId: internalEntityMetadata.id,
      name: 'companies',
      label: 'Companies',
      icon: 'IconBuildingSkyscraper',
      relationType: RelationType.ONE_TO_MANY,
      targetFieldLabel: 'Internal Entity',
      targetFieldIcon: 'IconBuilding',
      targetObjectMetadataId: companyEntityMembershipMetadata.id,
    });

    await this.ensureRelationField({
      workspaceId,
      objectMetadataId: workspaceMemberMetadata.id,
      name: 'internalEntities',
      label: 'Internal Entities',
      icon: 'IconBuilding',
      relationType: RelationType.ONE_TO_MANY,
      targetFieldLabel: 'Workspace Member',
      targetFieldIcon: 'IconUser',
      targetObjectMetadataId: workspaceMemberEntityMembershipMetadata.id,
    });

    await this.ensureRelationField({
      workspaceId,
      objectMetadataId: internalEntityMetadata.id,
      name: 'workspaceMembers',
      label: 'Workspace Members',
      icon: 'IconUser',
      relationType: RelationType.ONE_TO_MANY,
      targetFieldLabel: 'Internal Entity',
      targetFieldIcon: 'IconBuilding',
      targetObjectMetadataId: workspaceMemberEntityMembershipMetadata.id,
    });

    const flatMaps = await this.getFreshMaps(workspaceId);

    const personInternalEntitiesFieldId = this.findFieldId(
      'person',
      'internalEntities',
      flatMaps,
    );
    const junctionPersonInternalEntityFieldId = this.findFieldId(
      'personEntityMembership',
      'internalEntity',
      flatMaps,
    );

    await this.fieldMetadataService.updateOneField({
      updateFieldInput: {
        id: personInternalEntitiesFieldId,
        settings: {
          relationType: RelationType.ONE_TO_MANY,
          junctionTargetFieldId: junctionPersonInternalEntityFieldId,
        },
      },
      workspaceId,
    });

    const internalEntityPersonsFieldId = this.findFieldId(
      'internalEntity',
      'persons',
      flatMaps,
    );
    const junctionPersonFieldId = this.findFieldId(
      'personEntityMembership',
      'person',
      flatMaps,
    );

    await this.fieldMetadataService.updateOneField({
      updateFieldInput: {
        id: internalEntityPersonsFieldId,
        settings: {
          relationType: RelationType.ONE_TO_MANY,
          junctionTargetFieldId: junctionPersonFieldId,
        },
      },
      workspaceId,
    });

    const companyInternalEntitiesFieldId = this.findFieldId(
      'company',
      'internalEntities',
      flatMaps,
    );
    const junctionCompanyInternalEntityFieldId = this.findFieldId(
      'companyEntityMembership',
      'internalEntity',
      flatMaps,
    );

    await this.fieldMetadataService.updateOneField({
      updateFieldInput: {
        id: companyInternalEntitiesFieldId,
        settings: {
          relationType: RelationType.ONE_TO_MANY,
          junctionTargetFieldId: junctionCompanyInternalEntityFieldId,
        },
      },
      workspaceId,
    });

    const internalEntityCompaniesFieldId = this.findFieldId(
      'internalEntity',
      'companies',
      flatMaps,
    );
    const junctionCompanyFieldId = this.findFieldId(
      'companyEntityMembership',
      'company',
      flatMaps,
    );

    await this.fieldMetadataService.updateOneField({
      updateFieldInput: {
        id: internalEntityCompaniesFieldId,
        settings: {
          relationType: RelationType.ONE_TO_MANY,
          junctionTargetFieldId: junctionCompanyFieldId,
        },
      },
      workspaceId,
    });

    const workspaceMemberInternalEntitiesFieldId = this.findFieldId(
      'workspaceMember',
      'internalEntities',
      flatMaps,
    );
    const junctionWorkspaceMemberInternalEntityFieldId = this.findFieldId(
      'workspaceMemberEntityMembership',
      'internalEntity',
      flatMaps,
    );

    await this.fieldMetadataService.updateOneField({
      updateFieldInput: {
        id: workspaceMemberInternalEntitiesFieldId,
        settings: {
          relationType: RelationType.ONE_TO_MANY,
          junctionTargetFieldId: junctionWorkspaceMemberInternalEntityFieldId,
        },
      },
      workspaceId,
    });

    const internalEntityWorkspaceMembersFieldId = this.findFieldId(
      'internalEntity',
      'workspaceMembers',
      flatMaps,
    );
    const junctionWorkspaceMemberFieldId = this.findFieldId(
      'workspaceMemberEntityMembership',
      'workspaceMember',
      flatMaps,
    );

    await this.fieldMetadataService.updateOneField({
      updateFieldInput: {
        id: internalEntityWorkspaceMembersFieldId,
        settings: {
          relationType: RelationType.ONE_TO_MANY,
          junctionTargetFieldId: junctionWorkspaceMemberFieldId,
        },
      },
      workspaceId,
    });

    await this.ensureRelationField({
      workspaceId,
      objectMetadataId: opportunityMetadata.id,
      name: 'internalEntity',
      label: 'Internal Entity',
      icon: 'IconBuilding',
      relationType: RelationType.MANY_TO_ONE,
      targetFieldLabel: 'Opportunities',
      targetFieldIcon: 'IconTargetArrow',
      targetObjectMetadataId: internalEntityMetadata.id,
    });

    this.logger.log('Schéma InternalEntity prêt');
  }

  private async seedInternalEntities(
    dataSource: GlobalWorkspaceDataSource,
    internalEntitySqlTable: string,
    workspaceId: string,
  ): Promise<void> {
    this.logger.log('Seed des InternalEntity...');

    const seeds = Object.values(INTERNAL_ENTITY_SEEDS);

    if (seeds.length === 0) {
      this.logger.warn('Aucune InternalEntity configurée dans les seeds');

      return;
    }

    const { valuesSql, parameters } = this.buildInternalEntitySeedBatch(
      seeds,
      workspaceId,
    );

    await this.runAdminQuery(
      dataSource,
      `INSERT INTO ${internalEntitySqlTable} ("id", "name", "color", "workspaceId", "position", "createdAt", "updatedAt")
       VALUES ${valuesSql}
       ON CONFLICT ("id") DO UPDATE
       SET "name" = EXCLUDED."name",
           "color" = EXCLUDED."color",
           "workspaceId" = EXCLUDED."workspaceId",
           "updatedAt" = NOW()`,
      parameters,
    );

    this.logger.log(`${seeds.length} InternalEntity seedées`);
  }

  private buildInternalEntitySeedBatch(
    seeds: InternalEntitySeed[],
    workspaceId: string,
  ): {
    valuesSql: string;
    parameters: string[];
  } {
    const parameters: string[] = [];

    const valuesSql = seeds
      .map((seed, index) => {
        const offset = index * 4;

        parameters.push(seed.id, seed.name, seed.color, workspaceId);

        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${
          offset + 4
        }, 0, NOW(), NOW())`;
      })
      .join(', ');

    return { valuesSql, parameters };
  }

  private async backfillOpportunities(
    dataSource: GlobalWorkspaceDataSource,
    opportunitySqlTable: string,
  ): Promise<void> {
    this.logger.log('Backfill Opportunity → InternalEntity...');

    let skippedCount = 0;
    const unresolvedEntityNames = new Set<string>();
    const opportunityInternalEntityMappings: OpportunityInternalEntityMapping[] =
      [];
    const csvRows =
      await this.importCsvOpportunitiesParserService.readCsvOpportunities();

    for (const row of csvRows) {
      const entityId = resolveInternalEntitySeedId(row.entityName);

      if (!isDefined(entityId)) {
        skippedCount += 1;
        unresolvedEntityNames.add(row.entityName ?? '<empty>');

        continue;
      }

      opportunityInternalEntityMappings.push({
        opportunityId: row.id,
        internalEntityId: entityId,
      });
    }

    const migratedCount =
      opportunityInternalEntityMappings.length > 0
        ? await this.updateOpportunitiesInternalEntity(
            dataSource,
            opportunitySqlTable,
            opportunityInternalEntityMappings,
          )
        : 0;

    this.logger.log(
      `${migratedCount} opportunité(s) synchronisée(s) depuis le CSV (${csvRows.length} ligne(s) lues, ${skippedCount} ignorée(s))`,
    );

    if (unresolvedEntityNames.size > 0) {
      this.logger.warn(
        `InternalEntity inconnue(s) dans le CSV: ${[
          ...unresolvedEntityNames,
        ].join(
          ', ',
        )}. Ajoutez-les à INTERNAL_ENTITY_SEEDS ou corrigez le CSV avant de relancer.`,
      );
    }
  }

  private async updateOpportunitiesInternalEntity(
    dataSource: GlobalWorkspaceDataSource,
    opportunitySqlTable: string,
    mappings: OpportunityInternalEntityMapping[],
  ): Promise<number> {
    const { valuesSql, parameters } =
      this.buildOpportunityInternalEntityMappingsBatch(mappings);

    const updatedRows = await this.runAdminQuery<Array<{ id: string }>>(
      dataSource,
      `UPDATE ${opportunitySqlTable} AS opportunity
       SET "internalEntityId" = csv_values.internal_entity_id,
           "updatedAt" = NOW()
       FROM (VALUES ${valuesSql}) AS csv_values(id, internal_entity_id)
       WHERE opportunity.id = csv_values.id
         AND opportunity."deletedAt" IS NULL
         AND opportunity."internalEntityId" IS DISTINCT FROM csv_values.internal_entity_id
       RETURNING opportunity.id`,
      parameters,
    );

    return updatedRows.length;
  }

  private async backfillOpportunitiesFromWorkspaceMembers(
    dataSource: GlobalWorkspaceDataSource,
    opportunitySqlTable: string,
    workspaceMemberSqlTable: string,
  ): Promise<void> {
    const updatedRows = await this.runAdminQuery<Array<{ id: string }>>(
      dataSource,
      `UPDATE ${opportunitySqlTable} AS opportunity
       SET "internalEntityId" = inferred."internalEntityId",
           "updatedAt" = NOW()
       FROM (
         SELECT opportunity."id" AS "id",
                COALESCE(created_by_user."entityId", owner_user."entityId") AS "internalEntityId"
         FROM ${opportunitySqlTable} opportunity
         LEFT JOIN ${workspaceMemberSqlTable} created_by_member
           ON created_by_member."id" = opportunity."createdByWorkspaceMemberId"
         LEFT JOIN core."user" created_by_user
           ON created_by_user."id" = created_by_member."userId"
         LEFT JOIN ${workspaceMemberSqlTable} owner_member
           ON owner_member."id" = opportunity."ownerId"
         LEFT JOIN core."user" owner_user
           ON owner_user."id" = owner_member."userId"
         WHERE opportunity."internalEntityId" IS NULL
           AND opportunity."deletedAt" IS NULL
           AND COALESCE(created_by_user."entityId", owner_user."entityId") IS NOT NULL
       ) AS inferred
       WHERE opportunity."id" = inferred."id"
         AND opportunity."internalEntityId" IS NULL
       RETURNING opportunity."id"`,
    );

    if (updatedRows.length === 0) {
      this.logger.log(
        'Aucune opportunité à backfill via les membres du workspace',
      );

      return;
    }

    this.logger.log(
      `${updatedRows.length} opportunité(s) rattachée(s) via les membres du workspace`,
    );
  }

  private async backfillCompanyMembershipsFromOpportunities(
    dataSource: GlobalWorkspaceDataSource,
    opportunitySqlTable: string,
    companyEntityMembershipSqlTable: string,
  ): Promise<void> {
    const mappings = await this.selectDistinctRecordInternalEntityMappings(
      dataSource,
      `SELECT DISTINCT opportunity."companyId" AS "recordId",
                opportunity."internalEntityId" AS "internalEntityId"
         FROM ${opportunitySqlTable} opportunity
         WHERE opportunity."companyId" IS NOT NULL
           AND opportunity."internalEntityId" IS NOT NULL
           AND opportunity."deletedAt" IS NULL`,
    );

    await this.insertMembershipMappings({
      dataSource,
      membershipSqlTable: companyEntityMembershipSqlTable,
      sourceJoinColumnName: 'companyId',
      mappings,
      logLabel: 'Company <- Opportunity',
    });
  }

  private async backfillWorkspaceMemberMembershipsFromUsers(
    dataSource: GlobalWorkspaceDataSource,
    workspaceMemberSqlTable: string,
    workspaceMemberEntityMembershipSqlTable: string,
  ): Promise<void> {
    const mappings = await this.selectDistinctRecordInternalEntityMappings(
      dataSource,
      `SELECT DISTINCT workspace_member."id" AS "recordId",
                core_user."entityId" AS "internalEntityId"
         FROM ${workspaceMemberSqlTable} workspace_member
         INNER JOIN core."user" core_user
           ON core_user."id" = workspace_member."userId"
         WHERE workspace_member."deletedAt" IS NULL
           AND core_user."deletedAt" IS NULL
           AND core_user."entityId" IS NOT NULL`,
    );

    await this.insertMembershipMappings({
      dataSource,
      membershipSqlTable: workspaceMemberEntityMembershipSqlTable,
      sourceJoinColumnName: 'workspaceMemberId',
      mappings,
      logLabel: 'Workspace Member <- User',
    });
  }

  private async backfillPersonMembershipsFromOpportunities(
    dataSource: GlobalWorkspaceDataSource,
    opportunitySqlTable: string,
    personEntityMembershipSqlTable: string,
  ): Promise<void> {
    const mappings = await this.selectDistinctRecordInternalEntityMappings(
      dataSource,
      `SELECT DISTINCT opportunity."pointOfContactId" AS "recordId",
                opportunity."internalEntityId" AS "internalEntityId"
         FROM ${opportunitySqlTable} opportunity
         WHERE opportunity."pointOfContactId" IS NOT NULL
           AND opportunity."internalEntityId" IS NOT NULL
           AND opportunity."deletedAt" IS NULL`,
    );

    await this.insertMembershipMappings({
      dataSource,
      membershipSqlTable: personEntityMembershipSqlTable,
      sourceJoinColumnName: 'personId',
      mappings,
      logLabel: 'Person <- Opportunity',
    });
  }

  private async backfillCompanyMembershipsFromPeople(
    dataSource: GlobalWorkspaceDataSource,
    personSqlTable: string,
    personEntityMembershipSqlTable: string,
    companyEntityMembershipSqlTable: string,
  ): Promise<void> {
    const mappings = await this.selectDistinctRecordInternalEntityMappings(
      dataSource,
      `SELECT DISTINCT person."companyId" AS "recordId",
                person_membership."internalEntityId" AS "internalEntityId"
         FROM ${personSqlTable} person
         INNER JOIN ${personEntityMembershipSqlTable} person_membership
           ON person_membership."personId" = person."id"
          AND person_membership."deletedAt" IS NULL
         WHERE person."companyId" IS NOT NULL
           AND person."deletedAt" IS NULL`,
    );

    await this.insertMembershipMappings({
      dataSource,
      membershipSqlTable: companyEntityMembershipSqlTable,
      sourceJoinColumnName: 'companyId',
      mappings,
      logLabel: 'Company <- Person',
    });
  }

  private async backfillPersonMembershipsFromCompanies(
    dataSource: GlobalWorkspaceDataSource,
    personSqlTable: string,
    companyEntityMembershipSqlTable: string,
    personEntityMembershipSqlTable: string,
  ): Promise<void> {
    const mappings = await this.selectDistinctRecordInternalEntityMappings(
      dataSource,
      `SELECT DISTINCT person."id" AS "recordId",
                company_membership."internalEntityId" AS "internalEntityId"
         FROM ${personSqlTable} person
         INNER JOIN ${companyEntityMembershipSqlTable} company_membership
           ON company_membership."companyId" = person."companyId"
          AND company_membership."deletedAt" IS NULL
         WHERE person."companyId" IS NOT NULL
           AND person."deletedAt" IS NULL`,
    );

    await this.insertMembershipMappings({
      dataSource,
      membershipSqlTable: personEntityMembershipSqlTable,
      sourceJoinColumnName: 'personId',
      mappings,
      logLabel: 'Person <- Company',
    });
  }

  private async selectDistinctRecordInternalEntityMappings(
    dataSource: GlobalWorkspaceDataSource,
    query: string,
  ): Promise<InternalEntityMembershipInsertMapping[]> {
    return this.runAdminQuery<InternalEntityMembershipInsertMapping[]>(
      dataSource,
      query,
    );
  }

  private async insertMembershipMappings({
    dataSource,
    membershipSqlTable,
    sourceJoinColumnName,
    mappings,
    logLabel,
  }: {
    dataSource: GlobalWorkspaceDataSource;
    membershipSqlTable: string;
    sourceJoinColumnName: 'companyId' | 'personId' | 'workspaceMemberId';
    mappings: InternalEntityMembershipInsertMapping[];
    logLabel: string;
  }): Promise<void> {
    if (mappings.length === 0) {
      this.logger.log(`Aucun membership à backfill pour ${logLabel}`);

      return;
    }

    const { valuesSql, values } = buildMembershipInsertBatchFromMappings({
      mappings,
    });
    const membershipInsertQuery = buildMembershipInsertQuery({
      membershipSqlTable,
      sourceJoinColumnName,
      valuesSql,
      values,
    });

    await this.runAdminQuery(
      dataSource,
      membershipInsertQuery.text,
      membershipInsertQuery.values,
    );

    this.logger.log(
      `${mappings.length} membership(s) candidat(s) traité(s) pour ${logLabel}`,
    );
  }

  private async cleanupPrimaryDevWorkspaceMemberships({
    workspaceId,
    dataSource,
    internalEntitySqlTable,
    companySqlTable,
    personSqlTable,
    companyEntityMembershipSqlTable,
    personEntityMembershipSqlTable,
    workspaceMemberSqlTable,
    workspaceMemberEntityMembershipSqlTable,
  }: {
    workspaceId: string;
    dataSource: GlobalWorkspaceDataSource;
    internalEntitySqlTable: string;
    companySqlTable: string;
    personSqlTable: string;
    companyEntityMembershipSqlTable: string;
    personEntityMembershipSqlTable: string;
    workspaceMemberSqlTable: string;
    workspaceMemberEntityMembershipSqlTable: string;
  }): Promise<void> {
    if (workspaceId !== SEED_APPLE_WORKSPACE_ID) {
      return;
    }

    this.logger.log(
      'Nettoyage des memberships de démo pour ne garder que les correspondances entité <-> société canonique...',
    );

    const normalizeNameSql = (alias: string) =>
      `LOWER(REPLACE(REPLACE(${alias}."name", ' ', ''), '_', ''))`;

    const deletedCompanyMemberships = await this.runAdminQuery<
      Array<{ id: string }>
    >(
      dataSource,
      `DELETE FROM ${companyEntityMembershipSqlTable} membership
       WHERE membership."deletedAt" IS NULL
         AND NOT EXISTS (
           SELECT 1
           FROM ${companySqlTable} company
           INNER JOIN ${internalEntitySqlTable} internal_entity
             ON internal_entity."id" = membership."internalEntityId"
            AND internal_entity."deletedAt" IS NULL
           WHERE company."id" = membership."companyId"
             AND company."deletedAt" IS NULL
             AND ${normalizeNameSql('company')} = ${normalizeNameSql('internal_entity')}
         )
       RETURNING membership."id"`,
    );

    const deletedPersonMemberships = await this.runAdminQuery<
      Array<{ id: string }>
    >(
      dataSource,
      `DELETE FROM ${personEntityMembershipSqlTable} membership
       WHERE membership."deletedAt" IS NULL
         AND NOT EXISTS (
           SELECT 1
           FROM ${personSqlTable} person
           INNER JOIN ${companySqlTable} company
             ON company."id" = person."companyId"
            AND company."deletedAt" IS NULL
           INNER JOIN ${internalEntitySqlTable} internal_entity
             ON internal_entity."id" = membership."internalEntityId"
            AND internal_entity."deletedAt" IS NULL
           WHERE person."id" = membership."personId"
             AND person."deletedAt" IS NULL
             AND ${normalizeNameSql('company')} = ${normalizeNameSql('internal_entity')}
         )
       RETURNING membership."id"`,
    );

    this.logger.log(
      `${deletedCompanyMemberships.length} company entity membership(s) hors règle supprimé(s)`,
    );
    this.logger.log(
      `${deletedPersonMemberships.length} person entity membership(s) hors règle supprimé(s)`,
    );

    await this.syncPrimaryDevWorkspaceMemberMemberships({
      dataSource,
      workspaceMemberSqlTable,
      workspaceMemberEntityMembershipSqlTable,
    });
  }

  private async syncPrimaryDevWorkspaceMemberMemberships({
    dataSource,
    workspaceMemberSqlTable,
    workspaceMemberEntityMembershipSqlTable,
  }: {
    dataSource: GlobalWorkspaceDataSource;
    workspaceMemberSqlTable: string;
    workspaceMemberEntityMembershipSqlTable: string;
  }) {
    const primaryDevWorkspaceMembershipMappings = Object.values(
      PRIMARY_DEV_WORKSPACE_USERS,
    ).flatMap((user) =>
      user.internalEntityIds.map((internalEntityId) => ({
        userEmail: user.email.toLowerCase(),
        internalEntityId,
      })),
    );

    if (primaryDevWorkspaceMembershipMappings.length === 0) {
      return;
    }

    const membershipValues: string[] = [];
    const membershipValuesSql = primaryDevWorkspaceMembershipMappings
      .map((mapping, index) => {
        const offset = index * 2;

        membershipValues.push(mapping.userEmail, mapping.internalEntityId);

        return `($${offset + 1}::text, $${offset + 2}::uuid)`;
      })
      .join(', ');

    await this.runAdminQuery(
      dataSource,
      `DELETE FROM ${workspaceMemberEntityMembershipSqlTable} membership
       WHERE membership."deletedAt" IS NULL
         AND EXISTS (
           SELECT 1
           FROM (VALUES ${membershipValuesSql}) AS allowed_memberships(
             user_email,
             internal_entity_id
           )
           INNER JOIN ${workspaceMemberSqlTable} workspace_member
             ON LOWER(workspace_member."userEmail") = allowed_memberships.user_email
            AND workspace_member."deletedAt" IS NULL
           WHERE workspace_member."id" = membership."workspaceMemberId"
         )
         AND NOT EXISTS (
           SELECT 1
           FROM (VALUES ${membershipValuesSql}) AS allowed_memberships(
             user_email,
             internal_entity_id
           )
           INNER JOIN ${workspaceMemberSqlTable} workspace_member
             ON LOWER(workspace_member."userEmail") = allowed_memberships.user_email
            AND workspace_member."deletedAt" IS NULL
           WHERE workspace_member."id" = membership."workspaceMemberId"
             AND membership."internalEntityId" = allowed_memberships.internal_entity_id
         )`,
      membershipValues,
    );

    const workspaceMemberMappings = await this.runAdminQuery<
      Array<{ recordId: string; internalEntityId: string }>
    >(
      dataSource,
      `SELECT workspace_member."id" AS "recordId",
              allowed_memberships.internal_entity_id AS "internalEntityId"
       FROM (VALUES ${membershipValuesSql}) AS allowed_memberships(
         user_email,
         internal_entity_id
       )
       INNER JOIN ${workspaceMemberSqlTable} workspace_member
         ON LOWER(workspace_member."userEmail") = allowed_memberships.user_email
        AND workspace_member."deletedAt" IS NULL`,
      membershipValues,
    );

    await this.insertMembershipMappings({
      dataSource,
      membershipSqlTable: workspaceMemberEntityMembershipSqlTable,
      sourceJoinColumnName: 'workspaceMemberId',
      mappings: workspaceMemberMappings,
      logLabel: 'Workspace Member <- Primary Dev User',
    });
  }

  private buildOpportunityInternalEntityMappingsBatch(
    mappings: OpportunityInternalEntityMapping[],
  ): {
    valuesSql: string;
    parameters: string[];
  } {
    const parameters: string[] = [];

    const valuesSql = mappings
      .map((mapping, index) => {
        const offset = index * 2;

        parameters.push(mapping.opportunityId, mapping.internalEntityId);

        return `($${offset + 1}::uuid, $${offset + 2}::uuid)`;
      })
      .join(', ');

    return { valuesSql, parameters };
  }

  private async verifyMigration(
    dataSource: GlobalWorkspaceDataSource,
    opportunitySqlTable: string,
  ): Promise<void> {
    const result = await this.runAdminQuery<Array<{ count: string }>>(
      dataSource,
      `SELECT COUNT(*)::text AS count
       FROM ${opportunitySqlTable}
       WHERE "internalEntityId" IS NULL
         AND "deletedAt" IS NULL`,
    );

    const nullCount = parseInt(result?.[0]?.count ?? '0', 10);

    if (nullCount > 0) {
      throw new Error(
        `${nullCount} opportunité(s) sans internalEntityId après migration. Ajoutez les entreprises manquantes à INTERNAL_ENTITY_SEEDS, corrigez le CSV ou migrez explicitement ces opportunités.`,
      );
    }

    this.logger.log(
      'Vérification OK : toutes les opportunités ont un internalEntityId',
    );
  }

  private async ensureObjectMetadata({
    workspaceId,
    nameSingular,
    namePlural,
    labelSingular,
    labelPlural,
    icon,
    skipNameField,
  }: {
    workspaceId: string;
    nameSingular: string;
    namePlural: string;
    labelSingular: string;
    labelPlural: string;
    icon: string;
    skipNameField?: boolean;
  }) {
    const existing = await this.objectMetadataService.findOneWithinWorkspace(
      workspaceId,
      {
        where: { nameSingular },
      },
    );

    if (isDefined(existing)) {
      return existing;
    }

    this.logger.log(`Création de l'objet ${nameSingular}...`);

    return this.objectMetadataService.createOneObject({
      createObjectInput: {
        nameSingular,
        namePlural,
        labelSingular,
        labelPlural,
        icon,
        skipNameField,
      },
      workspaceId,
    });
  }

  private async findObjectMetadataOrThrow(
    workspaceId: string,
    nameSingular: string,
  ) {
    const objectMetadata =
      await this.objectMetadataService.findOneWithinWorkspace(workspaceId, {
        where: { nameSingular },
      });

    if (!isDefined(objectMetadata)) {
      throw new Error(
        `Objet standard introuvable dans le workspace: ${nameSingular}`,
      );
    }

    return objectMetadata;
  }

  private async ensureTextField({
    workspaceId,
    objectMetadataId,
    name,
    label,
    description,
    icon,
    isNullable,
    defaultValue,
  }: {
    workspaceId: string;
    objectMetadataId: string;
    name: string;
    label: string;
    description: string;
    icon: string;
    isNullable: boolean;
    defaultValue?: string;
  }): Promise<void> {
    const existing = await this.fieldMetadataService.findOneWithinWorkspace(
      workspaceId,
      {
        where: {
          objectMetadataId,
          name,
        },
      },
    );

    if (isDefined(existing)) {
      return;
    }

    await this.fieldMetadataService.createOneField({
      createFieldInput: {
        type: FieldMetadataType.TEXT,
        objectMetadataId,
        name,
        label,
        description,
        icon,
        isActive: true,
        isNullable,
        isUnique: false,
        ...(isDefined(defaultValue) ? { defaultValue } : {}),
      },
      workspaceId,
    });
  }

  private async ensureUuidField({
    workspaceId,
    objectMetadataId,
    name,
    label,
    description,
    icon,
    isNullable,
    isUIReadOnly,
  }: {
    workspaceId: string;
    objectMetadataId: string;
    name: string;
    label: string;
    description: string;
    icon: string;
    isNullable: boolean;
    isUIReadOnly: boolean;
  }): Promise<void> {
    const existing = await this.fieldMetadataService.findOneWithinWorkspace(
      workspaceId,
      {
        where: {
          objectMetadataId,
          name,
        },
      },
    );

    if (isDefined(existing)) {
      return;
    }

    await this.fieldMetadataService.createOneField({
      createFieldInput: {
        type: FieldMetadataType.UUID,
        objectMetadataId,
        name,
        label,
        description,
        icon,
        isActive: true,
        isNullable,
        isUnique: false,
        isUIReadOnly,
      },
      workspaceId,
    });
  }

  private async ensureRelationField({
    workspaceId,
    objectMetadataId,
    name,
    label,
    icon,
    relationType,
    targetFieldLabel,
    targetFieldIcon,
    targetObjectMetadataId,
  }: {
    workspaceId: string;
    objectMetadataId: string;
    name: string;
    label: string;
    icon: string;
    relationType: RelationType;
    targetFieldLabel: string;
    targetFieldIcon: string;
    targetObjectMetadataId: string;
  }): Promise<void> {
    const existing = await this.fieldMetadataService.findOneWithinWorkspace(
      workspaceId,
      {
        where: {
          objectMetadataId,
          name,
        },
      },
    );

    if (isDefined(existing)) {
      return;
    }

    await this.fieldMetadataService.createOneField({
      createFieldInput: {
        type: FieldMetadataType.RELATION,
        name,
        label,
        icon,
        objectMetadataId,
        relationCreationPayload: {
          type: relationType,
          targetFieldLabel,
          targetFieldIcon,
          targetObjectMetadataId,
        },
      },
      workspaceId,
    });
  }

  private async getFreshMaps(workspaceId: string): Promise<FlatMaps> {
    await this.flatEntityMapsCacheService.invalidateFlatEntityMaps({
      workspaceId,
      flatMapsKeys: ['flatObjectMetadataMaps', 'flatFieldMetadataMaps'],
    });

    const { flatObjectMetadataMaps, flatFieldMetadataMaps } =
      await this.flatEntityMapsCacheService.getOrRecomputeManyOrAllFlatEntityMaps(
        {
          workspaceId,
          flatMapsKeys: ['flatObjectMetadataMaps', 'flatFieldMetadataMaps'],
        },
      );

    const { idByNameSingular } = buildObjectIdByNameMaps(
      flatObjectMetadataMaps,
    );

    return {
      flatFieldMetadataMaps,
      flatObjectMetadataMaps,
      objectIdByName: idByNameSingular,
    };
  }

  private findFieldId(
    objectName: string,
    fieldName: string,
    flatMaps: FlatMaps,
  ): string {
    const objectId = flatMaps.objectIdByName[objectName];

    if (!isDefined(objectId)) {
      throw new Error(`Objet introuvable dans les flat maps: ${objectName}`);
    }

    const objectMetadata = findFlatEntityByIdInFlatEntityMaps({
      flatEntityId: objectId,
      flatEntityMaps: flatMaps.flatObjectMetadataMaps,
    });

    if (!isDefined(objectMetadata)) {
      throw new Error(`Metadata d'objet introuvable: ${objectName}`);
    }

    for (const fieldId of objectMetadata.fieldIds) {
      const field = findFlatEntityByIdInFlatEntityMaps({
        flatEntityId: fieldId,
        flatEntityMaps: flatMaps.flatFieldMetadataMaps,
      });

      if (field?.name === fieldName) {
        return fieldId;
      }
    }

    throw new Error(`Champ introuvable: ${objectName}.${fieldName}`);
  }

  private async runAdminQuery<T>(
    dataSource: GlobalWorkspaceDataSource,
    query: string,
    parameters: unknown[] = [],
  ): Promise<T> {
    return dataSource.query<T>(
      query,
      parameters,
      undefined,
      INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS,
    );
  }
}
