import { currentUserState } from '@/auth/states/currentUserState';
import {
  ENTITY_FILTER_VIEW_MODE,
  type EntityFilterViewMode,
} from '@/entity-filter/constants/entityFilterViewMode';
import { activeEntityIdState } from '@/entity-filter/states/activeEntityIdState';
import { selectedEntityIdState } from '@/entity-filter/states/selectedEntityIdState';
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
  const [activeEntityId, setActiveEntityId] = useAtomState(activeEntityIdState);
  const [selectedEntityId, setSelectedEntityId] = useAtomState(
    selectedEntityIdState,
  );

  const currentUserEntityId = currentUser?.entityId ?? null;
  const isMyCompanyViewAvailable =
    useMyCompanyViewAvailability(currentUserEntityId);

  const setScopedEntityView = useCallback(
    (entityId: string | null) => {
      setSelectedEntityId(entityId);

      if (isDefined(entityId) && entityId.length > 0) {
        setActiveEntityId(entityId);
      }
    },
    [setActiveEntityId, setSelectedEntityId],
  );

  const setMyCompanyView = useCallback(() => {
    if (!isMyCompanyViewAvailable) {
      return;
    }
    setScopedEntityView(currentUserEntityId);
  }, [currentUserEntityId, isMyCompanyViewAvailable, setScopedEntityView]);

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
    activeEntityId,
    currentUserEntityId,
    isMyCompanyViewAvailable,
    selectedEntityId,
    setActiveEntityId,
    setGroupView,
    setMyCompanyView,
    setSelectedEntityId: setScopedEntityView,
    toggleViewMode,
  };
};
