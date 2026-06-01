import { type SpreadsheetImportField } from '@/spreadsheet-import/types';
import { type SpreadsheetColumn } from '@/spreadsheet-import/types/SpreadsheetColumn';
import { SpreadsheetColumnType } from '@/spreadsheet-import/types/SpreadsheetColumnType';
import { getMatchedColumnsWithFuse } from '@/spreadsheet-import/utils/getMatchedColumnsWithFuse';
import { FieldMetadataType } from 'twenty-shared/types';

describe('getMatchedColumnsWithFuse', () => {
  it('matches a csv header against field aliases', () => {
    const columns: SpreadsheetColumn[] = [
      {
        index: 0,
        header: 'Étape',
        type: SpreadsheetColumnType.empty,
      },
    ];

    const fields: SpreadsheetImportField[] = [
      {
        Icon: null,
        label: 'Stage',
        searchAliases: ['Étape', 'Etape'],
        key: 'stage',
        fieldMetadataItemId: 'stage-field-id',
        fieldType: {
          type: 'select',
          options: [
            {
              label: 'Customer',
              value: 'CUSTOMER',
            },
          ],
        },
        fieldMetadataType: FieldMetadataType.SELECT,
        isNestedField: false,
      },
    ];

    const { matchedColumns } = getMatchedColumnsWithFuse({
      columns,
      fields,
      data: [['GAGNE']],
    });

    expect(matchedColumns).toEqual([
      {
        index: 0,
        header: 'Étape',
        type: SpreadsheetColumnType.matchedSelect,
        value: 'stage',
        matchedOptions: [{ entry: 'GAGNE' }],
      },
    ]);
  });
});
