import { Injectable, Logger } from '@nestjs/common';

import {
  FieldMetadataType,
  RelationOnDeleteAction,
  RelationType,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { FieldMetadataService } from 'src/engine/metadata-modules/field-metadata/services/field-metadata.service';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { buildObjectIdByNameMaps } from 'src/engine/metadata-modules/flat-object-metadata/utils/build-object-id-by-name-maps.util';
import { ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';

type FlatMaps = {
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  objectIdByName: Record<string, string>;
};

@Injectable()
export class InternalEntitySchemaService {
  private readonly logger = new Logger(InternalEntitySchemaService.name);

  constructor(
    private readonly objectMetadataService: ObjectMetadataService,
    private readonly fieldMetadataService: FieldMetadataService,
    private readonly flatEntityMapsCacheService: WorkspaceManyOrAllFlatEntityMapsCacheService,
  ) {}

  async ensureSchema(workspaceId: string): Promise<void> {
    const existing = await this.objectMetadataService.findOneWithinWorkspace(
      workspaceId,
      { where: { nameSingular: 'internalEntity' } },
    );

    if (isDefined(existing)) {
      this.logger.verbose(
        `InternalEntity schema already exists for workspace ${workspaceId}, skipping`,
      );

      return;
    }

    this.logger.log(
      `Creating InternalEntity schema for workspace ${workspaceId}...`,
    );

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

    this.logger.log(
      `InternalEntity schema created for workspace ${workspaceId}`,
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

    this.logger.log(`Creating object ${nameSingular}...`);

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
        `Standard object not found in workspace: ${nameSingular}`,
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
      throw new Error(`Object not found in flat maps: ${objectName}`);
    }

    const objectMetadata = findFlatEntityByIdInFlatEntityMaps({
      flatEntityId: objectId,
      flatEntityMaps: flatMaps.flatObjectMetadataMaps,
    });

    if (!isDefined(objectMetadata)) {
      throw new Error(`Object metadata not found: ${objectName}`);
    }

    for (const fieldId of objectMetadata.fieldIds) {
      const field = findFlatEntityByIdInFlatEntityMaps({
        flatEntityId: fieldId,
        flatEntityMaps: flatMaps.flatFieldMetadataMaps,
      });

      if (isDefined(field) && field.name === fieldName) {
        return fieldId;
      }
    }

    throw new Error(
      `Field ${fieldName} not found on ${objectName} (objectId=${objectId})`,
    );
  }
}
