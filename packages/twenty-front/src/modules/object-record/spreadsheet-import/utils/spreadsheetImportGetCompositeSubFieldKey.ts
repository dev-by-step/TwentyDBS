import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { getCompositeSubFieldLabel } from '@/object-record/object-filter-dropdown/utils/getCompositeSubFieldLabel';
import { isCompositeFieldType } from '@/object-record/object-filter-dropdown/utils/isCompositeFieldType';

export const getCompositeSubFieldKey = (
  fieldMetadataItem: FieldMetadataItem,
  subFieldName: string,
) => {
  if (!isCompositeFieldType(fieldMetadataItem.type)) {
    throw new Error(
      `getCompositeSubFieldKey can only be called for composite field types. Received: ${fieldMetadataItem.type}`,
    );
  }

  const subFieldLabel = getCompositeSubFieldLabel(
    fieldMetadataItem.type,
    subFieldName as Parameters<typeof getCompositeSubFieldLabel>[1],
  );

  return `${subFieldLabel} (${fieldMetadataItem.name})`;
};
