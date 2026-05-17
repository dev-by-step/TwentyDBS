import {
  getInternalEntityMembershipSourceObjectName,
  isInternalEntityMembershipObjectMetadataItem,
} from '@/internal-entity/utils/isInternalEntityMembershipObjectMetadataItem';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { FieldMetadataType } from 'twenty-shared/types';

const createRelationField = ({
  name,
}: {
  name: string;
}): FieldMetadataItem =>
  ({
    id: `${name}-field-id`,
    universalIdentifier: `${name}-field-id`,
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
        id: `${name}-object-id`,
        nameSingular: name,
      },
    },
    settings: null,
  }) as unknown as FieldMetadataItem;

const createScalarField = ({
  name,
}: {
  name: string;
}): FieldMetadataItem =>
  ({
    id: `${name}-field-id`,
    universalIdentifier: `${name}-field-id`,
    label: name,
    name,
    type: FieldMetadataType.TEXT,
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
    relation: null,
    settings: null,
  }) as unknown as FieldMetadataItem;

const createObjectMetadataItem = ({
  fields,
}: {
  fields: FieldMetadataItem[];
}): Pick<EnrichedObjectMetadataItem, 'fields'> => ({
  fields,
});

describe('isInternalEntityMembershipObjectMetadataItem', () => {
  it('detects company/internalEntity membership objects', () => {
    const objectMetadataItem = createObjectMetadataItem({
      fields: [
        createRelationField({ name: 'company' }),
        createRelationField({ name: 'internalEntity' }),
      ],
    });

    expect(isInternalEntityMembershipObjectMetadataItem(objectMetadataItem)).toBe(
      true,
    );
    expect(getInternalEntityMembershipSourceObjectName(objectMetadataItem)).toBe(
      'company',
    );
  });

  it('does not detect regular objects that still own a name field', () => {
    const objectMetadataItem = createObjectMetadataItem({
      fields: [
        createScalarField({ name: 'name' }),
        createRelationField({ name: 'company' }),
        createRelationField({ name: 'internalEntity' }),
      ],
    });

    expect(isInternalEntityMembershipObjectMetadataItem(objectMetadataItem)).toBe(
      false,
    );
    expect(getInternalEntityMembershipSourceObjectName(objectMetadataItem)).toBe(
      null,
    );
  });
});
