import { Logger } from '@nestjs/common';

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

import { INTERNAL_ENTITY_SEEDS } from 'src/modules/internal-entity/constants/internal-entity-seeds.constant';
import { OPPORTUNITY_ENTITY_MIGRATION_MAP } from 'src/modules/internal-entity/constants/opportunity-entity-migration.constant';

type FlatMaps = {
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  objectIdByName: Record<string, string>;
};

@Command({
  name: 'init-internal-entities',
  description:
    'Crée InternalEntity, les relations M2M Person/Company, seed les 4 entités, migre les opportunités existantes',
})
export class InitInternalEntitiesCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  private readonly logger = new Logger(InitInternalEntitiesCommand.name);

  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly objectMetadataService: ObjectMetadataService,
    private readonly fieldMetadataService: FieldMetadataService,
    private readonly flatEntityMapsCacheService: WorkspaceManyOrAllFlatEntityMapsCacheService,
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

    const schemaName = getWorkspaceSchemaName(workspaceId);

    // ÉTAPE 1: Idempotence — vérifie si l'objet existe déjà
    const existing = await this.objectMetadataService.findOneWithinWorkspace(
      workspaceId,
      { where: { nameSingular: 'internalEntity' } },
    );

    if (!isDefined(existing)) {
      await this.createMetadataSchema(workspaceId);
    } else {
      this.logger.log(
        `InternalEntity existe déjà pour le workspace ${workspaceId}, schéma ignoré`,
      );
    }

    // ÉTAPE 6: Seed des 4 instances InternalEntity
    await this.seedInternalEntities(dataSource, schemaName);

    // ÉTAPE 7: Backfill Opportunity → InternalEntity
    await this.backfillOpportunities(dataSource, schemaName);

    // ÉTAPE 8: Vérification finale
    await this.verifyMigration(dataSource, schemaName);
  }

  private async createMetadataSchema(workspaceId: string): Promise<void> {
    // ÉTAPE 2: Créer l'objet InternalEntity
    this.logger.log('Création de l\'objet InternalEntity...');

    const internalEntityMetadata =
      await this.objectMetadataService.createOneObject({
        createObjectInput: {
          nameSingular: 'internalEntity',
          namePlural: 'internalEntities',
          labelSingular: 'Internal Entity',
          labelPlural: 'Internal Entities',
          icon: 'IconBuilding',
        },
        workspaceId,
      });

    this.logger.log(`InternalEntity créé (id=${internalEntityMetadata.id})`);

    // ÉTAPE 3: Créer les objets junction
    this.logger.log('Création des objets junction...');

    const personEntityMembershipMetadata =
      await this.objectMetadataService.createOneObject({
        createObjectInput: {
          nameSingular: 'personEntityMembership',
          namePlural: 'personEntityMemberships',
          labelSingular: 'Person Entity Membership',
          labelPlural: 'Person Entity Memberships',
          icon: 'IconUserCircle',
          skipNameField: true,
        },
        workspaceId,
      });

    const companyEntityMembershipMetadata =
      await this.objectMetadataService.createOneObject({
        createObjectInput: {
          nameSingular: 'companyEntityMembership',
          namePlural: 'companyEntityMemberships',
          labelSingular: 'Company Entity Membership',
          labelPlural: 'Company Entity Memberships',
          icon: 'IconBuildingSkyscraper',
          skipNameField: true,
        },
        workspaceId,
      });

    this.logger.log(
      `Junction objects créés: personEntityMembership (id=${personEntityMembershipMetadata.id}), companyEntityMembership (id=${companyEntityMembershipMetadata.id})`,
    );

    // Récupérer les IDs des objets standard (person, company, opportunity)
    const personMetadata =
      await this.objectMetadataService.findOneWithinWorkspace(workspaceId, {
        where: { nameSingular: 'person' },
      });
    const companyMetadata =
      await this.objectMetadataService.findOneWithinWorkspace(workspaceId, {
        where: { nameSingular: 'company' },
      });
    const opportunityMetadata =
      await this.objectMetadataService.findOneWithinWorkspace(workspaceId, {
        where: { nameSingular: 'opportunity' },
      });

    if (
      !isDefined(personMetadata) ||
      !isDefined(companyMetadata) ||
      !isDefined(opportunityMetadata)
    ) {
      throw new Error(
        'Objets standard person/company/opportunity introuvables dans le workspace',
      );
    }

    // ÉTAPE 4a: Champs junction Person <-> InternalEntity
    this.logger.log('Création des champs junction Person <-> InternalEntity...');

    await this.fieldMetadataService.createManyFields({
      createFieldInputs: [
        {
          type: FieldMetadataType.RELATION,
          name: 'internalEntities',
          label: 'Internal Entities',
          icon: 'IconBuilding',
          objectMetadataId: personMetadata.id,
          relationCreationPayload: {
            type: RelationType.ONE_TO_MANY,
            targetFieldLabel: 'Person',
            targetFieldIcon: 'IconUser',
            targetObjectMetadataId: personEntityMembershipMetadata.id,
          },
        },
      ],
      workspaceId,
    });

    await this.fieldMetadataService.createManyFields({
      createFieldInputs: [
        {
          type: FieldMetadataType.RELATION,
          name: 'persons',
          label: 'Persons',
          icon: 'IconUser',
          objectMetadataId: internalEntityMetadata.id,
          relationCreationPayload: {
            type: RelationType.ONE_TO_MANY,
            targetFieldLabel: 'Internal Entity',
            targetFieldIcon: 'IconBuilding',
            targetObjectMetadataId: personEntityMembershipMetadata.id,
          },
        },
      ],
      workspaceId,
    });

    // ÉTAPE 4b: Champs junction Company <-> InternalEntity
    this.logger.log(
      'Création des champs junction Company <-> InternalEntity...',
    );

    await this.fieldMetadataService.createManyFields({
      createFieldInputs: [
        {
          type: FieldMetadataType.RELATION,
          name: 'internalEntities',
          label: 'Internal Entities',
          icon: 'IconBuilding',
          objectMetadataId: companyMetadata.id,
          relationCreationPayload: {
            type: RelationType.ONE_TO_MANY,
            targetFieldLabel: 'Company',
            targetFieldIcon: 'IconBuildingSkyscraper',
            targetObjectMetadataId: companyEntityMembershipMetadata.id,
          },
        },
      ],
      workspaceId,
    });

    await this.fieldMetadataService.createManyFields({
      createFieldInputs: [
        {
          type: FieldMetadataType.RELATION,
          name: 'companies',
          label: 'Companies',
          icon: 'IconBuildingSkyscraper',
          objectMetadataId: internalEntityMetadata.id,
          relationCreationPayload: {
            type: RelationType.ONE_TO_MANY,
            targetFieldLabel: 'Internal Entity',
            targetFieldIcon: 'IconBuilding',
            targetObjectMetadataId: companyEntityMembershipMetadata.id,
          },
        },
      ],
      workspaceId,
    });

    // ÉTAPE 4c: Configuration des champs junction (junctionTargetFieldId)
    this.logger.log('Configuration des champs junction (junctionTargetFieldId)...');

    const flatMaps = await this.getFreshMaps(workspaceId);

    // person.internalEntities → cible: personEntityMembership.internalEntity
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

    // internalEntity.persons → cible: personEntityMembership.person
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

    // company.internalEntities → cible: companyEntityMembership.internalEntity
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

    // internalEntity.companies → cible: companyEntityMembership.company
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

    // ÉTAPE 5: Champ internalEntity sur Opportunity (MANY_TO_ONE)
    this.logger.log('Ajout du champ internalEntity sur Opportunity...');

    await this.fieldMetadataService.createOneField({
      createFieldInput: {
        type: FieldMetadataType.RELATION,
        name: 'internalEntity',
        label: 'Internal Entity',
        icon: 'IconBuilding',
        objectMetadataId: opportunityMetadata.id,
        relationCreationPayload: {
          type: RelationType.MANY_TO_ONE,
          targetFieldLabel: 'Opportunities',
          targetFieldIcon: 'IconTargetArrow',
          targetObjectMetadataId: internalEntityMetadata.id,
        },
      },
      workspaceId,
    });

    this.logger.log('Schéma InternalEntity créé avec succès');
  }

  private async seedInternalEntities(
    dataSource: GlobalWorkspaceDataSource,
    schemaName: string,
  ): Promise<void> {
    this.logger.log('Seed des 4 InternalEntity...');

    for (const seed of Object.values(INTERNAL_ENTITY_SEEDS)) {
      await dataSource.query(
        `INSERT INTO "${schemaName}"."internalEntity" ("id", "name", "position", "createdAt", "updatedAt")
         VALUES ($1, $2, 0, NOW(), NOW())
         ON CONFLICT ("id") DO NOTHING`,
        [seed.id, seed.name],
        undefined,
        { shouldBypassPermissionChecks: true },
      );
    }

    this.logger.log(
      `${Object.keys(INTERNAL_ENTITY_SEEDS).length} InternalEntity seedées`,
    );
  }

  private async backfillOpportunities(
    dataSource: GlobalWorkspaceDataSource,
    schemaName: string,
  ): Promise<void> {
    this.logger.log('Backfill Opportunity → InternalEntity...');

    let migratedCount = 0;

    for (const [opportunityId, entityId] of Object.entries(
      OPPORTUNITY_ENTITY_MIGRATION_MAP,
    )) {
      const result = await dataSource.query(
        `UPDATE "${schemaName}"."opportunity"
         SET "internalEntityId" = $1
         WHERE id = $2 AND "internalEntityId" IS NULL`,
        [entityId, opportunityId],
        undefined,
        { shouldBypassPermissionChecks: true },
      );

      migratedCount += result?.[1] ?? 0;
    }

    this.logger.log(`${migratedCount} opportunités migrées`);

    // Fallback : toute opportunité sans internalEntityId → ANGLE_INTELLIGENCE
    const fallbackResult = await dataSource.query(
      `UPDATE "${schemaName}"."opportunity"
       SET "internalEntityId" = $1
       WHERE "internalEntityId" IS NULL AND "deletedAt" IS NULL`,
      [INTERNAL_ENTITY_SEEDS.ANGLE_INTELLIGENCE.id],
      undefined,
      { shouldBypassPermissionChecks: true },
    );

    const fallbackCount = fallbackResult?.[1] ?? 0;

    if (fallbackCount > 0) {
      this.logger.log(
        `${fallbackCount} opportunité(s) assignée(s) à ANGLE_INTELLIGENCE (fallback)`,
      );
    }
  }

  private async verifyMigration(
    dataSource: GlobalWorkspaceDataSource,
    schemaName: string,
  ): Promise<void> {
    const result = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count
       FROM "${schemaName}"."opportunity"
       WHERE "internalEntityId" IS NULL
         AND "deletedAt" IS NULL`,
      undefined,
      undefined,
      { shouldBypassPermissionChecks: true },
    );

    const nullCount = parseInt(result?.[0]?.count ?? '0', 10);

    if (nullCount > 0) {
      this.logger.warn(
        `${nullCount} opportunité(s) sans internalEntityId après migration`,
      );
    } else {
      this.logger.log(
        'Vérification OK : toutes les opportunités ont un internalEntityId',
      );
    }
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

    const { idByNameSingular } = buildObjectIdByNameMaps(flatObjectMetadataMaps);

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
}
