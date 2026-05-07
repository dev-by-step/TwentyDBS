import { getInternalEntityRelationFieldBehavior } from '@/internal-entity/utils/getInternalEntityRelationFieldBehavior';
import { isInternalEntityRelationField } from '@/internal-entity/utils/isInternalEntityRelationField';
import { FieldMetadataType } from 'twenty-shared/types';
import { FieldDisplayMode } from '~/generated-metadata/graphql';
import type { FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';

type MockObjectMetadataItem = {
  id: string;
  nameSingular: string;
  fields: FieldMetadataItem[];
  labelIdentifierFieldMetadataId: string;
  imageIdentifierFieldMetadataId: string;
  namePlural: string;
};

const createRelationField = ({
  id,
  targetObjectMetadataId,
  targetObjectMetadataNameSingular,
}: {
  id: string;
  targetObjectMetadataId: string;
  targetObjectMetadataNameSingular: string;
}): FieldMetadataItem =>
  ({
    id,
    universalIdentifier: id,
    label: id,
    name: id,
    type: FieldMetadataType.RELATION,
    isNullable: true,
    isActive: true,
    isSystem: false,
    isCustom: false,
    defaultValue: null,
    options: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fromRelationMetadata: null,
    toRelationMetadata: null,
    relationDefinition: null,
    morphRelations: null,
    relation: {
      targetObjectMetadata: {
        id: targetObjectMetadataId,
        nameSingular: targetObjectMetadataNameSingular,
      },
    },
    settings: null,
  }) as unknown as FieldMetadataItem;

describe('isInternalEntityRelationField', () => {
  const personObjectId = 'person-object-id';
  const junctionObjectId = 'person-entity-membership-object-id';
  const internalEntityObjectId = 'internal-entity-object-id';
  const companyObjectId = 'company-object-id';

  const sourceField = createRelationField({
    id: 'person-field-id',
    targetObjectMetadataId: personObjectId,
    targetObjectMetadataNameSingular: 'person',
  });

  const internalEntityTargetField = createRelationField({
    id: 'internal-entity-target-field-id',
    targetObjectMetadataId: internalEntityObjectId,
    targetObjectMetadataNameSingular: 'internalEntity',
  });

  const companyTargetField = createRelationField({
    id: 'company-target-field-id',
    targetObjectMetadataId: companyObjectId,
    targetObjectMetadataNameSingular: 'company',
  });

  const objectMetadataItems: MockObjectMetadataItem[] = [
    {
      id: junctionObjectId,
      nameSingular: 'personEntityMembership',
      namePlural: 'personEntityMemberships',
      fields: [sourceField, internalEntityTargetField],
      labelIdentifierFieldMetadataId: 'name-field-id',
      imageIdentifierFieldMetadataId: 'avatar-field-id',
    },
  ];

  it('should return true for a junction relation targeting InternalEntity', () => {
    const fieldMetadataItem = createRelationField({
      id: 'person-internal-entities-field-id',
      targetObjectMetadataId: junctionObjectId,
      targetObjectMetadataNameSingular: 'personEntityMembership',
    });

    fieldMetadataItem.settings = {
      junctionTargetFieldId: internalEntityTargetField.id,
    };

    expect(
      isInternalEntityRelationField({
        fieldMetadataItem,
        sourceObjectMetadataId: personObjectId,
        objectMetadataItems,
      }),
    ).toBe(true);

    expect(
      getInternalEntityRelationFieldBehavior({
        fieldMetadataItem,
        sourceObjectMetadataId: personObjectId,
        objectMetadataItems,
      }),
    ).toEqual({
      canCreateTargetRecord: false,
      fieldWidgetDisplayMode: FieldDisplayMode.FIELD,
      internalEntityObjectMetadataId: internalEntityObjectId,
      requiresDetachConfirmation: true,
      shouldDisplayContentWhenEmpty: true,
      shouldRenderWithFieldWidgetDisplay: true,
    });
  });

  it('should return false when the junction target is another object', () => {
    const fieldMetadataItem = createRelationField({
      id: 'person-companies-field-id',
      targetObjectMetadataId: junctionObjectId,
      targetObjectMetadataNameSingular: 'personEntityMembership',
    });

    fieldMetadataItem.settings = {
      junctionTargetFieldId: companyTargetField.id,
    };

    const objectMetadataItemsWithCompanyTarget: MockObjectMetadataItem[] = [
      {
        ...objectMetadataItems[0],
        fields: [sourceField, companyTargetField],
      },
    ];

    expect(
      isInternalEntityRelationField({
        fieldMetadataItem,
        sourceObjectMetadataId: personObjectId,
        objectMetadataItems: objectMetadataItemsWithCompanyTarget,
      }),
    ).toBe(false);

    expect(
      getInternalEntityRelationFieldBehavior({
        fieldMetadataItem,
        sourceObjectMetadataId: personObjectId,
        objectMetadataItems: objectMetadataItemsWithCompanyTarget,
      }),
    ).toBeNull();
  });

  it('should return false for a relation without junction configuration', () => {
    const fieldMetadataItem = createRelationField({
      id: 'person-standard-relation-field-id',
      targetObjectMetadataId: internalEntityObjectId,
      targetObjectMetadataNameSingular: 'internalEntity',
    });

    expect(
      isInternalEntityRelationField({
        fieldMetadataItem,
        sourceObjectMetadataId: personObjectId,
        objectMetadataItems,
      }),
    ).toBe(false);

    expect(
      getInternalEntityRelationFieldBehavior({
        fieldMetadataItem,
        sourceObjectMetadataId: personObjectId,
        objectMetadataItems,
      }),
    ).toBeNull();
  });
});
