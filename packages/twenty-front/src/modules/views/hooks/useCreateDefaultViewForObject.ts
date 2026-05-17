import {
  DEFAULT_VIEW_FIELD_SIZE,
  INTERNAL_ENTITY_RELATION_VIEW_FIELD_DEFAULT_SIZE,
} from '@/internal-entity/constants/InternalEntityRelationViewFieldSize';
import { getInternalEntityHiddenFieldMetadataIds } from '@/internal-entity/utils/getInternalEntityHiddenFieldMetadataIds';
import { getInternalEntityRelationFieldMetadataItems } from '@/internal-entity/utils/getInternalEntityRelationFieldMetadataItems';
import { isInternalEntityMembershipObjectMetadataItem } from '@/internal-entity/utils/isInternalEntityMembershipObjectMetadataItem';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { isHiddenSystemField } from '@/object-metadata/utils/isHiddenSystemField';
import { usePerformViewAPIPersist } from '@/views/hooks/internal/usePerformViewAPIPersist';
import { usePerformViewFieldAPIPersist } from '@/views/hooks/internal/usePerformViewFieldAPIPersist';
import { useCallback } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { v4 } from 'uuid';
import { ViewType } from '~/generated-metadata/graphql';

const pendingViewCreations = new Set<string>();

// TODO: This runtime fallback logic is temporary
// System views will later be created declaratively in the database during Standard app installation.
export const useCreateDefaultViewForObject = () => {
  const { objectMetadataItems } = useObjectMetadataItems();
  const { performViewAPICreate } = usePerformViewAPIPersist();
  const { performViewFieldAPICreate } = usePerformViewFieldAPIPersist();

  const createDefaultViewForObject = useCallback(
    async (objectMetadataItem: EnrichedObjectMetadataItem) => {
      if (pendingViewCreations.has(objectMetadataItem.id)) {
        return;
      }

      pendingViewCreations.add(objectMetadataItem.id);

      try {
        const newViewId = v4();

        const viewResult = await performViewAPICreate(
          {
            input: {
              id: newViewId,
              name: `All ${objectMetadataItem.labelPlural}`,
              icon: objectMetadataItem.icon ?? 'IconList',
              objectMetadataId: objectMetadataItem.id,
              type: ViewType.TABLE,
            },
          },
          objectMetadataItem.id,
        );

        if (viewResult.status !== 'successful') {
          return;
        }

        const preferredFieldMetadataItems =
          getInternalEntityRelationFieldMetadataItems({
            objectMetadataItem,
            objectMetadataItems,
          });
        const preferredFieldMetadataIdSet = new Set(
          preferredFieldMetadataItems.map((fieldMetadataItem) => fieldMetadataItem.id),
        );
        const preferredFieldOrderById = new Map(
          preferredFieldMetadataItems.map((fieldMetadataItem, index) => [
            fieldMetadataItem.id,
            index,
          ]),
        );
        const hiddenFieldMetadataIdSet = new Set(
          getInternalEntityHiddenFieldMetadataIds({
            objectMetadataItem,
          }),
        );
        const labelIdentifierFieldMetadataId =
          objectMetadataItem.labelIdentifierFieldMetadataId;
        const isInternalEntityMembershipObject =
          isInternalEntityMembershipObjectMetadataItem(objectMetadataItem);

        const eligibleFields = objectMetadataItem.fields.filter(
          (field) =>
            field.isActive &&
            (!isHiddenSystemField(field) ||
              field.id === labelIdentifierFieldMetadataId) &&
            field.name !== 'deletedAt' &&
            !hiddenFieldMetadataIdSet.has(field.id),
        );

        const sortedFields = eligibleFields.toSorted((fieldA, fieldB) => {
          if (isInternalEntityMembershipObject) {
            const preferredFieldOrderA = preferredFieldOrderById.get(fieldA.id);
            const preferredFieldOrderB = preferredFieldOrderById.get(fieldB.id);

            if (
              isDefined(preferredFieldOrderA) &&
              isDefined(preferredFieldOrderB)
            ) {
              return preferredFieldOrderA - preferredFieldOrderB;
            }

            if (isDefined(preferredFieldOrderA)) {
              return -1;
            }

            if (isDefined(preferredFieldOrderB)) {
              return 1;
            }
          }

          const isFieldALabelIdentifier =
            fieldA.id === objectMetadataItem.labelIdentifierFieldMetadataId;
          const isFieldBLabelIdentifier =
            fieldB.id === objectMetadataItem.labelIdentifierFieldMetadataId;

          if (isFieldALabelIdentifier) return -1;
          if (isFieldBLabelIdentifier) return 1;

          return 0;
        });

        const viewFieldInputs = sortedFields.map((field, index) => ({
          id: v4(),
          viewId: newViewId,
          fieldMetadataId: field.id,
          position: index,
          size: preferredFieldMetadataIdSet.has(field.id)
            ? INTERNAL_ENTITY_RELATION_VIEW_FIELD_DEFAULT_SIZE
            : DEFAULT_VIEW_FIELD_SIZE,
          isVisible: true,
        }));

        await performViewFieldAPICreate({ inputs: viewFieldInputs });
      } finally {
        pendingViewCreations.delete(objectMetadataItem.id);
      }
    },
    [objectMetadataItems, performViewAPICreate, performViewFieldAPICreate],
  );

  return {
    createDefaultViewForObject,
  };
};
