import { useCallback } from 'react';

import { buildEntityScopedRecordFilter } from '@/entity-filter/utils/buildEntityScopedRecordFilter';
import { INTERNAL_ENTITY_OBJECT_NAME_SINGULAR } from '@/internal-entity/constants/InternalEntityObjectNameSingular';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { mapObjectMetadataToGraphQLQuery } from '@/object-metadata/utils/mapObjectMetadataToGraphQLQuery';
import { getRecordsFromRecordConnection } from '@/object-record/cache/utils/getRecordsFromRecordConnection';
import { type RecordGqlFields } from '@/object-record/graphql/record-gql-fields/types/RecordGqlFields';
import { type RecordGqlOperationFindManyResult } from '@/object-record/graphql/types/RecordGqlOperationFindManyResult';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { getCreateManyRecordsMutationResponseField } from '@/object-record/utils/getCreateManyRecordsMutationResponseField';
import { generateFindManyRecordsQuery } from '@/object-record/utils/generateFindManyRecordsQuery';
import { sanitizeRecordInput } from '@/object-record/utils/sanitizeRecordInput';
import { type ImportedStructuredRowMetadata } from '@/spreadsheet-import/steps/components/ValidationStep/types';
import { type ImportedStructuredRow } from '@/spreadsheet-import/types';
import gql from 'graphql-tag';
import Papa from 'papaparse';
import { capitalize, isDefined, isValidUuid } from 'twenty-shared/utils';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { FieldMetadataType, RelationType } from '~/generated-metadata/graphql';

const ID_QUERY_FIELDS: RecordGqlFields = {
  id: true,
};

const ID_AND_NAME_QUERY_FIELDS: RecordGqlFields = {
  id: true,
  name: true,
};

const COMPANY_LABEL_QUERY_FIELDS: RecordGqlFields = {
  id: true,
  name: true,
};

const PERSON_LABEL_QUERY_FIELDS: RecordGqlFields = {
  id: true,
  nameFirstName: true,
  nameLastName: true,
};

const RELATION_PREPARATION_BATCH_SIZE = 200;
const SPREADSHEET_IMPORT_BYPASS_SOURCE_TAGGING_HEADER_NAME =
  'x-spreadsheet-import-bypass-source-tagging';
const LEGACY_IMPORTED_COMPANY_NAME_PREFIX = 'Imported company';
const LEGACY_IMPORTED_PERSON_FIRST_NAME = 'Imported';
const LEGACY_IMPORTED_PERSON_LAST_NAME_PREFIX = 'Contact';

type EnsureOpportunityImportRelationsArgs = {
  allStructuredRows: (ImportedStructuredRow &
    Partial<ImportedStructuredRowMetadata>)[];
  file: File;
  opportunityObjectMetadataItem: EnrichedObjectMetadataItem;
  recordsToCreate: Partial<ObjectRecord>[];
  abortController?: AbortController;
};

type OpportunityImportRelationPreparationResult = {
  attachedCompaniesToInternalEntitiesCount: number;
  attachedPeopleToInternalEntitiesCount: number;
  skippedCompanyRelationsCount: number;
  skippedPeopleRelationsCount: number;
  recordsToCreate: Partial<ObjectRecord>[];
};

type RawOpportunityImportRow = Record<string, string | undefined>;

type ParsedOpportunityImportSourceRow = {
  entityName: string | null;
  opportunityName: string | null;
  companyId: string | null;
  personId: string | null;
};

type RelatedRecordInternalEntityPair = {
  entityId: string;
  relatedRecordId: string;
};

const uniq = (values: string[]) => [...new Set(values)];

const buildFieldInFilter = (fieldName: string, values: string[]) => ({
  [fieldName]: {
    in: values,
  },
});

const buildFindManyQuery = ({
  objectMetadataItem,
  objectMetadataItems,
  objectPermissionsByObjectMetadataId,
  recordGqlFields,
}: {
  objectMetadataItem: EnrichedObjectMetadataItem;
  objectMetadataItems: EnrichedObjectMetadataItem[];
  objectPermissionsByObjectMetadataId: Record<string, any>;
  recordGqlFields: RecordGqlFields;
}) =>
  generateFindManyRecordsQuery({
    objectMetadataItem,
    objectMetadataItems,
    objectPermissionsByObjectMetadataId,
    recordGqlFields,
  });

const findManyToOneRelationFieldByTarget = ({
  objectMetadataItem,
  targetObjectNameSingular,
}: {
  objectMetadataItem: EnrichedObjectMetadataItem;
  targetObjectNameSingular: string;
}) =>
  objectMetadataItem.fields.find(
    (fieldMetadataItem) =>
      fieldMetadataItem.type === FieldMetadataType.RELATION &&
      fieldMetadataItem.relation?.type === RelationType.MANY_TO_ONE &&
      fieldMetadataItem.relation.targetObjectMetadata.nameSingular ===
        targetObjectNameSingular,
  );

const findInternalEntitiesRelationField = (
  sourceObjectMetadataItem: EnrichedObjectMetadataItem,
) =>
  sourceObjectMetadataItem.fields.find(
    (fieldMetadataItem) =>
      fieldMetadataItem.type === FieldMetadataType.RELATION &&
      fieldMetadataItem.name === 'internalEntities' &&
      fieldMetadataItem.relation?.type === RelationType.ONE_TO_MANY,
  );

const buildMembershipRecords = ({
  membershipObjectMetadataItem,
  relatedObjectNameSingular,
  pairs,
}: {
  membershipObjectMetadataItem: EnrichedObjectMetadataItem;
  relatedObjectNameSingular: string;
  pairs: RelatedRecordInternalEntityPair[];
}) => {
  const sourceRelationField = membershipObjectMetadataItem.fields.find(
    (fieldMetadataItem) =>
      fieldMetadataItem.type === FieldMetadataType.RELATION &&
      fieldMetadataItem.relation?.targetObjectMetadata.nameSingular ===
        relatedObjectNameSingular,
  );
  const internalEntityRelationField = membershipObjectMetadataItem.fields.find(
    (fieldMetadataItem) =>
      fieldMetadataItem.type === FieldMetadataType.RELATION &&
      fieldMetadataItem.relation?.targetObjectMetadata.nameSingular ===
        INTERNAL_ENTITY_OBJECT_NAME_SINGULAR,
  );

  if (
    !isDefined(sourceRelationField) ||
    !isDefined(internalEntityRelationField)
  ) {
    return [];
  }

  return pairs.map(({ entityId, relatedRecordId }) => ({
    [sourceRelationField.name]: {
      connect: {
        where: {
          id: relatedRecordId,
        },
      },
    },
    [internalEntityRelationField.name]: {
      connect: {
        where: {
          id: entityId,
        },
      },
    },
  }));
};

const getConnectWhereId = (value: unknown): string | null => {
  if (
    !isDefined(value) ||
    typeof value !== 'object' ||
    !('connect' in value) ||
    !isDefined(value.connect) ||
    typeof value.connect !== 'object' ||
    !('where' in value.connect) ||
    !isDefined(value.connect.where) ||
    typeof value.connect.where !== 'object' ||
    !('id' in value.connect.where)
  ) {
    return null;
  }

  const rawId = value.connect.where.id;

  return typeof rawId === 'string' && rawId.length > 0 ? rawId : null;
};

const parseEntityNameFromCompanyCell = (
  value: string | undefined,
): string | null => {
  if (!isDefined(value)) {
    return null;
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmedValue);

    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      typeof parsed[0] === 'string'
    ) {
      const entityName = parsed[0].trim();

      return entityName.length > 0 ? entityName : null;
    }
  } catch {
    return trimmedValue;
  }

  return trimmedValue;
};

const normalizeOptionalCsvValue = (
  value: string | undefined,
): string | null => {
  if (!isDefined(value)) {
    return null;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : null;
};

const normalizeTextValue = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const shouldClearCompanyLabel = ({
  name,
  companyId,
}: {
  name: unknown;
  companyId: string;
}) => {
  if (typeof name !== 'string') {
    return false;
  }

  const trimmedName = name.trim();

  return (
    trimmedName.startsWith(LEGACY_IMPORTED_COMPANY_NAME_PREFIX) ||
    isValidUuid(trimmedName) ||
    trimmedName === companyId
  );
};

const shouldClearPersonLabel = ({
  nameFirstName,
  nameLastName,
  sourceRow,
  personId,
}: {
  nameFirstName: unknown;
  nameLastName: unknown;
  sourceRow: ParsedOpportunityImportSourceRow | undefined;
  personId: string;
}) => {
  const normalizedFirstName = normalizeTextValue(nameFirstName);
  const normalizedLastName = normalizeTextValue(nameLastName);
  const normalizedFullName = [normalizedFirstName, normalizedLastName]
    .filter((namePart) => namePart.length > 0)
    .join(' ');
  const normalizedOpportunityName = normalizeTextValue(
    sourceRow?.opportunityName,
  );

  return (
    normalizedFirstName === LEGACY_IMPORTED_PERSON_FIRST_NAME ||
    normalizedLastName.startsWith(LEGACY_IMPORTED_PERSON_LAST_NAME_PREFIX) ||
    (isValidUuid(normalizedFirstName) && normalizedLastName.length === 0) ||
    normalizedFullName === personId ||
    (normalizedOpportunityName.length > 0 &&
      normalizedFullName === normalizedOpportunityName)
  );
};

const parseOpportunityImportSourceRowsFromFile = async (
  file: File,
): Promise<ParsedOpportunityImportSourceRow[] | null> => {
  const fileContent =
    typeof file.text === 'function'
      ? await file.text()
      : typeof file.arrayBuffer === 'function'
        ? new TextDecoder().decode(await file.arrayBuffer())
        : await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => resolve(String(reader.result ?? ''));
            reader.onerror = () =>
              reject(reader.error ?? new Error('Unable to read import file'));
            reader.readAsText(file);
          });

  const parsed = Papa.parse<RawOpportunityImportRow>(fileContent, {
    delimiter: ',',
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim().replace(/^\uFEFF/, ''),
  });

  if (parsed.errors.length > 0) {
    return null;
  }

  return parsed.data.map((row) => ({
    entityName: parseEntityNameFromCompanyCell(row.Société),
    opportunityName: normalizeOptionalCsvValue(row.Nom),
    companyId: normalizeOptionalCsvValue(row['Entreprise Id']),
    personId: normalizeOptionalCsvValue(row['Point de contact Id']),
  }));
};

const hasBlockingRowErrors = (
  row: ImportedStructuredRow & Partial<ImportedStructuredRowMetadata>,
) =>
  isDefined(row.__errors) &&
  Object.values(row.__errors).some((error) => error.level === 'error');

const alignParsedSourceRowsWithValidRows = ({
  allStructuredRows,
  parsedSourceRows,
}: {
  allStructuredRows: (ImportedStructuredRow &
    Partial<ImportedStructuredRowMetadata>)[];
  parsedSourceRows: ParsedOpportunityImportSourceRow[];
}) => {
  if (allStructuredRows.length !== parsedSourceRows.length) {
    return null;
  }

  return allStructuredRows.flatMap((row, index) =>
    hasBlockingRowErrors(row) ? [] : [parsedSourceRows[index]],
  );
};

const dedupeRelatedRecordInternalEntityPairs = (
  pairs: RelatedRecordInternalEntityPair[],
) => {
  const uniquePairs = new Map<string, RelatedRecordInternalEntityPair>();

  for (const pair of pairs) {
    uniquePairs.set(`${pair.relatedRecordId}:${pair.entityId}`, pair);
  }

  return [...uniquePairs.values()];
};

export const usePrepareOpportunityImportRelations = () => {
  const apolloCoreClient = useApolloCoreClient();
  const { objectMetadataItems } = useObjectMetadataItems();
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();

  const queryRecordsByFieldValues = useCallback(
    async <TRecord extends Record<string, unknown>>({
      objectMetadataItem,
      fieldName,
      values,
      recordGqlFields,
      internalEntityId,
    }: {
      objectMetadataItem: EnrichedObjectMetadataItem;
      fieldName: string;
      values: string[];
      recordGqlFields: RecordGqlFields;
      internalEntityId?: string;
    }) => {
      if (values.length === 0) {
        return [] as TRecord[];
      }

      const records: TRecord[] = [];
      const deduplicatedValues = uniq(values);
      const query = buildFindManyQuery({
        objectMetadataItem,
        objectMetadataItems,
        objectPermissionsByObjectMetadataId,
        recordGqlFields,
      });

      for (
        let startIndex = 0;
        startIndex < deduplicatedValues.length;
        startIndex += RELATION_PREPARATION_BATCH_SIZE
      ) {
        const chunk = deduplicatedValues.slice(
          startIndex,
          startIndex + RELATION_PREPARATION_BATCH_SIZE,
        );
        const baseFilter = buildFieldInFilter(fieldName, chunk);
        const filter = isDefined(internalEntityId)
          ? buildEntityScopedRecordFilter({
              objectNameSingular: objectMetadataItem.nameSingular,
              filter: baseFilter,
              selectedEntityId: internalEntityId,
            })
          : baseFilter;

        const result = await apolloCoreClient.query({
          query,
          variables: {
            filter,
            limit: chunk.length,
          },
          fetchPolicy: 'no-cache',
        });

        const connection = (result.data as Record<string, any> | undefined)?.[
          objectMetadataItem.namePlural
        ];

        records.push(
          ...(getRecordsFromRecordConnection<ObjectRecord>({
            recordConnection: {
              edges: connection?.edges ?? [],
              pageInfo: connection?.pageInfo ?? {
                hasNextPage: false,
                hasPreviousPage: false,
                startCursor: '',
                endCursor: '',
              },
            },
          }) as TRecord[]),
        );
      }

      return records;
    },
    [
      apolloCoreClient,
      objectMetadataItems,
      objectPermissionsByObjectMetadataId,
    ],
  );

  const queryRecordIds = useCallback(
    async ({
      ids,
      objectMetadataItem,
      internalEntityId,
    }: {
      ids: string[];
      objectMetadataItem: EnrichedObjectMetadataItem;
      internalEntityId?: string;
    }) => {
      const records = await queryRecordsByFieldValues<{ id: string }>({
        objectMetadataItem,
        fieldName: 'id',
        values: ids,
        recordGqlFields: ID_QUERY_FIELDS,
        internalEntityId,
      });

      return new Set(records.map((record) => record.id));
    },
    [queryRecordsByFieldValues],
  );

  const queryInternalEntityIdByName = useCallback(
    async ({
      entityNames,
      internalEntityObjectMetadataItem,
    }: {
      entityNames: string[];
      internalEntityObjectMetadataItem: EnrichedObjectMetadataItem;
    }) => {
      const records = await queryRecordsByFieldValues<{
        id: string;
        name: string;
      }>({
        objectMetadataItem: internalEntityObjectMetadataItem,
        fieldName: 'name',
        values: entityNames,
        recordGqlFields: ID_AND_NAME_QUERY_FIELDS,
      });

      return new Map(
        records
          .filter((record) => typeof record.name === 'string')
          .map((record) => [record.name, record.id]),
      );
    },
    [queryRecordsByFieldValues],
  );

  const createRecords = useCallback(
    async ({
      objectMetadataItem,
      recordsToCreate,
      abortController,
      shouldBypassInternalEntitySourceTagging = false,
      upsert = false,
    }: {
      objectMetadataItem: EnrichedObjectMetadataItem;
      recordsToCreate: Partial<ObjectRecord>[];
      abortController?: AbortController;
      shouldBypassInternalEntitySourceTagging?: boolean;
      upsert?: boolean;
    }) => {
      if (recordsToCreate.length === 0) {
        return;
      }

      const mutationResponseField = getCreateManyRecordsMutationResponseField(
        objectMetadataItem.namePlural,
      );
      const mutation = gql`
        mutation Create${capitalize(
          objectMetadataItem.namePlural,
        )}($data: [${capitalize(
          objectMetadataItem.nameSingular,
        )}CreateInput!]!, $upsert: Boolean) {
          ${mutationResponseField}(data: $data, upsert: $upsert) ${mapObjectMetadataToGraphQLQuery(
            {
              objectMetadataItems,
              objectMetadataItem,
              objectPermissionsByObjectMetadataId,
              recordGqlFields: ID_QUERY_FIELDS,
            },
          )}
        }
      `;

      for (
        let startIndex = 0;
        startIndex < recordsToCreate.length;
        startIndex += RELATION_PREPARATION_BATCH_SIZE
      ) {
        const recordsChunk = recordsToCreate.slice(
          startIndex,
          startIndex + RELATION_PREPARATION_BATCH_SIZE,
        );

        const sanitizedData = recordsChunk.map((recordToCreate) => {
          const sanitizedRecordInput = sanitizeRecordInput({
            objectMetadataItem,
            recordInput: recordToCreate,
          });

          return isDefined(recordToCreate.id)
            ? {
                id: recordToCreate.id,
                ...sanitizedRecordInput,
              }
            : sanitizedRecordInput;
        });

        await apolloCoreClient.mutate({
          mutation,
          variables: {
            data: sanitizedData,
            upsert,
          },
          context: {
            headers: shouldBypassInternalEntitySourceTagging
              ? {
                  [SPREADSHEET_IMPORT_BYPASS_SOURCE_TAGGING_HEADER_NAME]:
                    'true',
                }
              : undefined,
            fetchOptions: {
              signal: abortController?.signal,
            },
          },
        });
      }
    },
    [
      apolloCoreClient,
      objectMetadataItems,
      objectPermissionsByObjectMetadataId,
    ],
  );

  const updateRecords = useCallback(
    async ({
      objectMetadataItem,
      updates,
      abortController,
    }: {
      objectMetadataItem: EnrichedObjectMetadataItem;
      updates: Array<{
        id: string;
        recordInput: Partial<ObjectRecord>;
      }>;
      abortController?: AbortController;
    }) => {
      if (updates.length === 0) {
        return;
      }

      const mutationResponseField = `update${capitalize(
        objectMetadataItem.nameSingular,
      )}`;
      const mutation = gql`
        mutation Update${capitalize(
          objectMetadataItem.nameSingular,
        )}($idToUpdate: UUID!, $input: ${capitalize(
          objectMetadataItem.nameSingular,
        )}UpdateInput!) {
          ${mutationResponseField}(idToUpdate: $idToUpdate, data: $input) ${mapObjectMetadataToGraphQLQuery(
            {
              objectMetadataItems,
              objectMetadataItem,
              objectPermissionsByObjectMetadataId,
              recordGqlFields: ID_QUERY_FIELDS,
            },
          )}
        }
      `;

      for (const update of updates) {
        const sanitizedInput = sanitizeRecordInput({
          objectMetadataItem,
          recordInput: update.recordInput,
        });

        await apolloCoreClient.mutate({
          mutation,
          variables: {
            idToUpdate: update.id,
            input: sanitizedInput,
          },
          context: {
            fetchOptions: {
              signal: abortController?.signal,
            },
          },
        });
      }
    },
    [
      apolloCoreClient,
      objectMetadataItems,
      objectPermissionsByObjectMetadataId,
    ],
  );

  const computePairsMissingMembership = useCallback(
    async ({
      objectMetadataItem,
      pairs,
    }: {
      objectMetadataItem: EnrichedObjectMetadataItem;
      pairs: RelatedRecordInternalEntityPair[];
    }) => {
      const deduplicatedPairs = dedupeRelatedRecordInternalEntityPairs(pairs);
      const recordIdsByInternalEntityId = new Map<string, string[]>();

      for (const pair of deduplicatedPairs) {
        const existingRecordIds = recordIdsByInternalEntityId.get(
          pair.entityId,
        );

        if (!isDefined(existingRecordIds)) {
          recordIdsByInternalEntityId.set(pair.entityId, [
            pair.relatedRecordId,
          ]);

          continue;
        }

        existingRecordIds.push(pair.relatedRecordId);
      }

      const missingPairs: RelatedRecordInternalEntityPair[] = [];

      for (const [entityId, relatedRecordIds] of recordIdsByInternalEntityId) {
        const visibleRecordIds = await queryRecordIds({
          ids: relatedRecordIds,
          objectMetadataItem,
          internalEntityId: entityId,
        });

        for (const relatedRecordId of uniq(relatedRecordIds)) {
          if (!visibleRecordIds.has(relatedRecordId)) {
            missingPairs.push({
              entityId,
              relatedRecordId,
            });
          }
        }
      }

      return missingPairs;
    },
    [queryRecordIds],
  );

  const ensureOpportunityImportRelations = useCallback(
    async ({
      allStructuredRows,
      file,
      opportunityObjectMetadataItem,
      recordsToCreate,
      abortController,
    }: EnsureOpportunityImportRelationsArgs) => {
      if (
        opportunityObjectMetadataItem.nameSingular !==
        CoreObjectNameSingular.Opportunity
      ) {
        return null;
      }

      const companyRelationField = findManyToOneRelationFieldByTarget({
        objectMetadataItem: opportunityObjectMetadataItem,
        targetObjectNameSingular: CoreObjectNameSingular.Company,
      });
      const personRelationField = findManyToOneRelationFieldByTarget({
        objectMetadataItem: opportunityObjectMetadataItem,
        targetObjectNameSingular: CoreObjectNameSingular.Person,
      });
      const internalEntityRelationField = findManyToOneRelationFieldByTarget({
        objectMetadataItem: opportunityObjectMetadataItem,
        targetObjectNameSingular: INTERNAL_ENTITY_OBJECT_NAME_SINGULAR,
      });

      const companyObjectMetadataItem = objectMetadataItems.find(
        (objectMetadataItem) =>
          objectMetadataItem.nameSingular === CoreObjectNameSingular.Company,
      );
      const personObjectMetadataItem = objectMetadataItems.find(
        (objectMetadataItem) =>
          objectMetadataItem.nameSingular === CoreObjectNameSingular.Person,
      );
      const internalEntityObjectMetadataItem = objectMetadataItems.find(
        (objectMetadataItem) =>
          objectMetadataItem.nameSingular ===
          INTERNAL_ENTITY_OBJECT_NAME_SINGULAR,
      );

      if (
        !isDefined(companyObjectMetadataItem) ||
        !isDefined(personObjectMetadataItem)
      ) {
        return null;
      }

      const parsedSourceRows =
        await parseOpportunityImportSourceRowsFromFile(file);
      const alignedSourceRows = isDefined(parsedSourceRows)
        ? alignParsedSourceRowsWithValidRows({
            allStructuredRows,
            parsedSourceRows,
          })
        : null;

      const internalEntityIdByName =
        isDefined(alignedSourceRows) &&
        isDefined(internalEntityObjectMetadataItem) &&
        isDefined(internalEntityRelationField)
          ? await queryInternalEntityIdByName({
              entityNames: alignedSourceRows
                .map((row) => row.entityName)
                .filter(
                  (entityName): entityName is string =>
                    typeof entityName === 'string' && entityName.length > 0,
                ),
              internalEntityObjectMetadataItem,
            })
          : new Map<string, string>();

      const companyIdsToCheck = isDefined(companyRelationField)
        ? recordsToCreate
            .map((recordToCreate) =>
              getConnectWhereId(recordToCreate[companyRelationField.name]),
            )
            .filter((companyId): companyId is string => isDefined(companyId))
        : [];

      const personIdsToCheck = isDefined(personRelationField)
        ? recordsToCreate
            .map((recordToCreate) =>
              getConnectWhereId(recordToCreate[personRelationField.name]),
            )
            .filter((personId): personId is string => isDefined(personId))
        : [];

      const existingCompanyRecords = await queryRecordsByFieldValues<{
        id: string;
        name?: string | null;
      }>({
        objectMetadataItem: companyObjectMetadataItem,
        fieldName: 'id',
        values: companyIdsToCheck,
        recordGqlFields: COMPANY_LABEL_QUERY_FIELDS,
      });
      const existingCompanyRecordById = new Map(
        existingCompanyRecords.map((record) => [record.id, record]),
      );

      const existingPersonRecords = await queryRecordsByFieldValues<{
        id: string;
        nameFirstName?: string | null;
        nameLastName?: string | null;
      }>({
        objectMetadataItem: personObjectMetadataItem,
        fieldName: 'id',
        values: personIdsToCheck,
        recordGqlFields: PERSON_LABEL_QUERY_FIELDS,
      });
      const existingPersonIds = new Set(
        existingPersonRecords.map((record) => record.id),
      );
      const existingPersonRecordById = new Map(
        existingPersonRecords.map((record) => [record.id, record]),
      );

      const personRecordsToUpdateById = new Map<
        string,
        Partial<ObjectRecord>
      >();

      const companyPairsToAttach: RelatedRecordInternalEntityPair[] = [];
      const personPairsToAttach: RelatedRecordInternalEntityPair[] = [];
      let skippedCompanyRelationsCount = 0;
      let skippedPeopleRelationsCount = 0;

      const preparedRecordsToCreate = recordsToCreate.map(
        (recordToCreate, index) => {
          const nextRecordToCreate = {
            ...recordToCreate,
          };
          const alignedSourceRow = alignedSourceRows?.[index];
          const internalEntityId = isDefined(alignedSourceRow?.entityName)
            ? internalEntityIdByName.get(alignedSourceRow.entityName)
            : undefined;

          if (
            isDefined(internalEntityRelationField) &&
            isDefined(internalEntityId) &&
            !isDefined(nextRecordToCreate[internalEntityRelationField.name])
          ) {
            nextRecordToCreate[internalEntityRelationField.name] = {
              connect: {
                where: {
                  id: internalEntityId,
                },
              },
            };
          }

          if (isDefined(companyRelationField)) {
            const companyId = getConnectWhereId(
              nextRecordToCreate[companyRelationField.name],
            );

            if (!isDefined(companyId)) {
              if (!isDefined(alignedSourceRow?.companyId)) {
                nextRecordToCreate[companyRelationField.name] = {
                  disconnect: true,
                };
              }
            } else {
              const existingCompanyRecord =
                existingCompanyRecordById.get(companyId);
              const shouldKeepCompanyRelation =
                isDefined(existingCompanyRecord) &&
                !shouldClearCompanyLabel({
                  name: existingCompanyRecord.name,
                  companyId,
                });

              if (!shouldKeepCompanyRelation) {
                nextRecordToCreate[companyRelationField.name] = {
                  disconnect: true,
                };
                skippedCompanyRelationsCount += 1;
              } else if (isDefined(internalEntityId)) {
                companyPairsToAttach.push({
                  entityId: internalEntityId,
                  relatedRecordId: companyId,
                });
              }
            }
          }

          if (isDefined(personRelationField)) {
            const personId = getConnectWhereId(
              nextRecordToCreate[personRelationField.name],
            );

            if (!isDefined(personId)) {
              if (!isDefined(alignedSourceRow?.personId)) {
                nextRecordToCreate[personRelationField.name] = {
                  disconnect: true,
                };
              }
            } else {
              const existingPersonRecord =
                existingPersonRecordById.get(personId);
              const shouldClearExistingPersonLabel =
                isDefined(existingPersonRecord) &&
                shouldClearPersonLabel({
                  nameFirstName: existingPersonRecord.nameFirstName,
                  nameLastName: existingPersonRecord.nameLastName,
                  sourceRow: alignedSourceRow,
                  personId,
                });

              if (shouldClearExistingPersonLabel) {
                personRecordsToUpdateById.set(personId, {
                  nameFirstName: null,
                  nameLastName: null,
                });
              }

              const shouldKeepPointOfContactRelation =
                isDefined(existingPersonRecord) &&
                !shouldClearExistingPersonLabel;

              if (!shouldKeepPointOfContactRelation) {
                nextRecordToCreate[personRelationField.name] = {
                  disconnect: true,
                };
                skippedPeopleRelationsCount += 1;
              } else if (isDefined(internalEntityId)) {
                personPairsToAttach.push({
                  entityId: internalEntityId,
                  relatedRecordId: personId,
                });
              }
            }
          }

          return nextRecordToCreate;
        },
      );

      await updateRecords({
        objectMetadataItem: personObjectMetadataItem,
        updates: [...personRecordsToUpdateById.entries()].map(
          ([id, recordInput]) => ({
            id,
            recordInput,
          }),
        ),
        abortController,
      });

      const companyPairsMissingMembership = await computePairsMissingMembership(
        {
          objectMetadataItem: companyObjectMetadataItem,
          pairs: companyPairsToAttach,
        },
      );
      const personPairsMissingMembership = await computePairsMissingMembership({
        objectMetadataItem: personObjectMetadataItem,
        pairs: personPairsToAttach,
      });

      const companyInternalEntitiesRelationField =
        findInternalEntitiesRelationField(companyObjectMetadataItem);
      const companyMembershipObjectMetadataItem = isDefined(
        companyInternalEntitiesRelationField,
      )
        ? objectMetadataItems.find(
            (objectMetadataItem) =>
              objectMetadataItem.id ===
              companyInternalEntitiesRelationField.relation
                ?.targetObjectMetadata.id,
          )
        : undefined;

      const personInternalEntitiesRelationField =
        findInternalEntitiesRelationField(personObjectMetadataItem);
      const personMembershipObjectMetadataItem = isDefined(
        personInternalEntitiesRelationField,
      )
        ? objectMetadataItems.find(
            (objectMetadataItem) =>
              objectMetadataItem.id ===
              personInternalEntitiesRelationField.relation?.targetObjectMetadata
                .id,
          )
        : undefined;

      const companyMembershipRecords = isDefined(
        companyMembershipObjectMetadataItem,
      )
        ? buildMembershipRecords({
            membershipObjectMetadataItem: companyMembershipObjectMetadataItem,
            relatedObjectNameSingular: CoreObjectNameSingular.Company,
            pairs: companyPairsMissingMembership,
          })
        : [];
      const personMembershipRecords = isDefined(
        personMembershipObjectMetadataItem,
      )
        ? buildMembershipRecords({
            membershipObjectMetadataItem: personMembershipObjectMetadataItem,
            relatedObjectNameSingular: CoreObjectNameSingular.Person,
            pairs: personPairsMissingMembership,
          })
        : [];

      if (
        isDefined(companyMembershipObjectMetadataItem) &&
        companyMembershipRecords.length > 0
      ) {
        await createRecords({
          objectMetadataItem: companyMembershipObjectMetadataItem,
          recordsToCreate: companyMembershipRecords,
          abortController,
        });
      }

      if (
        isDefined(personMembershipObjectMetadataItem) &&
        personMembershipRecords.length > 0
      ) {
        await createRecords({
          objectMetadataItem: personMembershipObjectMetadataItem,
          recordsToCreate: personMembershipRecords,
          abortController,
        });
      }

      const result: OpportunityImportRelationPreparationResult = {
        attachedCompaniesToInternalEntitiesCount:
          companyMembershipRecords.length,
        attachedPeopleToInternalEntitiesCount: personMembershipRecords.length,
        skippedCompanyRelationsCount,
        skippedPeopleRelationsCount,
        recordsToCreate: preparedRecordsToCreate,
      };

      return result;
    },
    [
      computePairsMissingMembership,
      createRecords,
      objectMetadataItems,
      queryInternalEntityIdByName,
      queryRecordsByFieldValues,
      queryRecordIds,
      updateRecords,
    ],
  );

  return {
    ensureOpportunityImportRelations,
  };
};
