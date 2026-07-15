import { useMemo } from 'react';

import { GROUP_CALENDAR_CONFIG } from '@/activities/group-calendar/constants/GroupCalendar';
import { WORKSPACE_MEMBER_ENTITY_MEMBERSHIP_OBJECT_NAME } from '@/activities/group-calendar/constants/CalendarEventAudience';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { INTERNAL_ENTITY_OBJECT_NAME_SINGULAR } from '@/internal-entity/constants/InternalEntityObjectNameSingular';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { isDefined } from 'twenty-shared/utils';

export type ManageableEventEntity = {
  id: string;
  name: string;
  color: string | null;
};

type InternalEntityRecord = {
  __typename: string;
  id: string;
  name: string;
  color?: string | null;
};

type WorkspaceMemberEntityMembershipRecord = {
  __typename: string;
  id: string;
  workspaceMemberId: string;
  internalEntityId: string;
  internalEntity?: { id: string; name: string; color?: string | null } | null;
};

// Returns the entities the current user is allowed to designate as
// "responsible" for a calendar event. We merge the readable internal entities
// with the user's explicit memberships so the picker stays correct even when a
// long-lived session has a stale admin flag in frontend state.
//
// `primaryEventEntityId` is the entity to pre-select by default (smart default
// for the create modal). Defaults to `user.entityId` when it is part of the
// manageable set, otherwise falls back to the first manageable entity.
//
// Used by both create and edit modals to keep the picker UX consistent.
export const useManageableEventEntities = (): {
  manageableEventEntities: ManageableEventEntity[];
  manageableEventEntityIds: Set<string>;
  primaryEventEntityId: string | null;
  isReady: boolean;
} => {
  const currentUser = useAtomStateValue(currentUserState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);

  const { records: allInternalEntities = [], loading: entitiesLoading } =
    useFindManyRecords<InternalEntityRecord>({
      objectNameSingular: INTERNAL_ENTITY_OBJECT_NAME_SINGULAR,
      recordGqlFields: { id: true, name: true, color: true },
      limit: GROUP_CALENDAR_CONFIG.limits.entityPicker,
      skip: !isDefined(currentUser),
    });

  const { records: memberships = [], loading: membershipsLoading } =
    useFindManyRecords<WorkspaceMemberEntityMembershipRecord>({
      objectNameSingular: WORKSPACE_MEMBER_ENTITY_MEMBERSHIP_OBJECT_NAME,
      recordGqlFields: {
        id: true,
        workspaceMemberId: true,
        internalEntityId: true,
        internalEntity: {
          id: true,
          name: true,
          color: true,
        },
      },
      filter: {
        workspaceMemberId: { eq: currentWorkspaceMember?.id ?? '' },
      },
      limit: GROUP_CALENDAR_CONFIG.limits.entityMembership,
      skip: !isDefined(currentWorkspaceMember),
    });

  const manageableEventEntities = useMemo<ManageableEventEntity[]>(() => {
    const entitiesById = new Map<string, ManageableEventEntity>();

    for (const entity of allInternalEntities) {
      entitiesById.set(entity.id, {
        id: entity.id,
        name: entity.name,
        color: entity.color ?? null,
      });
    }

    for (const membership of memberships) {
      const entityId =
        membership.internalEntity?.id ?? membership.internalEntityId;

      entitiesById.set(entityId, {
        id: entityId,
        name: membership.internalEntity?.name ?? entityId,
        color: membership.internalEntity?.color ?? null,
      });
    }

    return [...entitiesById.values()].sort((firstEntity, secondEntity) =>
      firstEntity.name.localeCompare(secondEntity.name),
    );
  }, [allInternalEntities, memberships]);

  const manageableEventEntityIds = useMemo(
    () => new Set(manageableEventEntities.map((entity) => entity.id)),
    [manageableEventEntities],
  );

  const primaryEventEntityId = useMemo<string | null>(() => {
    if (manageableEventEntities.length === 0) {
      return null;
    }

    const userPrimaryEntityId =
      isDefined(currentUser?.entityId) && currentUser.entityId.length > 0
        ? currentUser.entityId
        : null;

    if (
      isDefined(userPrimaryEntityId) &&
      manageableEventEntityIds.has(userPrimaryEntityId)
    ) {
      return userPrimaryEntityId;
    }

    return manageableEventEntities[0].id;
  }, [manageableEventEntities, manageableEventEntityIds, currentUser]);

  const isReady = !entitiesLoading && !membershipsLoading;

  return {
    manageableEventEntities,
    manageableEventEntityIds,
    primaryEventEntityId,
    isReady,
  };
};
