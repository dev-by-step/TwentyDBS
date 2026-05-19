import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { getGroupByAggregateQueryName } from '@/object-record/record-aggregate/utils/getGroupByAggregateQueryName';
import { getAggregateQueryName } from '@/object-record/utils/getAggregateQueryName';
import { getOperationName } from '~/utils/getOperationName';

const getActiveQueryNames = (
  observableQueries: ReturnType<
    ReturnType<typeof useApolloCoreClient>['getObservableQueries']
  >,
) =>
  new Set(
    [...observableQueries.values()]
      .map((observableQuery) => getOperationName(observableQuery.options.query))
      .filter((queryName): queryName is string => queryName !== undefined),
  );

export const useRefetchAggregateQueriesForObjectMetadataItem = () => {
  const apolloCoreClient = useApolloCoreClient();

  const refetchAggregateQueriesForObjectMetadataItem = async ({
    objectMetadataItem,
  }: {
    objectMetadataItem: EnrichedObjectMetadataItem;
  }) => {
    const queryName = getAggregateQueryName(objectMetadataItem.namePlural);
    const groupByAggregateQueryName = getGroupByAggregateQueryName({
      objectMetadataNamePlural: objectMetadataItem.namePlural,
    });
    const activeQueryNames = getActiveQueryNames(
      apolloCoreClient.getObservableQueries('active'),
    );
    const queryNamesToRefetch = [queryName, groupByAggregateQueryName].filter(
      (name) => activeQueryNames.has(name),
    );

    if (queryNamesToRefetch.length === 0) {
      return;
    }

    await apolloCoreClient.refetchQueries({
      include: queryNamesToRefetch,
    });
  };

  return {
    refetchAggregateQueriesForObjectMetadataItem,
  };
};
