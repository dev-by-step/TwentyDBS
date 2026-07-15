import { objectMetadataItemsWithFieldsSelector } from '@/object-metadata/states/objectMetadataItemsWithFieldsSelector';
import { isHiddenObjectMetadataItem } from '@/object-metadata/utils/isHiddenObjectMetadataItem';
import { useMemo } from 'react';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

export const useFilteredObjectMetadataItems = () => {
  const objectMetadataItemsWithFields = useAtomStateValue(
    objectMetadataItemsWithFieldsSelector,
  );

  const visibleObjectMetadataItems = useMemo(
    () =>
      objectMetadataItemsWithFields.filter(
        (objectMetadataItem) => !isHiddenObjectMetadataItem(objectMetadataItem),
      ),
    [objectMetadataItemsWithFields],
  );

  const activeNonSystemObjectMetadataItems = useMemo(
    () =>
      visibleObjectMetadataItems.filter(
        ({ isActive, isSystem }) => isActive && !isSystem,
      ),
    [visibleObjectMetadataItems],
  );

  const activeObjectMetadataItems = useMemo(
    () =>
      visibleObjectMetadataItems
        .filter(({ isActive }) => isActive)
        .sort((a, b) => a.labelSingular.localeCompare(b.labelSingular)),
    [visibleObjectMetadataItems],
  );

  const alphaSortedActiveNonSystemObjectMetadataItems = [
    ...activeNonSystemObjectMetadataItems,
  ].sort((a, b) => {
    if (a.nameSingular < b.nameSingular) {
      return -1;
    }
    if (a.nameSingular > b.nameSingular) {
      return 1;
    }
    return 0;
  });

  const inactiveNonSystemObjectMetadataItems =
    visibleObjectMetadataItems.filter(
      ({ isActive, isSystem }) => !isActive && !isSystem,
    );

  const findActiveObjectMetadataItemByNamePlural = (namePlural: string) =>
    activeNonSystemObjectMetadataItems.find(
      (activeObjectMetadataItem) =>
        activeObjectMetadataItem.namePlural === namePlural,
    );

  const findObjectMetadataItemById = (id: string) =>
    objectMetadataItemsWithFields.find(
      (objectMetadataItem) => objectMetadataItem.id === id,
    );

  const findObjectMetadataItemByNamePlural = (namePlural: string) =>
    objectMetadataItemsWithFields.find(
      (objectMetadataItem) => objectMetadataItem.namePlural === namePlural,
    );

  return {
    activeNonSystemObjectMetadataItems,
    activeObjectMetadataItems,
    findObjectMetadataItemById,
    findObjectMetadataItemByNamePlural,
    findActiveObjectMetadataItemByNamePlural,
    inactiveNonSystemObjectMetadataItems,
    objectMetadataItems: visibleObjectMetadataItems,
    alphaSortedActiveNonSystemObjectMetadataItems,
  };
};
