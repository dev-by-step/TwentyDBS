import { type WatchQueryFetchPolicy } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { useEntityFilter } from '@/entity-filter/hooks/useEntityFilter';
import {
  buildEntityScopedRecordFilter,
  isEntityFilterRegisteredForObject,
} from '@/entity-filter/utils/buildEntityScopedRecordFilter';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { type ObjectMetadataItemIdentifier } from '@/object-metadata/types/ObjectMetadataItemIdentifier';
import { type RecordGqlOperationFindManyResult } from '@/object-record/graphql/types/RecordGqlOperationFindManyResult';
import { useFetchMoreRecordsWithPagination } from '@/object-record/hooks/useFetchMoreRecordsWithPagination';
import { useFindManyRecordsQuery } from '@/object-record/hooks/useFindManyRecordsQuery';
import { useHandleFindManyRecordsCompleted } from '@/object-record/hooks/useHandleFindManyRecordsCompleted';
import { useHandleFindManyRecordsError } from '@/object-record/hooks/useHandleFindManyRecordsError';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { type OnFindManyRecordsCompleted } from '@/object-record/types/OnFindManyRecordsCompleted';
import { getQueryIdentifier } from '@/object-record/utils/getQueryIdentifier';
import {
  type RecordGqlOperationFilter,
  type RecordGqlOperationGqlRecordFields,
  type RecordGqlOperationVariables,
} from 'twenty-shared/types';

import { QUERY_DEFAULT_LIMIT_RECORDS } from 'twenty-shared/constants';

export type UseFindManyRecordsParams<T> = ObjectMetadataItemIdentifier &
  RecordGqlOperationVariables & {
    onError?: (error?: Error) => void;
    onCompleted?: OnFindManyRecordsCompleted<T>;
    skip?: boolean;
    recordGqlFields?: RecordGqlOperationGqlRecordFields;
    fetchPolicy?: WatchQueryFetchPolicy;
    withSoftDeleted?: boolean;
    /**
     * N'applique pas le filtre client « Ma société / Vue groupe » à cette
     * requête. Réservé aux écrans d'administration qui doivent lister des
     * objets de CONFIGURATION multi-entités (ex. Settings > Internal entities,
     * qui doit proposer une couleur pour *chaque* entité).
     *
     * Ne désactive aucune protection : la portée réelle reste décidée par
     * `InternalEntityAccessPolicyService` côté serveur, qui scope ces objets
     * selon l'entité active de l'appelant et n'exempte en lecture que les
     * platform admins. Un utilisateur non-admin reste donc limité à son entité.
     */
    bypassEntityViewScope?: boolean;
  };

export const useFindManyRecords = <T extends ObjectRecord = ObjectRecord>({
  objectNameSingular,
  filter,
  orderBy,
  skip,
  recordGqlFields,
  fetchPolicy,
  onError,
  onCompleted,
  cursorFilter,
  limit = QUERY_DEFAULT_LIMIT_RECORDS,
  withSoftDeleted = false,
  bypassEntityViewScope = false,
}: UseFindManyRecordsParams<T>) => {
  const { selectedEntityId } = useEntityFilter();
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });
  const apolloCoreClient = useApolloCoreClient();
  const { findManyRecordsQuery } = useFindManyRecordsQuery({
    objectNameSingular,
    recordGqlFields,
    cursorDirection: cursorFilter?.cursorDirection,
  });

  const { handleFindManyRecordsError } = useHandleFindManyRecordsError({
    objectMetadataItem,
    handleError: onError,
  });

  const softDeleteFilter: RecordGqlOperationFilter = {
    or: [{ deletedAt: { is: 'NULL' } }, { deletedAt: { is: 'NOT_NULL' } }],
  };

  const withSoftDeleteFilter = withSoftDeleted
    ? {
        and: [...(filter ? [filter] : []), softDeleteFilter],
      }
    : filter;
  const entityScopedFilter = buildEntityScopedRecordFilter({
    objectNameSingular,
    filter: withSoftDeleteFilter,
    selectedEntityId: bypassEntityViewScope ? null : selectedEntityId,
  });

  const queryIdentifier = getQueryIdentifier({
    objectNameSingular,
    filter: entityScopedFilter,
    orderBy,
    limit,
  });

  const { handleFindManyRecordsCompleted } = useHandleFindManyRecordsCompleted({
    objectMetadataItem,
    queryIdentifier,
    onCompleted,
  });

  const objectPermissions = useObjectPermissionsForObject(
    objectMetadataItem.id,
  );

  const hasReadPermission = objectPermissions.canReadObjectRecords;

  const { data, loading, error, fetchMore, refetch } =
    useQuery<RecordGqlOperationFindManyResult>(findManyRecordsQuery, {
      skip: skip || !isDefined(objectMetadataItem) || !hasReadPermission,
      variables: {
        filter: entityScopedFilter,
        orderBy,
        lastCursor: cursorFilter?.cursor ?? undefined,
        limit,
      },
      fetchPolicy: fetchPolicy,
      client: apolloCoreClient,
    });

  // Pour les objets absents de `DEFAULT_ENTITY_FILTER_MAP` (ex. `note`), la
  // portée par entité est décidée côté SERVEUR via l'en-tête HTTP actif, sans
  // que les variables Apollo ne changent — Apollo ne sait donc pas qu'il doit
  // rafraîchir au bascule Ma société / Vue groupe. On force un refetch dans ce
  // cas précis ; les objets déjà filtrés côté client (company, opportunity…)
  // provoquent déjà un nouvel appel réseau via le changement de variables, et
  // ne passent donc jamais par cette branche.
  const isEntityViewReflectedInQueryVariables =
    bypassEntityViewScope ||
    isEntityFilterRegisteredForObject(objectNameSingular);
  const [previousSelectedEntityId, setPreviousSelectedEntityId] =
    useState(selectedEntityId);

  useEffect(() => {
    if (previousSelectedEntityId === selectedEntityId) {
      return;
    }

    setPreviousSelectedEntityId(selectedEntityId);

    if (!isEntityViewReflectedInQueryVariables) {
      void refetch();
    }
  }, [
    selectedEntityId,
    previousSelectedEntityId,
    isEntityViewReflectedInQueryVariables,
    refetch,
  ]);

  // TODO: Refactor these useEffects to avoid unnecessary re-renders (see PR #18584 review)
  useEffect(() => {
    if (data) {
      handleFindManyRecordsCompleted(data);
    }
  }, [data, handleFindManyRecordsCompleted]);

  useEffect(() => {
    if (error) {
      handleFindManyRecordsError(error);
    }
  }, [error, handleFindManyRecordsError]);

  const { fetchMoreRecords, records, hasNextPage } =
    useFetchMoreRecordsWithPagination<T>({
      objectNameSingular,
      filter: entityScopedFilter,
      orderBy,
      limit,
      fetchMore,
      data,
      error,
      objectMetadataItem,
    });

  const pageInfo = data?.[objectMetadataItem.namePlural]?.pageInfo;

  const totalCount = data?.[objectMetadataItem.namePlural]?.totalCount;

  return {
    objectMetadataItem,
    records,
    totalCount,
    loading,
    error,
    fetchMoreRecords,
    queryIdentifier,
    hasNextPage,
    pageInfo,
    refetch,
  };
};
