import { useMemo } from 'react';

import { getInternalEntityRelationFieldBehavior } from '@/internal-entity/utils/getInternalEntityRelationFieldBehavior';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { useFieldListFieldMetadataItems } from '@/object-record/record-field-list/hooks/useFieldListFieldMetadataItems';
import { type FieldDisplayMode } from '~/generated-metadata/graphql';

export const usePageLayoutRelationWidgetConfig = ({
  objectNameSingular,
}: {
  objectNameSingular: string;
}) => {
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });
  const { objectMetadataItems } = useObjectMetadataItems();

  const {
    boxedRelationFieldMetadataItems,
    junctionRelationFieldMetadataItems,
  } = useFieldListFieldMetadataItems({
    objectNameSingular,
  });

  return useMemo(() => {
    const internalEntityRelationWidgets =
      objectMetadataItem === undefined
        ? []
        : junctionRelationFieldMetadataItems.flatMap((fieldMetadataItem) => {
            const internalEntityRelationBehavior =
              getInternalEntityRelationFieldBehavior({
                fieldMetadataItem,
                sourceObjectMetadataId: objectMetadataItem.id,
                objectMetadataItems,
              });

            return internalEntityRelationBehavior === null
              ? []
              : [
                  {
                    fieldMetadataItem,
                    internalEntityRelationBehavior,
                  },
                ];
          });

    const relationFieldMetadataItems = [
      ...boxedRelationFieldMetadataItems,
      ...internalEntityRelationWidgets.map(
        ({ fieldMetadataItem }) => fieldMetadataItem,
      ),
    ];

    const internalEntityRelationDisplayModesByFieldMetadataId = new Map(
      internalEntityRelationWidgets.map(
        ({ fieldMetadataItem, internalEntityRelationBehavior }) => [
          fieldMetadataItem.id,
          internalEntityRelationBehavior.fieldWidgetDisplayMode,
        ],
      ),
    );

    const getFieldDisplayMode = (
      fieldMetadataItem: FieldMetadataItem,
    ): FieldDisplayMode | undefined =>
      internalEntityRelationDisplayModesByFieldMetadataId.get(
        fieldMetadataItem.id,
      );

    return {
      relationFieldMetadataItems,
      getFieldDisplayMode,
    };
  }, [
    boxedRelationFieldMetadataItems,
    junctionRelationFieldMetadataItems,
    objectMetadataItem,
    objectMetadataItems,
  ]);
};
