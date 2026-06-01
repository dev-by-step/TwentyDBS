import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { getCompositeSubFieldLabel } from '@/object-record/object-filter-dropdown/utils/getCompositeSubFieldLabel';
import { isCompositeFieldType } from '@/object-record/object-filter-dropdown/utils/isCompositeFieldType';
import { isDefined } from 'twenty-shared/utils';

export const getRelationConnectSubFieldLabel = (
  fieldMetadataItem: FieldMetadataItem,
  uniqueFieldMetadataItem: FieldMetadataItem,
  compositeSubFieldKey?: string,
) => {
  const compositeSubFieldLabel =
    isCompositeFieldType(uniqueFieldMetadataItem.type) &&
    isDefined(compositeSubFieldKey)
      ? getCompositeSubFieldLabel(
          uniqueFieldMetadataItem.type,
          compositeSubFieldKey as Parameters<
            typeof getCompositeSubFieldLabel
          >[1],
        )
      : undefined;

  return `${fieldMetadataItem.label} / ${uniqueFieldMetadataItem.label}${compositeSubFieldLabel ? ` / ${compositeSubFieldLabel}` : ''}`;
};
