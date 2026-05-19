import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
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

export const useRefetchAggregateQueries = () => {
  const apolloCoreClient = useApolloCoreClient();

  const refetchAggregateQueries = async ({
    objectMetadataNamePlural,
  }: {
    objectMetadataNamePlural: string;
  }) => {
    const queryName = getAggregateQueryName(objectMetadataNamePlural);

    const groupByAggregateQueryName = getGroupByAggregateQueryName({
      objectMetadataNamePlural,
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
    refetchAggregateQueries,
  };
};
