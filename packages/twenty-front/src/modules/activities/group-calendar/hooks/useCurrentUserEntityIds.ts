import { useMemo } from 'react';

import { WORKSPACE_MEMBER_ENTITY_MEMBERSHIP_OBJECT_NAME } from '@/activities/group-calendar/constants/CalendarEventAudience';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { isDefined } from 'twenty-shared/utils';

type WorkspaceMemberEntityMembershipRecord = {
  __typename: string;
  id: string;
  workspaceMemberId: string;
  internalEntityId: string;
};

// Returns the set of internal entities the current user belongs to.
// Combines the multi-entity M2M memberships (the canonical source after the
// internal-entity migration) with `user.entityId` as a fallback for users that
// haven't been migrated yet.
export const useCurrentUserEntityIds = (): Set<string> => {
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const currentUser = useAtomStateValue(currentUserState);

  const { records: memberships = [] } =
    useFindManyRecords<WorkspaceMemberEntityMembershipRecord>({
      objectNameSingular: WORKSPACE_MEMBER_ENTITY_MEMBERSHIP_OBJECT_NAME,
      recordGqlFields: {
        id: true,
        workspaceMemberId: true,
        internalEntityId: true,
      },
      filter: {
        workspaceMemberId: { eq: currentWorkspaceMember?.id ?? '' },
      },
      skip: !isDefined(currentWorkspaceMember),
    });

  return useMemo(() => {
    const entityIds = new Set<string>(
      memberships.map((membership) => membership.internalEntityId),
    );

    if (isDefined(currentUser?.entityId) && currentUser.entityId.length > 0) {
      entityIds.add(currentUser.entityId);
    }

    return entityIds;
  }, [memberships, currentUser]);
};
