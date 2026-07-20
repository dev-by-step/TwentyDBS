import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { useMemo } from 'react';
import {
  type RecordGqlOperationFilter,
  type RecordGqlOperationGqlRecordFields,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { WORKSPACE_MEMBER_ENTITY_MEMBERSHIP_OBJECT_NAME } from '@/activities/group-calendar/constants/CalendarEventAudience';
import { GROUP_CALENDAR_CONFIG } from '@/activities/group-calendar/constants/GroupCalendar';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { type RecordGqlOperationFindManyResult } from '@/object-record/graphql/types/RecordGqlOperationFindManyResult';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { generateFindManyRecordsQuery } from '@/object-record/utils/generateFindManyRecordsQuery';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

type WorkspaceMemberEntityMembershipRecord = {
  internalEntityId: string;
};

const MEMBERSHIP_GQL_FIELDS = {
  id: true,
  workspaceMemberId: true,
  internalEntityId: true,
} satisfies RecordGqlOperationGqlRecordFields;

// Placebo query used while the multi-entity metadata is not provisioned yet,
// so that hooks are always called unconditionally (Rules of Hooks).
const EMPTY_CURRENT_USER_ENTITY_IDS_QUERY = gql`
  query EmptyCurrentUserEntityIds {
    currentUser {
      id
    }
  }
`;

// Returns the set of internal entities the current user belongs to.
// Combines the multi-entity M2M memberships (the canonical source after the
// internal-entity migration) with `user.entityId` as a fallback for users that
// haven't been migrated yet.
//
// FIX-09 : avant `init-internal-entities`, l'objet
// `workspaceMemberEntityMembership` n'existe pas. `useFindManyRecords` lève
// alors `ObjectMetadataItemNotFoundError` au mount (dès `useObjectMetadataItem`,
// indépendamment de `skip`), ce qui faisait crasher toute la page Calendrier
// Groupe. On construit donc la requête manuellement quand la métadonnée est
// disponible, et on retombe sur une requête placebo + le seul `user.entityId`
// sinon — même stratégie que `useSelectableInternalEntities` (IMP-19).
export const useCurrentUserEntityIds = (): Set<string> => {
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const currentUser = useAtomStateValue(currentUserState);
  const apolloCoreClient = useApolloCoreClient();
  const { objectMetadataItems } = useObjectMetadataItems();
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();

  const membershipObjectMetadataItem = useMemo(
    () =>
      objectMetadataItems.find(
        (objectMetadataItem) =>
          objectMetadataItem.nameSingular ===
          WORKSPACE_MEMBER_ENTITY_MEMBERSHIP_OBJECT_NAME,
      ),
    [objectMetadataItems],
  );

  const hasReadPermission = useMemo(() => {
    if (!isDefined(membershipObjectMetadataItem)) {
      return false;
    }

    return getObjectPermissionsForObject(
      objectPermissionsByObjectMetadataId,
      membershipObjectMetadataItem.id,
    ).canReadObjectRecords;
  }, [membershipObjectMetadataItem, objectPermissionsByObjectMetadataId]);

  const findMembershipsQuery = useMemo(
    () =>
      isDefined(membershipObjectMetadataItem)
        ? generateFindManyRecordsQuery({
            objectMetadataItem: membershipObjectMetadataItem,
            objectMetadataItems,
            recordGqlFields: MEMBERSHIP_GQL_FIELDS,
            objectPermissionsByObjectMetadataId,
          })
        : EMPTY_CURRENT_USER_ENTITY_IDS_QUERY,
    [
      membershipObjectMetadataItem,
      objectMetadataItems,
      objectPermissionsByObjectMetadataId,
    ],
  );

  const membershipFilter = useMemo<RecordGqlOperationFilter>(
    () => ({
      workspaceMemberId: { eq: currentWorkspaceMember?.id ?? '' },
    }),
    [currentWorkspaceMember?.id],
  );

  const shouldSkipMembershipQuery =
    !isDefined(membershipObjectMetadataItem) ||
    !isDefined(currentWorkspaceMember) ||
    !hasReadPermission;

  const { data } = useQuery<RecordGqlOperationFindManyResult>(
    findMembershipsQuery,
    {
      client: apolloCoreClient,
      fetchPolicy: 'cache-and-network',
      skip: shouldSkipMembershipQuery,
      variables: {
        filter: membershipFilter,
        limit: GROUP_CALENDAR_CONFIG.limits.entityMembership,
      },
    },
  );

  const memberships = useMemo<WorkspaceMemberEntityMembershipRecord[]>(() => {
    if (!isDefined(membershipObjectMetadataItem)) {
      return [];
    }

    return (
      data?.[membershipObjectMetadataItem.namePlural]?.edges?.map(
        (edge) => edge.node as unknown as WorkspaceMemberEntityMembershipRecord,
      ) ?? []
    );
  }, [data, membershipObjectMetadataItem]);

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
