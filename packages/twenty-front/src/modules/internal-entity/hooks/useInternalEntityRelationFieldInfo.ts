import { useContext, useMemo } from 'react';

import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { type FieldDefinition } from '@/object-record/record-field/ui/types/FieldDefinition';
import { type FieldRelationMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { isFieldRelationOneToMany } from '@/object-record/record-field/ui/types/guards/isFieldRelationOneToMany';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { getFieldMetadataItemById } from '@/object-metadata/utils/getFieldMetadataItemById';

import { getInternalEntityRelationFieldBehavior } from '@/internal-entity/utils/getInternalEntityRelationFieldBehavior';

export const useInternalEntityRelationFieldInfo = () => {
  const { fieldDefinition } = useContext(FieldContext);
  const { objectMetadataItems } = useObjectMetadataItems();

  return useMemo(() => {
    if (!isFieldRelationOneToMany(fieldDefinition)) {
      return {
        isInternalEntityRelation: false,
      };
    }

    const relationFieldDefinition =
      fieldDefinition as FieldDefinition<FieldRelationMetadata>;

    const { fieldMetadataItem, objectMetadataItem } = getFieldMetadataItemById({
      fieldMetadataId: relationFieldDefinition.fieldMetadataId,
      objectMetadataItems,
    });

    if (fieldMetadataItem === undefined || objectMetadataItem === undefined) {
      return {
        isInternalEntityRelation: false,
      };
    }

    const internalEntityRelationBehavior =
      getInternalEntityRelationFieldBehavior({
        fieldMetadataItem,
        sourceObjectMetadataId: objectMetadataItem.id,
        objectMetadataItems,
      });

    const internalEntityObjectMetadata =
      internalEntityRelationBehavior === null
        ? undefined
        : objectMetadataItems.find(
            (item) =>
              item.id ===
              internalEntityRelationBehavior.internalEntityObjectMetadataId,
          );

    return {
      fieldMetadataItem,
      internalEntityRelationBehavior,
      internalEntityObjectMetadata,
      isInternalEntityRelation: internalEntityRelationBehavior !== null,
      objectMetadataItem,
      relationFieldDefinition,
    };
  }, [fieldDefinition, objectMetadataItems]);
};
