import { getInternalEntityRelationFieldBehavior } from '@/internal-entity/utils/getInternalEntityRelationFieldBehavior';
import { isInternalEntityRelationField } from '@/internal-entity/utils/isInternalEntityRelationField';
import { FieldDisplayMode } from '~/generated-metadata/graphql';
import type { FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { buildRelationFieldMetadataItem } from '~/testing/utils/buildRelationFieldMetadataItem';

type MockObjectMetadataItem = {
  id: string;
  nameSingular: string;
  fields: FieldMetadataItem[];
  labelIdentifierFieldMetadataId: string;
  imageIdentifierFieldMetadataId: string;
  namePlural: string;
};

describe('isInternalEntityRelationField', () => {
  const personObjectId = 'person-object-id';
  const junctionObjectId = 'person-entity-membership-object-id';
  const internalEntityObjectId = 'internal-entity-object-id';
  const companyObjectId = 'company-object-id';

  const sourceField = buildRelationFieldMetadataItem({
    id: 'person-field-id',
    relationTargetObjectMetadata: {
      id: personObjectId,
      nameSingular: 'person',
    },
  });

  const internalEntityTargetField = buildRelationFieldMetadataItem({
    id: 'internal-entity-target-field-id',
    relationTargetObjectMetadata: {
      id: internalEntityObjectId,
      nameSingular: 'internalEntity',
    },
  });

  const companyTargetField = buildRelationFieldMetadataItem({
    id: 'company-target-field-id',
    relationTargetObjectMetadata: {
      id: companyObjectId,
      nameSingular: 'company',
    },
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
    const fieldMetadataItem = buildRelationFieldMetadataItem({
      id: 'person-internal-entities-field-id',
      relationTargetObjectMetadata: {
        id: junctionObjectId,
        nameSingular: 'personEntityMembership',
      },
      settings: {
        junctionTargetFieldId: internalEntityTargetField.id,
      },
    });

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
    const fieldMetadataItem = buildRelationFieldMetadataItem({
      id: 'person-companies-field-id',
      relationTargetObjectMetadata: {
        id: junctionObjectId,
        nameSingular: 'personEntityMembership',
      },
      settings: {
        junctionTargetFieldId: companyTargetField.id,
      },
    });

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
    const fieldMetadataItem = buildRelationFieldMetadataItem({
      id: 'person-standard-relation-field-id',
      relationTargetObjectMetadata: {
        id: internalEntityObjectId,
        nameSingular: 'internalEntity',
      },
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
