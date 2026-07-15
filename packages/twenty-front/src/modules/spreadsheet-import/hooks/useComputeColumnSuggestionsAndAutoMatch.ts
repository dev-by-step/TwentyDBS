import { useCallback } from 'react';

import { useSpreadsheetImportInternal } from '@/spreadsheet-import/hooks/useSpreadsheetImportInternal';
import { spreadsheetImportDialogState } from '@/spreadsheet-import/states/spreadsheetImportDialogState';
import {
  initialComputedColumnsSelector,
  matchColumnsState,
} from '@/spreadsheet-import/steps/components/MatchColumnsStep/components/states/initialComputedColumnsState';
import { suggestedFieldsByColumnHeaderState } from '@/spreadsheet-import/steps/components/MatchColumnsStep/components/states/suggestedFieldsByColumnHeaderState';
import { type ImportedRow } from '@/spreadsheet-import/types';
import { getMatchedColumnsWithFuse } from '@/spreadsheet-import/utils/getMatchedColumnsWithFuse';
import { useStore } from 'jotai';

export const useComputeColumnSuggestionsAndAutoMatch = () => {
  const store = useStore();
  const { spreadsheetImportFields: fields, autoMapHeaders } =
    useSpreadsheetImportInternal();

  const computeColumnSuggestionsAndAutoMatch = useCallback(
    async ({
      headerValues,
      data,
    }: {
      headerValues: ImportedRow;
      data: ImportedRow[];
    }) => {
      if (autoMapHeaders) {
        const latestFields =
          store.get(spreadsheetImportDialogState.atom).options
            ?.spreadsheetImportFields ?? fields;
        const columns = store.get(
          initialComputedColumnsSelector.selectorFamily(headerValues),
        );

        const { matchedColumns, suggestedFieldsByColumnHeader } =
          getMatchedColumnsWithFuse({
            columns,
            fields: latestFields,
            data,
          });

        store.set(matchColumnsState.atom, matchedColumns);
        store.set(
          suggestedFieldsByColumnHeaderState.atom,
          suggestedFieldsByColumnHeader,
        );
      }
    },
    [autoMapHeaders, fields, store],
  );

  return computeColumnSuggestionsAndAutoMatch;
};
