import { useCallback, useMemo } from 'react';

import { WORKSPACE_MEMBER_ENTITY_MEMBERSHIP_OBJECT_NAME } from '@/activities/group-calendar/constants/CalendarEventAudience';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { isDefined } from 'twenty-shared/utils';

type WorkspaceMemberEntityMembershipRecord = {
  __typename: string;
  id: string;
  workspaceMemberId: string;
  internalEntityId: string;
};

export type EntityMembersCoverage = {
  entityIdsByMemberId: Map<string, Set<string>>;
  isMemberCoveredBySelectedEntities: (
    workspaceMemberId: string,
    selectedAudienceEntityIds: readonly string[],
  ) => boolean;
};

// Single source of truth for "is this workspace member already granted access
// via one of the selected entities". Consumed by the audience picker (to grey
// out chips) and by the persist logic (to skip redundant person-audience rows).
export const useEntityMembersCoverage = ({
  limit,
  skip = false,
}: { limit?: number; skip?: boolean } = {}): EntityMembersCoverage => {
  const { records: memberships = [] } =
    useFindManyRecords<WorkspaceMemberEntityMembershipRecord>({
      objectNameSingular: WORKSPACE_MEMBER_ENTITY_MEMBERSHIP_OBJECT_NAME,
      recordGqlFields: {
        id: true,
        workspaceMemberId: true,
        internalEntityId: true,
      },
      limit,
      skip,
    });

  const entityIdsByMemberId = useMemo(() => {
    const map = new Map<string, Set<string>>();

    for (const membership of memberships) {
      const set = map.get(membership.workspaceMemberId) ?? new Set<string>();

      set.add(membership.internalEntityId);
      map.set(membership.workspaceMemberId, set);
    }

    return map;
  }, [memberships]);

  const isMemberCoveredBySelectedEntities = useCallback(
    (
      workspaceMemberId: string,
      selectedAudienceEntityIds: readonly string[],
    ): boolean => {
      const memberEntityIds = entityIdsByMemberId.get(workspaceMemberId);

      if (!isDefined(memberEntityIds) || memberEntityIds.size === 0) {
        return false;
      }

      return selectedAudienceEntityIds.some((entityId) =>
        memberEntityIds.has(entityId),
      );
    },
    [entityIdsByMemberId],
  );

  return { entityIdsByMemberId, isMemberCoveredBySelectedEntities };
};
