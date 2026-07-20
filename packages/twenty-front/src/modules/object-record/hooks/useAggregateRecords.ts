import { useQuery } from '@apollo/client/react';
import { useEffect, useState } from 'react';

import { useEntityFilter } from '@/entity-filter/hooks/useEntityFilter';
import {
  buildEntityScopedRecordFilter,
  isEntityFilterRegisteredForObject,
} from '@/entity-filter/utils/buildEntityScopedRecordFilter';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { type RecordGqlFieldsAggregate } from '@/object-record/graphql/types/RecordGqlFieldsAggregate';
import { type RecordGqlOperationFindManyResult } from '@/object-record/graphql/types/RecordGqlOperationFindManyResult';
import { useAggregateRecordsQuery } from '@/object-record/hooks/useAggregateRecordsQuery';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { currentUserState } from '@/auth/states/currentUserState';
import { type ExtendedAggregateOperations } from '@/object-record/record-table/types/ExtendedAggregateOperations';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import isEmpty from 'lodash.isempty';
import { type RecordGqlOperationFilter } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

export type AggregateRecordsData = {
  [fieldName: string]: {
    [operation in ExtendedAggregateOperations]?: string | number | undefined;
  };
};

export const useAggregateRecords = <T extends AggregateRecordsData>({
  objectNameSingular,
  filter,
  recordGqlFieldsAggregate,
  skip,
}: {
  objectNameSingular: string;
  recordGqlFieldsAggregate: RecordGqlFieldsAggregate;
  filter?: RecordGqlOperationFilter;
  skip?: boolean;
}) => {
  const { selectedEntityId } = useEntityFilter();
  // Le décor de la page de connexion monte une vraie table d'enregistrements
  // alimentée par des données mockées. Les requêtes de records sont déjà
  // court-circuitées dans ce cas (cf. `useRecordIndexTableQuery`), mais pas les
  // agrégations : elles partaient sans session et échouaient en 400
  // (« Unknown type CompanyFilterInput », le schéma n'étant pas résolu hors
  // authentification). On se gate sur l'état d'authentification réel plutôt que
  // sur la route (`useShowAuthModal` dépend du Router, dépendance trop lourde
  // pour un hook de données aussi largement utilisé).
  const currentUser = useAtomStateValue(currentUserState);
  const isAuthenticated = isDefined(currentUser);
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });

  const apolloCoreClient = useApolloCoreClient();

  const { aggregateQuery, gqlFieldToFieldMap } = useAggregateRecordsQuery({
    objectNameSingular,
    recordGqlFieldsAggregate,
  });

  const objectPermissions = useObjectPermissionsForObject(
    objectMetadataItem.id,
  );

  const hasReadPermission = objectPermissions.canReadObjectRecords;
  const entityScopedFilter = buildEntityScopedRecordFilter({
    objectNameSingular,
    filter,
    selectedEntityId,
  });

  const { data, loading, error, refetch } =
    useQuery<RecordGqlOperationFindManyResult>(aggregateQuery, {
      skip:
        skip ||
        !isAuthenticated ||
        !isDefined(objectMetadataItem) ||
        !hasReadPermission,
      variables: {
        filter: entityScopedFilter,
      },
      client: apolloCoreClient,
    });

  // Même correctif que `useFindManyRecords` : pour les objets absents de
  // `DEFAULT_ENTITY_FILTER_MAP` (ex. `note`), le scope par entité est décidé
  // côté serveur via l'en-tête HTTP actif sans que les variables Apollo ne
  // changent, donc le total agrégé (ex. le compteur « Toutes les Notes · N »)
  // ne se rafraîchit pas tout seul au bascule Ma société / Vue groupe.
  const isEntityViewReflectedInQueryVariables =
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

  const formattedData: AggregateRecordsData = {};

  if (!isEmpty(data)) {
    Object.entries(data?.[objectMetadataItem.namePlural] ?? {})?.forEach(
      ([gqlField, result]) => {
        if (isDefined(gqlFieldToFieldMap[gqlField])) {
          const [fieldName, aggregateOperation] = gqlFieldToFieldMap[gqlField];
          formattedData[fieldName] = {
            ...(formattedData[fieldName] ?? {}),
            [aggregateOperation]: result,
          };
        }
      },
    );
  }

  return {
    objectMetadataItem,
    data: formattedData as T,
    loading,
    error,
  };
};
