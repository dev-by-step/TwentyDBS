import { spreadsheetImportFilterAvailableFieldMetadataItems } from '@/object-record/spreadsheet-import/utils/spreadsheetImportFilterAvailableFieldMetadataItems';
import { FieldMetadataType, RelationType } from '~/generated-metadata/graphql';

describe('spreadsheetImportFilterAvailableFieldMetadataItems', () => {
  it('hides raw join columns when the matching many-to-one relation field is importable', () => {
    const fields = [
      {
        id: 'record-id',
        name: 'id',
        type: FieldMetadataType.UUID,
        isActive: true,
        isSystem: true,
      },
      {
        id: 'name-field',
        name: 'name',
        type: FieldMetadataType.TEXT,
        isActive: true,
        isSystem: false,
      },
      {
        id: 'internal-entity-id-field',
        name: 'internalEntityId',
        type: FieldMetadataType.UUID,
        isActive: true,
        isSystem: false,
      },
      {
        id: 'internal-entity-field',
        name: 'internalEntity',
        type: FieldMetadataType.RELATION,
        isActive: true,
        isSystem: false,
        settings: {
          joinColumnName: 'internalEntityId',
        },
        relation: {
          type: RelationType.MANY_TO_ONE,
        },
      },
      {
        id: 'company-id-field',
        name: 'companyId',
        type: FieldMetadataType.UUID,
        isActive: true,
        isSystem: false,
      },
      {
        id: 'company-field',
        name: 'company',
        type: FieldMetadataType.RELATION,
        isActive: true,
        isSystem: false,
        settings: {
          joinColumnName: 'companyId',
        },
        relation: {
          type: RelationType.MANY_TO_ONE,
        },
      },
    ] as any;

    const result = spreadsheetImportFilterAvailableFieldMetadataItems(fields);

    expect(result.map((field) => field.name)).toEqual([
      'company',
      'id',
      'internalEntity',
      'name',
    ]);
  });
});
