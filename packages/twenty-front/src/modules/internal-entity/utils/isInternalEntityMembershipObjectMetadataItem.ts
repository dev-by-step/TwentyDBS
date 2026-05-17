import { INTERNAL_ENTITY_OBJECT_NAME_SINGULAR } from '@/internal-entity/constants/InternalEntityObjectNameSingular';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { isDefined } from 'twenty-shared/utils';

const INTERNAL_ENTITY_MEMBERSHIP_SOURCE_OBJECT_NAMES = [
  'company',
  'person',
] as const;

export type InternalEntityMembershipSourceObjectName =
  (typeof INTERNAL_ENTITY_MEMBERSHIP_SOURCE_OBJECT_NAMES)[number];

const hasMatchingActiveRelationField = ({
  objectMetadataItem,
  fieldName,
}: {
  objectMetadataItem: Pick<EnrichedObjectMetadataItem, 'fields'>;
  fieldName: string;
}) =>
  objectMetadataItem.fields.some((fieldMetadataItem) => {
    const targetObjectNameSingular =
      fieldMetadataItem.relation?.targetObjectMetadata.nameSingular;

    return (
      fieldMetadataItem.isActive === true &&
      fieldMetadataItem.name === fieldName &&
      isDefined(targetObjectNameSingular) &&
      targetObjectNameSingular === fieldName
    );
  });

const hasActiveNameField = (
  objectMetadataItem: Pick<EnrichedObjectMetadataItem, 'fields'>,
) =>
  objectMetadataItem.fields.some(
    (fieldMetadataItem) =>
      fieldMetadataItem.isActive === true && fieldMetadataItem.name === 'name',
  );

export const getInternalEntityMembershipSourceObjectName = (
  objectMetadataItem: Pick<EnrichedObjectMetadataItem, 'fields'>,
): InternalEntityMembershipSourceObjectName | null => {
  if (
    hasActiveNameField(objectMetadataItem) ||
    !hasMatchingActiveRelationField({
      objectMetadataItem,
      fieldName: INTERNAL_ENTITY_OBJECT_NAME_SINGULAR,
    })
  ) {
    return null;
  }

  const matchingSourceObjectNames =
    INTERNAL_ENTITY_MEMBERSHIP_SOURCE_OBJECT_NAMES.filter((sourceObjectName) =>
      hasMatchingActiveRelationField({
        objectMetadataItem,
        fieldName: sourceObjectName,
      }),
    );

  return matchingSourceObjectNames.length === 1
    ? matchingSourceObjectNames[0]
    : null;
};

export const isInternalEntityMembershipObjectMetadataItem = (
  objectMetadataItem: Pick<EnrichedObjectMetadataItem, 'fields'>,
): boolean =>
  isDefined(getInternalEntityMembershipSourceObjectName(objectMetadataItem));
