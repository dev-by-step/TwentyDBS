import { Command } from 'nest-commander';
import {
  FieldMetadataType,
  RelationOnDeleteAction,
  RelationType,
} from 'twenty-shared/types';
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

import { type InternalEntitySeed } from 'src/modules/internal-entity/constants/internal-entity-seeds.constant';
import { InternalEntityAuditLoggerService } from 'src/modules/internal-entity/services/internal-entity-audit-logger.service';
import { InternalEntityConfigurationService } from 'src/modules/internal-entity/services/internal-entity-configuration.service';
import {
  type CsvOpportunityRow,
  ImportCsvOpportunitiesParserService,
  OpportunityCsvNotFoundError,
} from 'src/modules/internal-entity/services/import-csv-opportunities-parser.service';
import {
  buildWorkspaceSqlTableName,
  INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS,
  quoteSqlIdentifierOrThrow,
  resolveObjectTableNameOrThrow,
  validateUuidOrThrow,
} from 'src/modules/internal-entity/utils/internal-entity-command.utils';
import { buildRenameLegacyInternalEntityFieldsQuery } from 'src/modules/internal-entity/utils/internal-entity-legacy-field-migration.util';
import {
  buildMembershipInsertBatchFromMappings,
  buildMembershipInsertQuery,
  type InternalEntityMembershipInsertMapping,
} from 'src/modules/internal-entity/query-hooks/utils/internal-entity-source-tagging-sql.util';
import {
  buildCreateActiveMembershipUniqueIndexQuery,
  buildCreateInternalEntityIdIndexQuery,
  buildDeduplicateActiveMembershipsQuery,
  buildDeleteRedundantSoftDeletedMembershipsQuery,
  type InternalEntityMembershipUniqueIndexTarget,
} from 'src/modules/internal-entity/query-hooks/utils/internal-entity-membership-integrity-sql.util';

type FlatMaps = {
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  objectIdByName: Record<string, string>;
};

type OpportunityInternalEntityMapping = {
  opportunityId: string;
  internalEntityId: string;
};

type DuplicateInternalEntityMapping = {
  duplicateId: string;
  canonicalId: string;
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
    private readonly internalEntityConfigurationService: InternalEntityConfigurationService,
    private readonly internalEntityAuditLoggerService: InternalEntityAuditLoggerService,
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

    await this.runSeedForWorkspace(workspaceId, dataSource);
  }

  /**
   * Public entry point so the workspace activation flow can trigger the seed
   * without going through the CLI command runner.
   * Safe to re-run: all steps are idempotent.
   */
  async runSeedForWorkspace(
    workspaceId: string,
    dataSource: GlobalWorkspaceDataSource,
  ): Promise<void> {
    const validatedWorkspaceId = validateUuidOrThrow(
      workspaceId,
      'workspaceId',
    );
    const schemaName = getWorkspaceSchemaName(validatedWorkspaceId);

    await this.roleService.createEntityManagerRole({
      workspaceId: validatedWorkspaceId,
    });
    // FIX-30 : migrer les noms de champ hérités (`entiteInterne`) AVANT le
    // câblage du schéma, sinon `ensureMetadataSchema` échoue en
    // `Champ introuvable` sur les workspaces provisionnés par une ancienne
    // version du fork.
    await this.renameLegacyInternalEntityRelationFields(
      dataSource,
      validatedWorkspaceId,
    );
    await this.ensureMetadataSchema(validatedWorkspaceId);
    await this.normalizeInternalEntityMetadataLabels(
      dataSource,
      validatedWorkspaceId,
    );

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
    const calendarEventEntityAudienceTableName =
      await resolveObjectTableNameOrThrow({
        objectMetadataService: this.objectMetadataService,
        workspaceId: validatedWorkspaceId,
        nameSingular: 'calendarEventEntityAudience',
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
    const calendarEventEntityAudienceSqlTable = buildWorkspaceSqlTableName(
      schemaName,
      calendarEventEntityAudienceTableName,
    );

    await this.seedInternalEntities({
      dataSource,
      internalEntitySqlTable,
      opportunitySqlTable,
      personEntityMembershipSqlTable,
      companyEntityMembershipSqlTable,
      workspaceMemberEntityMembershipSqlTable,
      calendarEventEntityAudienceSqlTable,
      workspaceId: validatedWorkspaceId,
    });
    const isCsvBackfillAvailable = await this.backfillOpportunities(
      dataSource,
      opportunitySqlTable,
    );
    await this.backfillWorkspaceMemberMembershipsFromUsers(
      dataSource,
      internalEntitySqlTable,
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
      opportunitySqlTable,
      companyEntityMembershipSqlTable,
      personEntityMembershipSqlTable,
      workspaceMemberSqlTable,
      workspaceMemberEntityMembershipSqlTable,
    });
    await this.ensureMembershipIntegrity(dataSource, [
      {
        membershipSqlTable: companyEntityMembershipSqlTable,
        sourceJoinColumnName: 'companyId',
        indexName: 'IDX_companyEntityMembership_active_entity_nnd',
        internalEntityIdIndexName:
          'IDX_companyEntityMembership_internalEntityId',
      },
      {
        membershipSqlTable: personEntityMembershipSqlTable,
        sourceJoinColumnName: 'personId',
        indexName: 'IDX_personEntityMembership_active_entity_nnd',
        internalEntityIdIndexName:
          'IDX_personEntityMembership_internalEntityId',
      },
      {
        membershipSqlTable: workspaceMemberEntityMembershipSqlTable,
        sourceJoinColumnName: 'workspaceMemberId',
        indexName: 'IDX_workspaceMemberEntity_active_entity_nnd',
        internalEntityIdIndexName: 'IDX_workspaceMemberEntity_internalEntityId',
      },
      {
        membershipSqlTable: calendarEventEntityAudienceSqlTable,
        sourceJoinColumnName: 'calendarEventId',
        indexName: 'IDX_calendarEventEntityAudience_active_entity_nnd',
        internalEntityIdIndexName:
          'IDX_calendarEventEntityAudience_internalEntityId',
      },
    ]);
    await this.runAdminQuery(
      dataSource,
      buildCreateInternalEntityIdIndexQuery({
        sqlTable: opportunitySqlTable,
        indexName: 'IDX_opportunity_internalEntityId',
      }),
    );
    await this.verifyMigration(dataSource, opportunitySqlTable, {
      shouldThrowOnUnresolvedOpportunities: false,
    });
  }

  private async ensureMetadataSchema(workspaceId: string): Promise<void> {
    this.logger.log('Vérification du schéma InternalEntity...');

    const internalEntityMetadata = await this.ensureObjectMetadata({
      workspaceId,
      nameSingular: 'internalEntity',
      namePlural: 'internalEntities',
      labelSingular: 'Entité interne',
      labelPlural: 'Entités internes',
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

    const calendarEventEntityAudienceMetadata = await this.ensureObjectMetadata(
      {
        workspaceId,
        nameSingular: 'calendarEventEntityAudience',
        namePlural: 'calendarEventEntityAudiences',
        labelSingular: 'Calendar Event Entity Audience',
        labelPlural: 'Calendar Event Entity Audiences',
        icon: 'IconCalendarShare',
        skipNameField: true,
      },
    );

    const calendarEventPersonAudienceMetadata = await this.ensureObjectMetadata(
      {
        workspaceId,
        nameSingular: 'calendarEventPersonAudience',
        namePlural: 'calendarEventPersonAudiences',
        labelSingular: 'Calendar Event Person Audience',
        labelPlural: 'Calendar Event Person Audiences',
        icon: 'IconUserShare',
        skipNameField: true,
      },
    );

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
    const calendarEventMetadata = await this.findObjectMetadataOrThrow(
      workspaceId,
      'calendarEvent',
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
      label: 'Entités internes',
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
      label: 'Entités internes',
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
      label: 'Entités internes',
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

    await this.ensureRelationField({
      workspaceId,
      objectMetadataId: calendarEventMetadata.id,
      name: 'audienceEntities',
      label: 'Audience Entities',
      icon: 'IconBuilding',
      relationType: RelationType.ONE_TO_MANY,
      targetFieldLabel: 'Calendar Event',
      targetFieldIcon: 'IconCalendar',
      targetObjectMetadataId: calendarEventEntityAudienceMetadata.id,
    });

    await this.ensureRelationField({
      workspaceId,
      objectMetadataId: internalEntityMetadata.id,
      name: 'calendarEventsInAudience',
      label: 'Calendar Events in Audience',
      icon: 'IconCalendar',
      relationType: RelationType.ONE_TO_MANY,
      targetFieldLabel: 'Internal Entity',
      targetFieldIcon: 'IconBuilding',
      targetObjectMetadataId: calendarEventEntityAudienceMetadata.id,
    });

    await this.ensureRelationField({
      workspaceId,
      objectMetadataId: calendarEventMetadata.id,
      name: 'audienceMembers',
      label: 'Audience Members',
      icon: 'IconUser',
      relationType: RelationType.ONE_TO_MANY,
      targetFieldLabel: 'Calendar Event',
      targetFieldIcon: 'IconCalendar',
      targetObjectMetadataId: calendarEventPersonAudienceMetadata.id,
    });

    await this.ensureRelationField({
      workspaceId,
      objectMetadataId: workspaceMemberMetadata.id,
      name: 'calendarEventAudienceMemberships',
      label: 'Calendar Events in Audience',
      icon: 'IconCalendar',
      relationType: RelationType.ONE_TO_MANY,
      targetFieldLabel: 'Workspace Member',
      targetFieldIcon: 'IconUser',
      targetObjectMetadataId: calendarEventPersonAudienceMetadata.id,
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
      label: 'Entité interne',
      icon: 'IconBuilding',
      relationType: RelationType.MANY_TO_ONE,
      targetFieldLabel: 'Opportunities',
      targetFieldIcon: 'IconTargetArrow',
      targetObjectMetadataId: internalEntityMetadata.id,
    });

    const calendarEventAudienceFieldId = this.findFieldId(
      'calendarEvent',
      'audienceEntities',
      flatMaps,
    );
    const junctionCalendarEventAudienceInternalEntityFieldId = this.findFieldId(
      'calendarEventEntityAudience',
      'internalEntity',
      flatMaps,
    );

    await this.fieldMetadataService.updateOneField({
      updateFieldInput: {
        id: calendarEventAudienceFieldId,
        settings: {
          relationType: RelationType.ONE_TO_MANY,
          junctionTargetFieldId:
            junctionCalendarEventAudienceInternalEntityFieldId,
        },
      },
      workspaceId,
    });

    const internalEntityCalendarEventsInAudienceFieldId = this.findFieldId(
      'internalEntity',
      'calendarEventsInAudience',
      flatMaps,
    );
    const junctionCalendarEventAudienceCalendarEventFieldId = this.findFieldId(
      'calendarEventEntityAudience',
      'calendarEvent',
      flatMaps,
    );

    await this.fieldMetadataService.updateOneField({
      updateFieldInput: {
        id: internalEntityCalendarEventsInAudienceFieldId,
        settings: {
          relationType: RelationType.ONE_TO_MANY,
          junctionTargetFieldId:
            junctionCalendarEventAudienceCalendarEventFieldId,
        },
      },
      workspaceId,
    });

    const calendarEventAudienceMembersFieldId = this.findFieldId(
      'calendarEvent',
      'audienceMembers',
      flatMaps,
    );
    const junctionCalendarEventPersonAudienceWorkspaceMemberFieldId =
      this.findFieldId(
        'calendarEventPersonAudience',
        'workspaceMember',
        flatMaps,
      );

    await this.fieldMetadataService.updateOneField({
      updateFieldInput: {
        id: calendarEventAudienceMembersFieldId,
        settings: {
          relationType: RelationType.ONE_TO_MANY,
          junctionTargetFieldId:
            junctionCalendarEventPersonAudienceWorkspaceMemberFieldId,
        },
      },
      workspaceId,
    });

    const workspaceMemberCalendarEventAudienceMembershipsFieldId =
      this.findFieldId(
        'workspaceMember',
        'calendarEventAudienceMemberships',
        flatMaps,
      );
    const junctionCalendarEventPersonAudienceCalendarEventFieldId =
      this.findFieldId(
        'calendarEventPersonAudience',
        'calendarEvent',
        flatMaps,
      );

    await this.fieldMetadataService.updateOneField({
      updateFieldInput: {
        id: workspaceMemberCalendarEventAudienceMembershipsFieldId,
        settings: {
          relationType: RelationType.ONE_TO_MANY,
          junctionTargetFieldId:
            junctionCalendarEventPersonAudienceCalendarEventFieldId,
        },
      },
      workspaceId,
    });

    // Cascade delete junction rows when the parent calendarEvent is destroyed.
    // updateOneField fully replaces `settings`, so we must include the
    // pre-existing keys (joinColumnName) — losing them produces a malformed
    // MANY_TO_ONE field and crashes the workspace cache rebuild.
    await this.applyCalendarEventJunctionCascadeOnDelete({
      workspaceId,
      flatMaps,
      junctionObjectNameSingular: 'calendarEventEntityAudience',
    });
    await this.applyCalendarEventJunctionCascadeOnDelete({
      workspaceId,
      flatMaps,
      junctionObjectNameSingular: 'calendarEventPersonAudience',
    });

    this.logger.log('Schéma InternalEntity prêt');
  }

  /**
   * FIX-30 : renomme les champs de relation hérités (`entiteInterne`) vers
   * `internalEntity` sur les objets porteurs. Purement metadata : le
   * `joinColumnName` de ces champs est déjà `internalEntityId`, aucune
   * migration physique n'est nécessaire. Idempotent (aucun renommage si un
   * champ `internalEntity` existe déjà sur l'objet).
   */
  private async renameLegacyInternalEntityRelationFields(
    dataSource: GlobalWorkspaceDataSource,
    workspaceId: string,
  ): Promise<void> {
    const renamedRows = await dataSource.coreDataSource.query<
      Array<{ objectNameSingular: string }>
    >(buildRenameLegacyInternalEntityFieldsQuery(), [workspaceId]);

    if (renamedRows.length === 0) {
      return;
    }

    await this.flatEntityMapsCacheService.invalidateFlatEntityMaps({
      workspaceId,
      flatMapsKeys: ['flatObjectMetadataMaps', 'flatFieldMetadataMaps'],
    });

    this.logger.warn(
      `${renamedRows.length} champ(s) de relation hérité(s) renommé(s) en internalEntity (${renamedRows
        .map((row) => row.objectNameSingular)
        .join(', ')})`,
    );
  }

  private async normalizeInternalEntityMetadataLabels(
    dataSource: GlobalWorkspaceDataSource,
    workspaceId: string,
  ): Promise<void> {
    const [result] = await dataSource.coreDataSource.query(
      `
      WITH normalized_fields AS (
        UPDATE core."fieldMetadata"
        SET
          label = CASE
            WHEN name = 'internalEntities' THEN 'Entités internes'
            WHEN name = 'internalEntity' THEN 'Entité interne'
            ELSE label
          END,
          icon = 'IconBuilding',
          "updatedAt" = now()
        WHERE "workspaceId" = $1
          AND name IN ('internalEntities', 'internalEntity')
          AND (
            label IS DISTINCT FROM CASE
              WHEN name = 'internalEntities' THEN 'Entités internes'
              WHEN name = 'internalEntity' THEN 'Entité interne'
              ELSE label
            END
            OR icon IS DISTINCT FROM 'IconBuilding'
          )
        RETURNING id
      ),
      normalized_objects AS (
        UPDATE core."objectMetadata"
        SET
          "labelSingular" = 'Entité interne',
          "labelPlural" = 'Entités internes',
          icon = 'IconBuilding',
          "updatedAt" = now()
        WHERE "workspaceId" = $1
          AND "nameSingular" = 'internalEntity'
          AND (
            "labelSingular" IS DISTINCT FROM 'Entité interne'
            OR "labelPlural" IS DISTINCT FROM 'Entités internes'
            OR icon IS DISTINCT FROM 'IconBuilding'
          )
        RETURNING id
      )
      SELECT
        (SELECT count(*)::int FROM normalized_fields) AS "fieldCount",
        (SELECT count(*)::int FROM normalized_objects) AS "objectCount"
      `,
      [workspaceId],
    );

    const fieldCount = Number(result?.fieldCount ?? 0);
    const objectCount = Number(result?.objectCount ?? 0);

    if (fieldCount === 0 && objectCount === 0) {
      return;
    }

    await this.flatEntityMapsCacheService.invalidateFlatEntityMaps({
      workspaceId,
      flatMapsKeys: ['flatObjectMetadataMaps', 'flatFieldMetadataMaps'],
    });

    this.logger.log(
      `${fieldCount} label(s) de champ et ${objectCount} label(s) d'objet InternalEntity normalisé(s)`,
    );
  }

  private async seedInternalEntities({
    dataSource,
    internalEntitySqlTable,
    opportunitySqlTable,
    personEntityMembershipSqlTable,
    companyEntityMembershipSqlTable,
    workspaceMemberEntityMembershipSqlTable,
    calendarEventEntityAudienceSqlTable,
    workspaceId,
  }: {
    dataSource: GlobalWorkspaceDataSource;
    internalEntitySqlTable: string;
    opportunitySqlTable: string;
    personEntityMembershipSqlTable: string;
    companyEntityMembershipSqlTable: string;
    workspaceMemberEntityMembershipSqlTable: string;
    calendarEventEntityAudienceSqlTable: string;
    workspaceId: string;
  }): Promise<void> {
    this.logger.log('Seed des InternalEntity...');

    const seeds =
      this.internalEntityConfigurationService.getInternalEntitySeeds();

    if (seeds.length === 0) {
      this.logger.warn('Aucune InternalEntity configurée dans les seeds');

      return;
    }

    const duplicateEntityMappings =
      await this.findDuplicateInternalEntityMappings({
        dataSource,
        internalEntitySqlTable,
        seeds,
        workspaceId,
      });

    if (duplicateEntityMappings.length > 0) {
      await this.mergeDuplicateInternalEntities({
        dataSource,
        duplicateEntityMappings,
        opportunitySqlTable,
        personEntityMembershipSqlTable,
        companyEntityMembershipSqlTable,
        workspaceMemberEntityMembershipSqlTable,
        calendarEventEntityAudienceSqlTable,
        workspaceId,
      });

      await this.runAdminQuery(
        dataSource,
        `DELETE FROM ${internalEntitySqlTable}
         WHERE "id" = ANY($1::uuid[])`,
        [duplicateEntityMappings.map((mapping) => mapping.duplicateId)],
      );

      this.logger.warn(
        `${duplicateEntityMappings.length} InternalEntity dupliquée(s) (nom en conflit avec un seed) fusionnée(s) puis supprimée(s).`,
      );
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

  private async findDuplicateInternalEntityMappings({
    dataSource,
    internalEntitySqlTable,
    seeds,
    workspaceId,
  }: {
    dataSource: GlobalWorkspaceDataSource;
    internalEntitySqlTable: string;
    seeds: InternalEntitySeed[];
    workspaceId: string;
  }): Promise<DuplicateInternalEntityMapping[]> {
    const { valuesSql: seedIdentifierValuesSql, parameters: seedParameters } =
      this.buildInternalEntitySeedIdentifierBatch(seeds);
    const workspaceIdParameterIndex = seedParameters.length + 1;

    return this.runAdminQuery<DuplicateInternalEntityMapping[]>(
      dataSource,
      `WITH seed_values(id, name) AS (
         VALUES ${seedIdentifierValuesSql}
       )
       SELECT internal_entity."id" AS "duplicateId",
              seed_values.id AS "canonicalId"
       FROM ${internalEntitySqlTable} internal_entity
       INNER JOIN seed_values
         ON seed_values.name = internal_entity."name"
       WHERE internal_entity."workspaceId" = $${workspaceIdParameterIndex}
         AND internal_entity."id" != seed_values.id`,
      [...seedParameters, workspaceId],
    );
  }

  // A duplicate InternalEntity (same name as a seed but a different id — e.g.
  // created ad hoc through the superadmin onboarding before the seed ran)
  // gets hard-deleted right after this. Every table that stores its id must
  // be repointed to the canonical seed id first, otherwise records silently
  // lose their entity assignment (opportunities, memberships, calendar
  // audience/visibility) once the duplicate row disappears.
  private async mergeDuplicateInternalEntities({
    dataSource,
    duplicateEntityMappings,
    opportunitySqlTable,
    personEntityMembershipSqlTable,
    companyEntityMembershipSqlTable,
    workspaceMemberEntityMembershipSqlTable,
    calendarEventEntityAudienceSqlTable,
    workspaceId,
  }: {
    dataSource: GlobalWorkspaceDataSource;
    duplicateEntityMappings: DuplicateInternalEntityMapping[];
    opportunitySqlTable: string;
    personEntityMembershipSqlTable: string;
    companyEntityMembershipSqlTable: string;
    workspaceMemberEntityMembershipSqlTable: string;
    calendarEventEntityAudienceSqlTable: string;
    workspaceId: string;
  }): Promise<void> {
    const junctionTables: Array<{
      sqlTable: string;
      sourceColumnName: string;
    }> = [
      {
        sqlTable: personEntityMembershipSqlTable,
        sourceColumnName: 'personId',
      },
      {
        sqlTable: companyEntityMembershipSqlTable,
        sourceColumnName: 'companyId',
      },
      {
        sqlTable: workspaceMemberEntityMembershipSqlTable,
        sourceColumnName: 'workspaceMemberId',
      },
      {
        sqlTable: calendarEventEntityAudienceSqlTable,
        sourceColumnName: 'calendarEventId',
      },
    ];

    for (const { duplicateId, canonicalId } of duplicateEntityMappings) {
      this.internalEntityAuditLoggerService.logInternalEntityMerge({
        workspaceId,
        canonicalInternalEntityId: canonicalId,
        duplicateInternalEntityIds: [duplicateId],
        affectedRecordCounts: {},
      });

      await this.repointDirectEntityReference({
        dataSource,
        sqlTable: opportunitySqlTable,
        duplicateId,
        canonicalId,
      });

      for (const { sqlTable, sourceColumnName } of junctionTables) {
        await this.repointJunctionEntityReference({
          dataSource,
          sqlTable,
          sourceColumnName,
          duplicateId,
          canonicalId,
        });
      }

      await this.repointCalendarChannelVisibleEntityIds({
        dataSource,
        duplicateId,
        canonicalId,
        workspaceId,
      });
    }
  }

  private async repointDirectEntityReference({
    dataSource,
    sqlTable,
    duplicateId,
    canonicalId,
  }: {
    dataSource: GlobalWorkspaceDataSource;
    sqlTable: string;
    duplicateId: string;
    canonicalId: string;
  }): Promise<void> {
    await this.runAdminQuery(
      dataSource,
      `UPDATE ${sqlTable}
       SET "internalEntityId" = $1,
           "updatedAt" = NOW()
       WHERE "internalEntityId" = $2`,
      [canonicalId, duplicateId],
    );
  }

  private async repointJunctionEntityReference({
    dataSource,
    sqlTable,
    sourceColumnName,
    duplicateId,
    canonicalId,
  }: {
    dataSource: GlobalWorkspaceDataSource;
    sqlTable: string;
    sourceColumnName: string;
    duplicateId: string;
    canonicalId: string;
  }): Promise<void> {
    const quotedSourceColumn = quoteSqlIdentifierOrThrow(sourceColumnName);

    // A row for (source, canonical entity) may already exist: drop the
    // duplicate-entity row instead of repointing it, to avoid ending up with
    // two membership rows for the same pair.
    await this.runAdminQuery(
      dataSource,
      `DELETE FROM ${sqlTable} duplicate_row
       USING ${sqlTable} canonical_row
       WHERE duplicate_row."internalEntityId" = $1
         AND canonical_row."internalEntityId" = $2
         AND canonical_row.${quotedSourceColumn} = duplicate_row.${quotedSourceColumn}`,
      [duplicateId, canonicalId],
    );

    await this.runAdminQuery(
      dataSource,
      `UPDATE ${sqlTable}
       SET "internalEntityId" = $1,
           "updatedAt" = NOW()
       WHERE "internalEntityId" = $2`,
      [canonicalId, duplicateId],
    );
  }

  // calendarChannel is a core-schema entity (not a workspace metadata
  // object), so it is addressed directly rather than resolved through
  // ObjectMetadataService.
  private async repointCalendarChannelVisibleEntityIds({
    dataSource,
    duplicateId,
    canonicalId,
    workspaceId,
  }: {
    dataSource: GlobalWorkspaceDataSource;
    duplicateId: string;
    canonicalId: string;
    workspaceId: string;
  }): Promise<void> {
    await this.runAdminQuery(
      dataSource,
      `UPDATE core."calendarChannel"
       SET "visibleInternalEntityIds" = (
             SELECT array_agg(DISTINCT entity_id)
             FROM unnest(array_replace("visibleInternalEntityIds", $1::uuid, $2::uuid)) AS entity_id
           ),
           "updatedAt" = NOW()
       WHERE "workspaceId" = $3
         AND $1 = ANY("visibleInternalEntityIds")`,
      [duplicateId, canonicalId, workspaceId],
    );
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

  private buildInternalEntitySeedIdentifierBatch(seeds: InternalEntitySeed[]): {
    valuesSql: string;
    parameters: string[];
  } {
    const parameters: string[] = [];

    const valuesSql = seeds
      .map((seed, index) => {
        const offset = index * 2;

        parameters.push(seed.id, seed.name);

        return `($${offset + 1}::uuid, $${offset + 2})`;
      })
      .join(', ');

    return { valuesSql, parameters };
  }

  private async backfillOpportunities(
    dataSource: GlobalWorkspaceDataSource,
    opportunitySqlTable: string,
  ): Promise<boolean> {
    this.logger.log('Backfill Opportunity → InternalEntity...');

    let skippedCount = 0;
    const unresolvedEntityNames = new Set<string>();
    const opportunityInternalEntityMappings: OpportunityInternalEntityMapping[] =
      [];
    let csvRows: CsvOpportunityRow[];

    try {
      csvRows =
        await this.importCsvOpportunitiesParserService.readCsvOpportunities();
    } catch (error) {
      if (error instanceof OpportunityCsvNotFoundError) {
        this.logger.warn(
          'docs/opportunity.csv introuvable, backfill CSV ignoré',
        );

        return false;
      }

      throw error;
    }

    for (const row of csvRows) {
      const entityId =
        this.internalEntityConfigurationService.resolveInternalEntityId(
          row.entityName,
        );

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
      `${migratedCount} opportunité(s) rattachée(s) depuis le CSV (${csvRows.length} ligne(s) lues, ${skippedCount} ignorée(s))`,
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

    return true;
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
         AND opportunity."internalEntityId" IS NULL
       RETURNING opportunity.id`,
      parameters,
    );

    return updatedRows.length;
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
    internalEntitySqlTable: string,
    workspaceMemberSqlTable: string,
    workspaceMemberEntityMembershipSqlTable: string,
  ): Promise<void> {
    const mappings = await this.selectDistinctRecordInternalEntityMappings(
      dataSource,
      `SELECT DISTINCT workspace_member."id" AS "recordId",
                manageable_entity."internalEntityId" AS "internalEntityId"
         FROM ${workspaceMemberSqlTable} workspace_member
         INNER JOIN core."user" core_user
           ON core_user."id" = workspace_member."userId"
         INNER JOIN LATERAL (
           SELECT core_user."entityId" AS "internalEntityId"
           WHERE core_user."entityId" IS NOT NULL
           UNION
           SELECT internal_entity."id" AS "internalEntityId"
           FROM ${internalEntitySqlTable} internal_entity
           WHERE core_user."canAccessFullAdminPanel" IS TRUE
             AND internal_entity."deletedAt" IS NULL
         ) manageable_entity ON TRUE
         WHERE workspace_member."deletedAt" IS NULL
           AND core_user."deletedAt" IS NULL
           AND manageable_entity."internalEntityId" IS NOT NULL`,
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

  private async ensureMembershipIntegrity(
    dataSource: GlobalWorkspaceDataSource,
    membershipTargets: InternalEntityMembershipUniqueIndexTarget[],
  ): Promise<void> {
    for (const membershipTarget of membershipTargets) {
      const deduplicatedMembershipRows = await this.runAdminQuery<
        Array<{ count: string }>
      >(dataSource, buildDeduplicateActiveMembershipsQuery(membershipTarget));
      const deduplicatedMembershipCount = parseInt(
        deduplicatedMembershipRows[0]?.count ?? '0',
        10,
      );

      if (deduplicatedMembershipCount > 0) {
        this.logger.warn(
          `${deduplicatedMembershipCount} membership(s) actif(s) dupliqué(s) nettoyé(s) dans ${membershipTarget.membershipSqlTable}`,
        );
      }

      const deletedMembershipRows = await this.runAdminQuery<
        Array<{ count: string }>
      >(
        dataSource,
        buildDeleteRedundantSoftDeletedMembershipsQuery(membershipTarget),
      );
      const deletedMembershipCount = parseInt(
        deletedMembershipRows[0]?.count ?? '0',
        10,
      );

      if (deletedMembershipCount > 0) {
        this.logger.warn(
          `${deletedMembershipCount} membership(s) soft-delete redondant(s) supprimé(s) dans ${membershipTarget.membershipSqlTable}`,
        );
      }

      await this.runAdminQuery(
        dataSource,
        buildCreateActiveMembershipUniqueIndexQuery(membershipTarget),
      );
      await this.runAdminQuery(
        dataSource,
        buildCreateInternalEntityIdIndexQuery({
          sqlTable: membershipTarget.membershipSqlTable,
          indexName: membershipTarget.internalEntityIdIndexName,
        }),
      );
    }
  }

  private async cleanupPrimaryDevWorkspaceMemberships({
    workspaceId,
    dataSource,
    internalEntitySqlTable,
    companySqlTable,
    personSqlTable,
    opportunitySqlTable,
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
    opportunitySqlTable: string;
    companyEntityMembershipSqlTable: string;
    personEntityMembershipSqlTable: string;
    workspaceMemberSqlTable: string;
    workspaceMemberEntityMembershipSqlTable: string;
  }): Promise<void> {
    if (workspaceId !== SEED_APPLE_WORKSPACE_ID) {
      return;
    }

    // Ce nettoyage ne vise que le bruit produit par les cascades
    // Person <-> Company du seed de démo. Une adhésion est conservée si elle est
    // justifiée par une donnée réelle :
    //   1. la société EST l'entité (auto-référence canonique : WEKNOW <-> WEKNOW) ;
    //   2. ou une opportunité rattache cette société / ce contact à cette entité.
    // Sans la règle 2, le nettoyage supprimait les adhésions que
    // `backfillCompanyMembershipsFromOpportunities` venait de créer dans le même
    // run : les 16 sociétés clientes restaient orphelines alors que leurs
    // opportunités étaient bien rattachées, rendant l'environnement de dev non
    // représentatif de la prod (où 59/59 sociétés sont rattachées).
    this.logger.log(
      'Nettoyage des memberships de démo (conserve les correspondances canoniques et celles justifiées par une opportunité)...',
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
         AND NOT EXISTS (
           SELECT 1
           FROM ${opportunitySqlTable} opportunity
           WHERE opportunity."companyId" = membership."companyId"
             AND opportunity."internalEntityId" = membership."internalEntityId"
             AND opportunity."deletedAt" IS NULL
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
         AND NOT EXISTS (
           SELECT 1
           FROM ${opportunitySqlTable} opportunity
           WHERE opportunity."pointOfContactId" = membership."personId"
             AND opportunity."internalEntityId" = membership."internalEntityId"
             AND opportunity."deletedAt" IS NULL
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
    {
      shouldThrowOnUnresolvedOpportunities = true,
    }: {
      shouldThrowOnUnresolvedOpportunities?: boolean;
    } = {},
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
      const message = `${nullCount} opportunité(s) sans internalEntityId après migration. Ajoutez les entreprises manquantes à INTERNAL_ENTITY_SEEDS, corrigez le CSV ou migrez explicitement ces opportunités.`;

      if (!shouldThrowOnUnresolvedOpportunities) {
        this.logger.warn(message);

        return;
      }

      throw new Error(message);
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
      if (
        existing.labelSingular !== labelSingular ||
        existing.labelPlural !== labelPlural ||
        existing.icon !== icon
      ) {
        return this.objectMetadataService.updateOneObject({
          updateObjectInput: {
            id: existing.id,
            update: {
              labelSingular,
              labelPlural,
              icon,
            },
          },
          workspaceId,
        });
      }

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
      if (existing.label !== label || existing.icon !== icon) {
        await this.fieldMetadataService.updateOneField({
          updateFieldInput: {
            id: existing.id,
            label,
            icon,
          },
          workspaceId,
          isSystemBuild: true,
        });
      }

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
      if (existing.label !== label || existing.icon !== icon) {
        await this.fieldMetadataService.updateOneField({
          updateFieldInput: {
            id: existing.id,
            label,
            icon,
          },
          workspaceId,
        });
      }

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

  private async applyCalendarEventJunctionCascadeOnDelete({
    workspaceId,
    flatMaps,
    junctionObjectNameSingular,
  }: {
    workspaceId: string;
    flatMaps: FlatMaps;
    junctionObjectNameSingular: string;
  }): Promise<void> {
    const fieldId = this.findFieldId(
      junctionObjectNameSingular,
      'calendarEvent',
      flatMaps,
    );
    const existingField = findFlatEntityByIdInFlatEntityMaps({
      flatEntityId: fieldId,
      flatEntityMaps: flatMaps.flatFieldMetadataMaps,
    });

    if (!isDefined(existingField)) {
      return;
    }

    const existingSettings =
      (existingField.settings as Record<string, unknown> | null | undefined) ??
      {};
    const hasCascade =
      existingSettings.onDelete === RelationOnDeleteAction.CASCADE;
    const hasJoinColumn = typeof existingSettings.joinColumnName === 'string';

    if (hasCascade && hasJoinColumn) {
      return;
    }

    await this.fieldMetadataService.updateOneField({
      updateFieldInput: {
        id: fieldId,
        settings: {
          ...existingSettings,
          relationType: RelationType.MANY_TO_ONE,
          joinColumnName: hasJoinColumn
            ? (existingSettings.joinColumnName as string)
            : 'calendarEventId',
          onDelete: RelationOnDeleteAction.CASCADE,
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
