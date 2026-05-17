import { getInternalEntityHiddenFieldMetadataIds } from '@/internal-entity/utils/getInternalEntityHiddenFieldMetadataIds';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { FieldMetadataType } from 'twenty-shared/types';

const createField = ({
  id,
  name,
  type,
  joinColumnName,
}: {
  id: string;
  name: string;
  type: FieldMetadataType;
  joinColumnName?: string;
}): FieldMetadataItem =>
  ({
    id,
    universalIdentifier: id,
    label: name,
    name,
    type,
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
    relation:
      type === FieldMetadataType.RELATION
        ? {
            targetObjectMetadata: {
              id: `${name}-object-id`,
              nameSingular: name,
            },
          }
        : null,
    settings: type === FieldMetadataType.RELATION ? { joinColumnName } : null,
  }) as unknown as FieldMetadataItem;

describe('getInternalEntityHiddenFieldMetadataIds', () => {
  it('returns the technical id fields to hide for membership objects', () => {
    const objectMetadataItem = {
      labelIdentifierFieldMetadataId: 'id-field-id',
      fields: [
        createField({
          id: 'id-field-id',
          name: 'id',
          type: FieldMetadataType.UUID,
        }),
        createField({
          id: 'person-field-id',
          name: 'person',
          type: FieldMetadataType.RELATION,
          joinColumnName: 'personId',
        }),
        createField({
          id: 'person-id-field-id',
          name: 'personId',
          type: FieldMetadataType.UUID,
        }),
        createField({
          id: 'internal-entity-field-id',
          name: 'internalEntity',
          type: FieldMetadataType.RELATION,
          joinColumnName: 'internalEntityId',
        }),
        createField({
          id: 'internal-entity-id-field-id',
          name: 'internalEntityId',
          type: FieldMetadataType.UUID,
        }),
      ],
    } as EnrichedObjectMetadataItem;

    expect(
      getInternalEntityHiddenFieldMetadataIds({
        objectMetadataItem,
      }),
    ).toEqual(['person-id-field-id', 'internal-entity-id-field-id']);
  });
});
