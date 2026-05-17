import { getInternalEntityRelationFieldMetadataItems } from '@/internal-entity/utils/getInternalEntityRelationFieldMetadataItems';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { FieldMetadataType } from 'twenty-shared/types';

const createRelationField = ({
  id,
  name,
  targetObjectMetadataId,
  targetObjectMetadataNameSingular,
}: {
  id: string;
  name: string;
  targetObjectMetadataId: string;
  targetObjectMetadataNameSingular: string;
}): FieldMetadataItem =>
  ({
    id,
    universalIdentifier: id,
    label: name,
    name,
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

describe('getInternalEntityRelationFieldMetadataItems', () => {
  it('returns the internal entity relation field for a person object', () => {
    const personObjectId = 'person-object-id';
    const junctionObjectId = 'person-entity-membership-object-id';

    const internalEntitiesField = createRelationField({
      id: 'person-internal-entities-field-id',
      name: 'internalEntities',
      targetObjectMetadataId: junctionObjectId,
      targetObjectMetadataNameSingular: 'personEntityMembership',
    });
    internalEntitiesField.settings = {
      junctionTargetFieldId: 'junction-internal-entity-field-id',
    };

    const personObjectMetadataItem = {
      id: personObjectId,
      fields: [internalEntitiesField],
    } as EnrichedObjectMetadataItem;

    const membershipObjectMetadataItem = {
      id: junctionObjectId,
      nameSingular: 'personEntityMembership',
      fields: [
        createRelationField({
          id: 'junction-person-field-id',
          name: 'person',
          targetObjectMetadataId: personObjectId,
          targetObjectMetadataNameSingular: 'person',
        }),
        createRelationField({
          id: 'junction-internal-entity-field-id',
          name: 'internalEntity',
          targetObjectMetadataId: 'internal-entity-object-id',
          targetObjectMetadataNameSingular: 'internalEntity',
        }),
      ],
    } as EnrichedObjectMetadataItem;

    expect(
      getInternalEntityRelationFieldMetadataItems({
        objectMetadataItem: personObjectMetadataItem,
        objectMetadataItems: [
          personObjectMetadataItem,
          membershipObjectMetadataItem,
        ],
      }),
    ).toEqual([internalEntitiesField]);
  });

  it('returns the source object field and internal entity field for a membership object', () => {
    const personField = createRelationField({
      id: 'junction-person-field-id',
      name: 'person',
      targetObjectMetadataId: 'person-object-id',
      targetObjectMetadataNameSingular: 'person',
    });
    const internalEntityField = createRelationField({
      id: 'junction-internal-entity-field-id',
      name: 'internalEntity',
      targetObjectMetadataId: 'internal-entity-object-id',
      targetObjectMetadataNameSingular: 'internalEntity',
    });

    const membershipObjectMetadataItem = {
      id: 'person-entity-membership-object-id',
      nameSingular: 'personEntityMembership',
      fields: [personField, internalEntityField],
    } as EnrichedObjectMetadataItem;

    expect(
      getInternalEntityRelationFieldMetadataItems({
        objectMetadataItem: membershipObjectMetadataItem,
        objectMetadataItems: [membershipObjectMetadataItem],
      }),
    ).toEqual([personField, internalEntityField]);
  });
});
