import { INTERNAL_ENTITY_OBJECT_NAME_SINGULAR } from '@/internal-entity/constants/InternalEntityObjectNameSingular';
import { getInternalEntityMembershipSourceObjectName } from '@/internal-entity/utils/isInternalEntityMembershipObjectMetadataItem';
import { isInternalEntityRelationField } from '@/internal-entity/utils/isInternalEntityRelationField';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { isDefined } from 'twenty-shared/utils';

export const getInternalEntityRelationFieldMetadataItems = ({
  objectMetadataItem,
  objectMetadataItems,
}: {
  objectMetadataItem: EnrichedObjectMetadataItem | undefined;
  objectMetadataItems: EnrichedObjectMetadataItem[];
}): FieldMetadataItem[] => {
  if (!isDefined(objectMetadataItem)) {
    return [];
  }

  const membershipSourceObjectName =
    getInternalEntityMembershipSourceObjectName(objectMetadataItem);

  if (isDefined(membershipSourceObjectName)) {
    const preferredFieldNames = [
      membershipSourceObjectName,
      INTERNAL_ENTITY_OBJECT_NAME_SINGULAR,
    ];

    return preferredFieldNames.flatMap((fieldName) => {
      const relationFieldMetadataItem = objectMetadataItem.fields.find(
        (fieldMetadataItem) =>
          fieldMetadataItem.isActive === true &&
          fieldMetadataItem.name === fieldName,
      );

      return isDefined(relationFieldMetadataItem)
        ? [relationFieldMetadataItem]
        : [];
    });
  }

  return objectMetadataItem.fields.filter(
    (fieldMetadataItem) =>
      fieldMetadataItem.isActive === true &&
      isInternalEntityRelationField({
        fieldMetadataItem,
        sourceObjectMetadataId: objectMetadataItem.id,
        objectMetadataItems,
      }),
  );
};
