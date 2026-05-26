import { type MessageDescriptor } from '@lingui/core';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';

export const getCompositeSubFieldLabelWithFieldLabel = (
  fieldMetadataItem: FieldMetadataItem,
  subFieldLabel: string | MessageDescriptor,
) => {
  const label =
    typeof subFieldLabel === 'string' ? subFieldLabel : subFieldLabel.id;
  return `${fieldMetadataItem.label} / ${label}`;
};
