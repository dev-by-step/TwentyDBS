import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { useMemo } from 'react';
import { MULTI_ENTITY_OBJECT_NAME } from 'twenty-shared/constants';
import {
  type RecordGqlOperationFilter,
  type RecordGqlOperationGqlRecordFields,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import {
  type SelectableInternalEntity,
  type SelectableInternalEntityMembership,
  buildSelectableInternalEntities,
} from '@/entity-filter/utils/buildSelectableInternalEntities';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { type RecordGqlOperationFindManyResult } from '@/object-record/graphql/types/RecordGqlOperationFindManyResult';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { generateFindManyRecordsQuery } from '@/object-record/utils/generateFindManyRecordsQuery';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

const ENTITY_SELECTOR_MEMBERSHIP_LIMIT = 50;

const ENTITY_SELECTOR_MEMBERSHIP_FIELDS = {
  id: true,
  workspaceMemberId: true,
  internalEntityId: true,
  internalEntity: {
    id: true,
    name: true,
    color: true,
  },
} satisfies RecordGqlOperationGqlRecordFields;

const EMPTY_SELECTABLE_INTERNAL_ENTITIES_QUERY = gql`
  query EmptySelectableInternalEntities {
    currentUser {
      id
    }
  }
`;

type UseSelectableInternalEntitiesReturn = {
  selectableInternalEntities: SelectableInternalEntity[];
  isLoading: boolean;
};

export const useSelectableInternalEntities = ({
  fallbackEntityLabel,
}: {
  fallbackEntityLabel: string;
}): UseSelectableInternalEntitiesReturn => {
  const currentUser = useAtomStateValue(currentUserState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const apolloCoreClient = useApolloCoreClient();
  const { objectMetadataItems } = useObjectMetadataItems();
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();

  const membershipObjectMetadataItem = useMemo(
    () =>
      objectMetadataItems.find(
        (objectMetadataItem) =>
          objectMetadataItem.nameSingular ===
          MULTI_ENTITY_OBJECT_NAME.WorkspaceMemberEntityMembership,
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

  const membershipFilter = useMemo<RecordGqlOperationFilter>(
    () => ({
      workspaceMemberId: { eq: currentWorkspaceMember?.id ?? '' },
    }),
    [currentWorkspaceMember?.id],
  );

  const findMembershipsQuery = useMemo(
    () =>
      isDefined(membershipObjectMetadataItem)
        ? generateFindManyRecordsQuery({
            objectMetadataItem: membershipObjectMetadataItem,
            objectMetadataItems,
            recordGqlFields: ENTITY_SELECTOR_MEMBERSHIP_FIELDS,
            objectPermissionsByObjectMetadataId,
          })
        : EMPTY_SELECTABLE_INTERNAL_ENTITIES_QUERY,
    [
      membershipObjectMetadataItem,
      objectMetadataItems,
      objectPermissionsByObjectMetadataId,
    ],
  );

  const shouldSkipMembershipQuery =
    !isDefined(membershipObjectMetadataItem) ||
    !isDefined(currentWorkspaceMember) ||
    !hasReadPermission;

  const { data, loading } = useQuery<RecordGqlOperationFindManyResult>(
    findMembershipsQuery,
    {
      client: apolloCoreClient,
      fetchPolicy: 'cache-and-network',
      skip: shouldSkipMembershipQuery,
      variables: {
        filter: membershipFilter,
        limit: ENTITY_SELECTOR_MEMBERSHIP_LIMIT,
      },
    },
  );

  const memberships = useMemo<SelectableInternalEntityMembership[]>(() => {
    if (!isDefined(membershipObjectMetadataItem)) {
      return [];
    }

    return (
      data?.[membershipObjectMetadataItem.namePlural]?.edges?.map((edge) => {
        const node = edge.node as unknown as SelectableInternalEntityMembership;

        return {
          internalEntityId: node.internalEntityId,
          internalEntity: node.internalEntity,
        };
      }) ?? []
    );
  }, [data, membershipObjectMetadataItem]);

  const selectableInternalEntities = useMemo(
    () =>
      buildSelectableInternalEntities({
        currentUserEntityId: currentUser?.entityId ?? null,
        fallbackEntityLabel,
        memberships,
      }),
    [currentUser?.entityId, fallbackEntityLabel, memberships],
  );

  return {
    selectableInternalEntities,
    isLoading: loading,
  };
};
