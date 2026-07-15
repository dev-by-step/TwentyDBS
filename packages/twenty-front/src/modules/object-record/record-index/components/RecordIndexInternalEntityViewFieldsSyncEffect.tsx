import { useContextStoreObjectMetadataItemOrThrow } from '@/context-store/hooks/useContextStoreObjectMetadataItemOrThrow';
import { INTERNAL_ENTITY_RELATION_VIEW_FIELD_DEFAULT_SIZE } from '@/internal-entity/constants/InternalEntityRelationViewFieldSize';
import { DEFAULT_VIEW_FIELD_SIZE } from '@/views/constants/DefaultViewFieldSize';
import { getInternalEntityHiddenFieldMetadataIds } from '@/internal-entity/utils/getInternalEntityHiddenFieldMetadataIds';
import { contextStoreCurrentViewIdComponentState } from '@/context-store/states/contextStoreCurrentViewIdComponentState';
import { getInternalEntityRelationFieldMetadataItems } from '@/internal-entity/utils/getInternalEntityRelationFieldMetadataItems';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { usePerformViewFieldAPIPersist } from '@/views/hooks/internal/usePerformViewFieldAPIPersist';
import { viewFromViewIdFamilySelector } from '@/views/states/selectors/viewFromViewIdFamilySelector';
import { useEffect, useMemo, useRef } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { v4 } from 'uuid';
import { ViewType } from '~/generated-metadata/graphql';

const pendingInternalEntityViewFieldSyncs = new Set<string>();

export const RecordIndexInternalEntityViewFieldsSyncEffect = () => {
  // oxlint-disable-next-line twenty/no-state-useref
  const lastSuccessfulSyncKeyRef = useRef<string | null>(null);
  const contextStoreCurrentViewId = useAtomComponentStateValue(
    contextStoreCurrentViewIdComponentState,
  );

  const view = useAtomFamilySelectorValue(viewFromViewIdFamilySelector, {
    viewId: contextStoreCurrentViewId ?? '',
  });

  const { objectMetadataItem } = useContextStoreObjectMetadataItemOrThrow();
  const { objectMetadataItems } = useObjectMetadataItems();
  const { performViewFieldAPICreate, performViewFieldAPIUpdate } =
    usePerformViewFieldAPIPersist();

  const internalEntityRelationFieldMetadataItems = useMemo(
    () =>
      getInternalEntityRelationFieldMetadataItems({
        objectMetadataItem,
        objectMetadataItems,
      }),
    [objectMetadataItem, objectMetadataItems],
  );
  const hiddenFieldMetadataIdSet = useMemo(
    () =>
      new Set(
        getInternalEntityHiddenFieldMetadataIds({
          objectMetadataItem,
        }),
      ),
    [objectMetadataItem],
  );
  const labelIdentifierFieldMetadataId =
    objectMetadataItem?.labelIdentifierFieldMetadataId;
  const requiredFieldMetadataItems = useMemo(() => {
    if (!isDefined(objectMetadataItem)) {
      return [];
    }

    if (!isDefined(labelIdentifierFieldMetadataId)) {
      return internalEntityRelationFieldMetadataItems;
    }

    const labelIdentifierFieldMetadataItem = objectMetadataItem.fields.find(
      (fieldMetadataItem) =>
        fieldMetadataItem.isActive === true &&
        fieldMetadataItem.id === labelIdentifierFieldMetadataId,
    );

    if (
      !isDefined(labelIdentifierFieldMetadataItem) ||
      internalEntityRelationFieldMetadataItems.some(
        (fieldMetadataItem) =>
          fieldMetadataItem.id === labelIdentifierFieldMetadataItem.id,
      )
    ) {
      return internalEntityRelationFieldMetadataItems;
    }

    return [
      ...internalEntityRelationFieldMetadataItems,
      labelIdentifierFieldMetadataItem,
    ];
  }, [
    internalEntityRelationFieldMetadataItems,
    labelIdentifierFieldMetadataId,
    objectMetadataItem,
  ]);

  useEffect(() => {
    if (!isDefined(view) || view.type !== ViewType.TABLE) {
      return;
    }

    if (
      requiredFieldMetadataItems.length === 0 &&
      hiddenFieldMetadataIdSet.size === 0
    ) {
      return;
    }

    const internalEntityRelationFieldMetadataIds = new Set(
      internalEntityRelationFieldMetadataItems.map(
        (fieldMetadataItem) => fieldMetadataItem.id,
      ),
    );

    const existingViewFieldMetadataIds = new Set(
      view.viewFields
        .filter((viewField) => viewField.isActive)
        .map((viewField) => viewField.fieldMetadataId),
    );

    const missingFieldMetadataItems = requiredFieldMetadataItems.filter(
      (fieldMetadataItem) =>
        !existingViewFieldMetadataIds.has(fieldMetadataItem.id),
    );

    const viewFieldUpdatesById = new Map<
      string,
      {
        input: {
          id: string;
          update: {
            isVisible?: boolean;
            size?: number;
          };
        };
      }
    >();

    const queueViewFieldUpdate = ({
      viewFieldId,
      update,
    }: {
      viewFieldId: string;
      update: {
        isVisible?: boolean;
        size?: number;
      };
    }) => {
      const existingUpdate = viewFieldUpdatesById.get(viewFieldId);

      viewFieldUpdatesById.set(viewFieldId, {
        input: {
          id: viewFieldId,
          update: {
            ...existingUpdate?.input.update,
            ...update,
          },
        },
      });
    };

    for (const viewField of view.viewFields) {
      if (!viewField.isActive) {
        continue;
      }

      if (
        internalEntityRelationFieldMetadataIds.has(viewField.fieldMetadataId)
      ) {
        if (viewField.size === DEFAULT_VIEW_FIELD_SIZE) {
          queueViewFieldUpdate({
            viewFieldId: viewField.id,
            update: {
              size: INTERNAL_ENTITY_RELATION_VIEW_FIELD_DEFAULT_SIZE,
            },
          });
        }

        if (!viewField.isVisible) {
          queueViewFieldUpdate({
            viewFieldId: viewField.id,
            update: {
              isVisible: true,
            },
          });
        }
      }

      if (
        isDefined(labelIdentifierFieldMetadataId) &&
        viewField.fieldMetadataId === labelIdentifierFieldMetadataId &&
        !viewField.isVisible
      ) {
        queueViewFieldUpdate({
          viewFieldId: viewField.id,
          update: {
            isVisible: true,
          },
        });
      }

      if (
        hiddenFieldMetadataIdSet.has(viewField.fieldMetadataId) &&
        viewField.isVisible
      ) {
        queueViewFieldUpdate({
          viewFieldId: viewField.id,
          update: {
            isVisible: false,
          },
        });
      }
    }

    if (
      missingFieldMetadataItems.length === 0 &&
      viewFieldUpdatesById.size === 0
    ) {
      lastSuccessfulSyncKeyRef.current = null;

      return;
    }

    const serializedViewFieldUpdates = Array.from(viewFieldUpdatesById.values())
      .map(
        ({ input }) =>
          `${input.id}:${input.update.size ?? ''}:${input.update.isVisible ?? ''}`,
      )
      .sort()
      .join(',');

    const syncKey = `${view.id}:${missingFieldMetadataItems
      .map((fieldMetadataItem) => fieldMetadataItem.id)
      .sort()
      .join(',')}:${serializedViewFieldUpdates}`;

    if (pendingInternalEntityViewFieldSyncs.has(syncKey)) {
      return;
    }

    if (lastSuccessfulSyncKeyRef.current === syncKey) {
      return;
    }

    pendingInternalEntityViewFieldSyncs.add(syncKey);

    const lastViewFieldPosition = view.viewFields.reduce(
      (maxPosition, viewField) => Math.max(maxPosition, viewField.position),
      -1,
    );

    const syncOperations: Array<Promise<{ status: string }>> = [];

    if (missingFieldMetadataItems.length > 0) {
      syncOperations.push(
        performViewFieldAPICreate({
          inputs: missingFieldMetadataItems.map((fieldMetadataItem, index) => ({
            id: v4(),
            viewId: view.id,
            fieldMetadataId: fieldMetadataItem.id,
            position: lastViewFieldPosition + index + 1,
            size: internalEntityRelationFieldMetadataIds.has(
              fieldMetadataItem.id,
            )
              ? INTERNAL_ENTITY_RELATION_VIEW_FIELD_DEFAULT_SIZE
              : DEFAULT_VIEW_FIELD_SIZE,
            isVisible: true,
          })),
        }),
      );
    }

    if (viewFieldUpdatesById.size > 0) {
      syncOperations.push(
        performViewFieldAPIUpdate(Array.from(viewFieldUpdatesById.values())),
      );
    }

    void Promise.all(syncOperations)
      .then((results) => {
        if (results.every((result) => result.status === 'successful')) {
          lastSuccessfulSyncKeyRef.current = syncKey;
        }
      })
      .finally(() => {
        pendingInternalEntityViewFieldSyncs.delete(syncKey);
      });
  }, [
    hiddenFieldMetadataIdSet,
    internalEntityRelationFieldMetadataItems,
    labelIdentifierFieldMetadataId,
    performViewFieldAPICreate,
    performViewFieldAPIUpdate,
    requiredFieldMetadataItems,
    view,
  ]);

  return null;
};
