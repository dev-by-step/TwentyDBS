import { currentUserState } from '@/auth/states/currentUserState';
import {
  ENTITY_FILTER_VIEW_MODE,
  type EntityFilterViewMode,
} from '@/entity-filter/constants/entityFilterViewMode';
import { selectedEntityIdState } from '@/entity-filter/states/selectedEntityIdAtom';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useCallback } from 'react';
import { isDefined } from 'twenty-shared/utils';

const resolveViewMode = (
  selectedEntityId: string | null,
): EntityFilterViewMode =>
  isDefined(selectedEntityId) && selectedEntityId.length > 0
    ? ENTITY_FILTER_VIEW_MODE.MY_COMPANY
    : ENTITY_FILTER_VIEW_MODE.GROUP;

const useMyCompanyViewAvailability = (currentUserEntityId: string | null) => {
  return isDefined(currentUserEntityId) && currentUserEntityId.length > 0;
};

export const useEntityFilter = () => {
  const currentUser = useAtomStateValue(currentUserState);
  const [selectedEntityId, setSelectedEntityId] = useAtomState(
    selectedEntityIdState,
  );

  const currentUserEntityId = currentUser?.entityId ?? null;
  const isMyCompanyViewAvailable =
    useMyCompanyViewAvailability(currentUserEntityId);

  const setMyCompanyView = useCallback(() => {
    if (!isMyCompanyViewAvailable) {
      return;
    }
    setSelectedEntityId(currentUserEntityId);
  }, [currentUserEntityId, isMyCompanyViewAvailable, setSelectedEntityId]);

  const setGroupView = useCallback(() => {
    setSelectedEntityId(null);
  }, [setSelectedEntityId]);

  const toggleViewMode = useCallback(() => {
    if (
      resolveViewMode(selectedEntityId) === ENTITY_FILTER_VIEW_MODE.MY_COMPANY
    ) {
      setGroupView();
    } else {
      setMyCompanyView();
    }
  }, [selectedEntityId, setGroupView, setMyCompanyView]);

  const activeViewMode = resolveViewMode(selectedEntityId);

  return {
    activeViewMode,
    currentUserEntityId,
    isMyCompanyViewAvailable,
    selectedEntityId,
    setGroupView,
    setMyCompanyView,
    setSelectedEntityId,
    toggleViewMode,
  };
};
