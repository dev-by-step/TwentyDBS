import { useRef } from 'react';

import { useFieldMetadataItem } from '@/object-metadata/hooks/useFieldMetadataItem';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { useGenerateDepthRecordGqlFieldsFromObject } from '@/object-record/graphql/record-gql-fields/hooks/useGenerateDepthRecordGqlFieldsFromObject';
import { useBatchCreateManyRecords } from '@/object-record/hooks/useBatchCreateManyRecords';
import { useBuildSpreadsheetImportFields } from '@/object-record/spreadsheet-import/hooks/useBuildSpreadSheetImportFields';
import { usePrepareOpportunityImportRelations } from '@/object-record/spreadsheet-import/hooks/usePrepareOpportunityImportRelations';
import { buildRecordFromImportedStructuredRow } from '@/object-record/spreadsheet-import/utils/buildRecordFromImportedStructuredRow';
import { spreadsheetImportFilterAvailableFieldMetadataItems } from '@/object-record/spreadsheet-import/utils/spreadsheetImportFilterAvailableFieldMetadataItems';
import { spreadsheetImportGetUnicityTableHook } from '@/object-record/spreadsheet-import/utils/spreadsheetImportGetUnicityTableHook';
import { SPREADSHEET_IMPORT_CREATE_RECORDS_BATCH_SIZE } from '@/spreadsheet-import/constants/SpreadsheetImportCreateRecordsBatchSize';
import { useOpenSpreadsheetImportDialog } from '@/spreadsheet-import/hooks/useOpenSpreadsheetImportDialog';
import { spreadsheetImportCreatedRecordsProgressState } from '@/spreadsheet-import/states/spreadsheetImportCreatedRecordsProgressState';
import { spreadsheetImportDialogState } from '@/spreadsheet-import/states/spreadsheetImportDialogState';
import {
  type ImportedRow,
  type SpreadsheetImportDialogOptions,
  type SpreadsheetImportFields,
} from '@/spreadsheet-import/types';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import Fuse from 'fuse.js';
import { isDefined, isValidUuid } from 'twenty-shared/utils';
import { DEFAULT_ICONS_BY_FIELD_TYPE } from '~/pages/settings/data-model/constants/DefaultIconsByFieldType';
import { computeMetadataNameFromLabel } from '~/pages/settings/data-model/utils/computeMetadataNameFromLabel';
import { normalizeSearchText } from '~/utils/normalizeSearchText';
import { FieldMetadataType } from '~/generated-metadata/graphql';

type ImportConfiguration = {
  availableFieldMetadataItems: FieldMetadataItem[];
  spreadsheetImportFields: SpreadsheetImportFields;
};

const trimImportHeader = (header: string) =>
  header.trim().replace(/^\uFEFF/, '');

const isLikelyIdOnlyColumn = (header: string, columnValues: ImportedRow) => {
  const normalizedHeader = normalizeSearchText(header);

  if (normalizedHeader === 'id' || normalizedHeader.endsWith(' id')) {
    return true;
  }

  const nonEmptyValues = columnValues
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0);

  return (
    nonEmptyValues.length > 0 &&
    nonEmptyValues.every((value) => isValidUuid(value))
  );
};

const buildFieldMatcher = (
  fields: ReadonlyArray<{
    key: string;
    label: string;
    searchAliases?: readonly string[];
  }>,
) =>
  new Fuse(fields, {
    keys: ['label', 'key', 'searchAliases'],
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.3,
  });

const hasReliableFieldMatch = (
  header: string,
  fields: ReadonlyArray<{
    key: string;
    label: string;
    searchAliases?: readonly string[];
  }>,
) => {
  const fieldMatcher = buildFieldMatcher(fields);
  const fieldMatches = fieldMatcher.search(header);
  const firstMatch = fieldMatches[0] ?? null;
  const secondMatch = fieldMatches[1] ?? null;

  return (
    isDefined(firstMatch?.item) &&
    isDefined(firstMatch?.score) &&
    firstMatch.score < 0.4 &&
    ((isDefined(secondMatch?.score) &&
      secondMatch.score !== firstMatch.score) ||
      !isDefined(secondMatch))
  );
};

const getCreatedFieldMetadataItem = (creationResult: unknown) => {
  const createdField = (creationResult as any)?.response?.data?.createOneField;

  if (!isDefined(createdField)) {
    return null;
  }

  return createdField as FieldMetadataItem;
};

export const useOpenObjectRecordsSpreadsheetImportDialog = (
  objectNameSingular: string,
) => {
  const apolloCoreClient = useApolloCoreClient();
  const { createMetadataField } = useFieldMetadataItem();
  const { openSpreadsheetImportDialog } = useOpenSpreadsheetImportDialog();
  const { buildSpreadsheetImportFields } = useBuildSpreadsheetImportFields();
  const { ensureOpportunityImportRelations } =
    usePrepareOpportunityImportRelations();

  const { enqueueErrorSnackBar } = useSnackBar();

  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });

  const setSpreadsheetImportCreatedRecordsProgress = useSetAtomState(
    spreadsheetImportCreatedRecordsProgressState,
  );
  const setSpreadsheetImportDialog = useSetAtomState(
    spreadsheetImportDialogState,
  );

  const { recordGqlFields } = useGenerateDepthRecordGqlFieldsFromObject({
    objectNameSingular,
    depth: 0,
  });

  const { batchCreateManyRecords } = useBatchCreateManyRecords({
    objectNameSingular,
    recordGqlFields,
    mutationBatchSize: SPREADSHEET_IMPORT_CREATE_RECORDS_BATCH_SIZE,
    setBatchedRecordsCount: setSpreadsheetImportCreatedRecordsProgress,
  });

  // Ces refs donnent aux callbacks asynchrones de longue durée définis plus bas
  // (import de fichier volumineux, potentiellement à cheval sur plusieurs
  // rendus) un accès à la valeur la PLUS RÉCENTE sans recréer la closure ni
  // relancer l'import en cours — un besoin que useState ne peut pas couvrir
  // (une closure déjà capturée ne relit jamais un state mis à jour après coup).
  // oxlint-disable-next-line twenty/no-state-useref
  const objectMetadataItemRef = useRef(objectMetadataItem);
  objectMetadataItemRef.current = objectMetadataItem;

  // oxlint-disable-next-line twenty/no-state-useref
  const apolloCoreClientRef = useRef(apolloCoreClient);
  apolloCoreClientRef.current = apolloCoreClient;

  // oxlint-disable-next-line twenty/no-state-useref
  const ensureOpportunityImportRelationsRef = useRef(
    ensureOpportunityImportRelations,
  );
  ensureOpportunityImportRelationsRef.current =
    ensureOpportunityImportRelations;

  // oxlint-disable-next-line twenty/no-state-useref
  const batchCreateManyRecordsRef = useRef(batchCreateManyRecords);
  batchCreateManyRecordsRef.current = batchCreateManyRecords;

  const buildImportConfiguration = (
    fieldMetadataItems: FieldMetadataItem[],
  ): ImportConfiguration => {
    const availableFieldMetadataItems =
      spreadsheetImportFilterAvailableFieldMetadataItems(fieldMetadataItems);

    return {
      availableFieldMetadataItems,
      spreadsheetImportFields: buildSpreadsheetImportFields(
        availableFieldMetadataItems,
      ),
    };
  };

  // oxlint-disable-next-line twenty/no-state-useref
  const importConfigurationRef = useRef<ImportConfiguration>(
    buildImportConfiguration(objectMetadataItem.updatableFields),
  );

  const syncImportConfiguration = (nextConfiguration: ImportConfiguration) => {
    importConfigurationRef.current = nextConfiguration;
    setSpreadsheetImportDialog((currentDialog) => ({
      ...currentDialog,
      options: currentDialog.options
        ? {
            ...currentDialog.options,
            availableFieldMetadataItems:
              nextConfiguration.availableFieldMetadataItems,
            spreadsheetImportFields: nextConfiguration.spreadsheetImportFields,
          }
        : null,
    }));
  };

  const openObjectRecordsSpreadsheetImportDialog = (
    options?: Omit<
      SpreadsheetImportDialogOptions,
      'fields' | 'isOpen' | 'onClose'
    >,
  ) => {
    const abortController = new AbortController();
    const externalSelectHeaderStepHook = options?.selectHeaderStepHook;
    const initialImportConfiguration = buildImportConfiguration(
      objectMetadataItemRef.current.updatableFields,
    );

    importConfigurationRef.current = initialImportConfiguration;

    const ensureMissingCustomFieldsForImportHeaders = async (
      headerRow: ImportedRow,
      importedRows: ImportedRow[],
    ) => {
      const trimmedHeaders = headerRow.map((header) =>
        typeof header === 'string' ? trimImportHeader(header) : '',
      );
      const createdFieldMetadataItems: FieldMetadataItem[] = [];
      const usedFieldNames = new Set(
        objectMetadataItemRef.current.fields.map((field) => field.name),
      );
      let fieldsForMatching: SpreadsheetImportFields = [
        ...importConfigurationRef.current.spreadsheetImportFields,
      ];

      for (const [index, header] of trimmedHeaders.entries()) {
        if (header.length === 0) {
          continue;
        }

        if (hasReliableFieldMatch(header, fieldsForMatching)) {
          continue;
        }

        const columnValues = importedRows.map((row) => row[index]);
        const nonEmptyColumnValues = columnValues
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter((value) => value.length > 0);

        if (nonEmptyColumnValues.length === 0) {
          continue;
        }

        if (isLikelyIdOnlyColumn(header, columnValues)) {
          continue;
        }

        const computedBaseName = computeMetadataNameFromLabel(header);

        if (computedBaseName.length === 0) {
          continue;
        }

        let fieldName = computedBaseName;
        let suffixIndex = 2;

        while (usedFieldNames.has(fieldName)) {
          fieldName = `${computedBaseName}${suffixIndex}`;
          suffixIndex += 1;
        }

        const creationResult = await createMetadataField({
          objectMetadataId: objectMetadataItemRef.current.id,
          type: FieldMetadataType.TEXT,
          label: header,
          name: fieldName,
          icon: DEFAULT_ICONS_BY_FIELD_TYPE[FieldMetadataType.TEXT],
          isLabelSyncedWithName: false,
        });

        if (creationResult.status !== 'successful') {
          throw new Error(`Impossible de créer le champ "${header}".`);
        }

        const createdFieldMetadataItem =
          getCreatedFieldMetadataItem(creationResult);

        if (!isDefined(createdFieldMetadataItem)) {
          throw new Error(
            `Le champ "${header}" a été créé sans réponse exploitable.`,
          );
        }

        createdFieldMetadataItems.push(createdFieldMetadataItem);
        usedFieldNames.add(fieldName);

        fieldsForMatching = [
          ...fieldsForMatching,
          ...buildSpreadsheetImportFields([createdFieldMetadataItem]),
        ];
      }

      if (createdFieldMetadataItems.length === 0) {
        return;
      }

      syncImportConfiguration(
        buildImportConfiguration([
          ...importConfigurationRef.current.availableFieldMetadataItems,
          ...createdFieldMetadataItems,
        ]),
      );
    };

    const onSubmit: SpreadsheetImportDialogOptions['onSubmit'] = async (
      data,
      file,
    ) => {
      const { availableFieldMetadataItems, spreadsheetImportFields } =
        importConfigurationRef.current;

      const createInputs = data.validStructuredRows.map((record) =>
        buildRecordFromImportedStructuredRow({
          importedStructuredRow: record,
          fieldMetadataItems: availableFieldMetadataItems,
          spreadsheetImportFields,
        }),
      );

      try {
        const relationPreparationResult =
          await ensureOpportunityImportRelationsRef.current({
            allStructuredRows: data.allStructuredRows,
            file,
            opportunityObjectMetadataItem: objectMetadataItemRef.current,
            recordsToCreate: createInputs,
            abortController,
          });

        await batchCreateManyRecordsRef.current({
          recordsToCreate:
            relationPreparationResult?.recordsToCreate ?? createInputs,
          upsert: true,
          abortController,
        });

        await apolloCoreClientRef.current.refetchQueries({
          updateCache: (cache) => {
            cache.evict({
              fieldName: objectMetadataItemRef.current.namePlural,
            });
          },
        });
      } catch (error: any) {
        enqueueErrorSnackBar({
          apolloError: error,
        });
      }
    };

    openSpreadsheetImportDialog({
      ...options,
      selectHeaderStepHook: async (headerRow, importedRows) => {
        await ensureMissingCustomFieldsForImportHeaders(
          headerRow,
          importedRows,
        );

        return externalSelectHeaderStepHook
          ? externalSelectHeaderStepHook(headerRow, importedRows)
          : {
              headerRow,
              importedRows,
            };
      },
      onSubmit,
      spreadsheetImportFields:
        initialImportConfiguration.spreadsheetImportFields,
      availableFieldMetadataItems:
        initialImportConfiguration.availableFieldMetadataItems,
      onAbortSubmit: () => {
        abortController.abort();
      },
      tableHook: spreadsheetImportGetUnicityTableHook(
        objectMetadataItemRef.current,
      ),
    });
  };

  return {
    openObjectRecordsSpreadsheetImportDialog,
  };
};
