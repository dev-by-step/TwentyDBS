import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { isHiddenSystemField } from '@/object-metadata/utils/isHiddenSystemField';
import { FieldMetadataType } from 'twenty-shared/types';
import { RelationType } from '~/generated-metadata/graphql';

export const spreadsheetImportFilterAvailableFieldMetadataItems = (
  fields: FieldMetadataItem[],
) => {
  const relationJoinColumnNames = new Set(
    fields.flatMap((fieldMetadataItem) => {
      if (
        fieldMetadataItem.type !== FieldMetadataType.RELATION ||
        fieldMetadataItem.relation?.type !== RelationType.MANY_TO_ONE
      ) {
        return [];
      }

      const joinColumnName = fieldMetadataItem.settings?.joinColumnName;

      return typeof joinColumnName === 'string' && joinColumnName.length > 0
        ? [joinColumnName]
        : [];
    }),
  );

  return fields
    .filter(
      (fieldMetadataItem) =>
        fieldMetadataItem.isActive &&
        (!isHiddenSystemField(fieldMetadataItem) ||
          fieldMetadataItem.name === 'id') &&
        fieldMetadataItem.name !== 'deletedAt' &&
        !relationJoinColumnNames.has(fieldMetadataItem.name) &&
        (![FieldMetadataType.RELATION, FieldMetadataType.ACTOR].includes(
          fieldMetadataItem.type,
        ) ||
          fieldMetadataItem.relation?.type === RelationType.MANY_TO_ONE),
    )
    .sort((fieldMetadataItemA, fieldMetadataItemB) =>
      fieldMetadataItemA.name.localeCompare(fieldMetadataItemB.name),
    );
};
