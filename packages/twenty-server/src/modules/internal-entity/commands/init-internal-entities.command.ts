import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { isNonEmptyString } from '@sniptt/guards';

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
import { computeObjectTargetTable } from 'src/engine/utils/compute-object-target-table.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';

import { INTERNAL_ENTITY_SEEDS } from 'src/modules/internal-entity/constants/internal-entity-seeds.constant';

type FlatMaps = {
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  objectIdByName: Record<string, string>;
};

type OpportunityCsvRow = {
  opportunityId: string;
  entityName: string | null;
};

@Command({
  name: 'init-internal-entities',
  description:
    'Crée InternalEntity, les relations M2M Person/Company, seed les 4 entités, migre les opportunités existantes',
})
export class InitInternalEntitiesCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
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

    await this.ensureMetadataSchema(workspaceId);
    const internalEntityTableName = await this.resolveObjectTableNameOrThrow(
      workspaceId,
      'internalEntity',
    );

    await this.seedInternalEntities(
      dataSource,
      schemaName,
      internalEntityTableName,
      workspaceId,
    );
    await this.backfillOpportunities(dataSource, schemaName);
    await this.verifyMigration(dataSource, schemaName);
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
    schemaName: string,
    internalEntityTableName: string,
    workspaceId: string,
  ): Promise<void> {
    this.logger.log('Seed des 4 InternalEntity...');

    for (const seed of Object.values(INTERNAL_ENTITY_SEEDS)) {
      await dataSource.query(
        `INSERT INTO "${schemaName}"."${internalEntityTableName}" ("id", "name", "color", "workspaceId", "position", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 0, NOW(), NOW())
         ON CONFLICT ("id") DO UPDATE
         SET "name" = EXCLUDED."name",
             "color" = EXCLUDED."color",
             "workspaceId" = EXCLUDED."workspaceId",
             "updatedAt" = NOW()`,
        [seed.id, seed.name, seed.color, workspaceId],
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
    let csvFallbackCount = 0;
    const csvRows = await this.readOpportunityCsvRows();

    for (const { opportunityId, entityName } of csvRows) {
      const resolvedEntityId = this.resolveInternalEntityId(entityName);
      const entityId =
        resolvedEntityId ?? INTERNAL_ENTITY_SEEDS.ANGLE_INTELLIGENCE.id;

      if (!isDefined(resolvedEntityId)) {
        csvFallbackCount += 1;
      }

      const result = await dataSource.query(
        `UPDATE "${schemaName}"."opportunity"
         SET "internalEntityId" = $1
         WHERE id = $2
           AND "deletedAt" IS NULL
           AND "internalEntityId" IS DISTINCT FROM $1`,
        [entityId, opportunityId],
        undefined,
        { shouldBypassPermissionChecks: true },
      );

      migratedCount += result?.[1] ?? 0;
    }

    this.logger.log(
      `${migratedCount} opportunité(s) synchronisée(s) depuis le CSV (${csvRows.length} ligne(s) lues)`,
    );

    const orphanFallbackResult = await dataSource.query(
      `UPDATE "${schemaName}"."opportunity"
       SET "internalEntityId" = $1
       WHERE "internalEntityId" IS NULL AND "deletedAt" IS NULL`,
      [INTERNAL_ENTITY_SEEDS.ANGLE_INTELLIGENCE.id],
      undefined,
      { shouldBypassPermissionChecks: true },
    );

    const orphanFallbackCount = orphanFallbackResult?.[1] ?? 0;

    if (csvFallbackCount > 0 || orphanFallbackCount > 0) {
      this.logger.log(
        `${csvFallbackCount} opportunité(s) CSV et ${orphanFallbackCount} opportunité(s) orpheline(s) assignée(s) à ANGLE_INTELLIGENCE (fallback)`,
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
      throw new Error(
        `${nullCount} opportunité(s) sans internalEntityId après migration`,
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

  private async resolveObjectTableNameOrThrow(
    workspaceId: string,
    nameSingular: string,
  ): Promise<string> {
    const objectMetadata = await this.findObjectMetadataOrThrow(
      workspaceId,
      nameSingular,
    );

    return computeObjectTargetTable({
      nameSingular: objectMetadata.nameSingular,
      isCustom: objectMetadata.isCustom,
    });
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

  private async readOpportunityCsvRows(): Promise<OpportunityCsvRow[]> {
    const opportunityCsvPath = await this.resolveOpportunityCsvPath();
    const csvContent = await readFile(opportunityCsvPath, 'utf8');
    const lines = csvContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) {
      throw new Error(
        `Le fichier ${opportunityCsvPath} ne contient aucune donnée exploitable`,
      );
    }

    const [headerLine, ...dataLines] = lines;
    const headers = this.parseCsvLine(headerLine);
    const opportunityIdIndex = headers.indexOf('Id');
    const entityColumnIndex = headers.indexOf('Société');

    if (opportunityIdIndex === -1 || entityColumnIndex === -1) {
      throw new Error(
        `Colonnes obligatoires introuvables dans ${opportunityCsvPath}`,
      );
    }

    return dataLines.map((line, index) => {
      const values = this.parseCsvLine(line);
      const opportunityId = values[opportunityIdIndex]?.trim();

      if (!isNonEmptyString(opportunityId)) {
        throw new Error(
          `Ligne ${index + 2} invalide dans ${opportunityCsvPath}: Id manquant`,
        );
      }

      return {
        opportunityId,
        entityName: this.parseEntityName(
          values[entityColumnIndex] ?? '',
          opportunityCsvPath,
        ),
      };
    });
  }

  private parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let currentValue = '';
    let isInsideQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const currentCharacter = line[index];
      const nextCharacter = line[index + 1];

      if (currentCharacter === '"') {
        if (isInsideQuotes && nextCharacter === '"') {
          currentValue += '"';
          index += 1;
        } else {
          isInsideQuotes = !isInsideQuotes;
        }

        continue;
      }

      if (currentCharacter === ',' && !isInsideQuotes) {
        values.push(currentValue);
        currentValue = '';

        continue;
      }

      currentValue += currentCharacter;
    }

    values.push(currentValue);

    return values;
  }

  private async resolveOpportunityCsvPath(): Promise<string> {
    for (const parentDepth of [0, 1, 2, 3, 4]) {
      const opportunityCsvPath = resolve(
        process.cwd(),
        '../'.repeat(parentDepth),
        'docs/opportunity.csv',
      );

      try {
        await access(opportunityCsvPath);

        return opportunityCsvPath;
      } catch {
        continue;
      }
    }

    throw new Error(
      `Fichier docs/opportunity.csv introuvable depuis ${process.cwd()}`,
    );
  }

  private parseEntityName(
    value: string,
    opportunityCsvPath: string,
  ): string | null {
    if (!isNonEmptyString(value)) {
      return null;
    }

    let parsedValue: unknown;

    try {
      parsedValue = JSON.parse(value);
    } catch {
      throw new Error(
        `Valeur Société invalide dans ${opportunityCsvPath}: ${value}`,
      );
    }

    if (!Array.isArray(parsedValue) || parsedValue.length === 0) {
      return null;
    }

    const [firstEntityName] = parsedValue;

    if (!isNonEmptyString(firstEntityName)) {
      return null;
    }

    return firstEntityName;
  }

  private resolveInternalEntityId(entityName: string | null): string | null {
    if (!isNonEmptyString(entityName)) {
      return null;
    }

    return INTERNAL_ENTITY_SEEDS[entityName]?.id ?? null;
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
}
