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
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';

import {
  buildMissingInternalEntityAfterMigrationError,
  buildUnknownInternalEntitiesCsvWarning,
} from 'src/modules/internal-entity/constants/import-csv-opportunities.constant';
import { type InternalEntitySeed } from 'src/modules/internal-entity/constants/internal-entity-seeds.constant';
import { InternalEntityConfigurationService } from 'src/modules/internal-entity/services/internal-entity-configuration.service';
import { ImportCsvOpportunitiesParserService } from 'src/modules/internal-entity/services/import-csv-opportunities-parser.service';
import {
  buildWorkspaceSqlTableName,
  INTERNAL_ENTITY_ADMIN_QUERY_OPTIONS,
  resolveObjectTableNameOrThrow,
  validateUuidOrThrow,
} from 'src/modules/internal-entity/utils/internal-entity-command.utils';

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
    private readonly internalEntityConfigurationService: InternalEntityConfigurationService,
    private readonly importCsvOpportunitiesParserService: ImportCsvOpportunitiesParserService,
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
    const internalEntitySqlTable = buildWorkspaceSqlTableName(
      schemaName,
      internalEntityTableName,
    );
    const opportunitySqlTable = buildWorkspaceSqlTableName(
      schemaName,
      opportunityTableName,
    );

    await this.seedInternalEntities(
      dataSource,
      internalEntitySqlTable,
      validatedWorkspaceId,
    );
    await this.backfillOpportunities(dataSource, opportunitySqlTable);
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

    const seeds =
      this.internalEntityConfigurationService.getInternalEntitySeeds();

    if (seeds.length === 0) {
      this.logger.warn('Aucune InternalEntity configurée');

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
      `${migratedCount} opportunité(s) synchronisée(s) depuis le CSV (${csvRows.length} ligne(s) lues, ${skippedCount} ignorée(s))`,
    );

    if (unresolvedEntityNames.size > 0) {
      this.logger.warn(
        buildUnknownInternalEntitiesCsvWarning([...unresolvedEntityNames]),
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
      throw new Error(buildMissingInternalEntityAfterMigrationError(nullCount));
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
