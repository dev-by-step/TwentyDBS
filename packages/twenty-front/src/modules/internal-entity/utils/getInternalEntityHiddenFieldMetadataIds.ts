import { INTERNAL_ENTITY_OBJECT_NAME_SINGULAR } from '@/internal-entity/constants/InternalEntityObjectNameSingular';
import { getInternalEntityMembershipSourceObjectName } from '@/internal-entity/utils/isInternalEntityMembershipObjectMetadataItem';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { getJoinColumnName } from '@/object-record/record-field/ui/utils/junction/getJoinColumnName';
import { isDefined } from 'twenty-shared/utils';

export const getInternalEntityHiddenFieldMetadataIds = ({
  objectMetadataItem,
}: {
  objectMetadataItem: EnrichedObjectMetadataItem | undefined;
}): string[] => {
  if (!isDefined(objectMetadataItem)) {
    return [];
  }

  const sourceObjectName =
    getInternalEntityMembershipSourceObjectName(objectMetadataItem);

  if (!isDefined(sourceObjectName)) {
    return [];
  }

  const relationFieldNames = [
    sourceObjectName,
    INTERNAL_ENTITY_OBJECT_NAME_SINGULAR,
  ];

  const labelIdentifierFieldMetadataId =
    objectMetadataItem.labelIdentifierFieldMetadataId;

  const hiddenFieldNames = new Set<string>(['id']);

  for (const fieldName of relationFieldNames) {
    const relationField = objectMetadataItem.fields.find(
      (fieldMetadataItem) =>
        fieldMetadataItem.isActive === true &&
        fieldMetadataItem.name === fieldName,
    );

    const joinColumnName = getJoinColumnName(relationField?.settings);

    hiddenFieldNames.add(joinColumnName ?? `${fieldName}Id`);
  }

  return objectMetadataItem.fields
    .filter(
      (fieldMetadataItem) =>
        fieldMetadataItem.isActive === true &&
        hiddenFieldNames.has(fieldMetadataItem.name) &&
        fieldMetadataItem.id !== labelIdentifierFieldMetadataId,
    )
    .map((fieldMetadataItem) => fieldMetadataItem.id);
};
