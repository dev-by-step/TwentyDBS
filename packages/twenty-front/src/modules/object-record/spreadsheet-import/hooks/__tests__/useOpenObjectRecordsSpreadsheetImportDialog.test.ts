import { renderHook } from '@testing-library/react';
import { act } from 'react';

import { CoreObjectNameSingular } from 'twenty-shared/types';
import { spreadsheetImportDialogState } from '@/spreadsheet-import/states/spreadsheetImportDialogState';

import { useOpenObjectRecordsSpreadsheetImportDialog } from '@/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog';
import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';

import gql from 'graphql-tag';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';
import { FieldMetadataType } from '~/generated-metadata/graphql';

const mockBatchCreateManyRecords = jest.fn().mockResolvedValue([]);
const mockUseBatchCreateManyRecords = jest.fn((_args?: unknown) => ({
  batchCreateManyRecords: mockBatchCreateManyRecords,
}));
const mockCreateMetadataField = jest.fn();

jest.mock('@/object-record/hooks/useBatchCreateManyRecords', () => ({
  useBatchCreateManyRecords: (args: unknown) =>
    mockUseBatchCreateManyRecords(args),
}));

jest.mock('@/object-metadata/hooks/useFieldMetadataItem', () => ({
  useFieldMetadataItem: () => ({
    createMetadataField: mockCreateMetadataField,
  }),
}));

jest.mock(
  '@/object-record/spreadsheet-import/hooks/usePrepareOpportunityImportRelations',
  () => ({
    usePrepareOpportunityImportRelations: () => ({
      ensureOpportunityImportRelations: jest.fn().mockResolvedValue(null),
    }),
  }),
);

const companyId = 'cb2e9f4b-20c3-4759-9315-4ffeecfaf71a';

jest.mock('uuid', () => ({
  v4: jest.fn(() => companyId),
}));

const mockResult = jest.fn(() => ({
  data: {
    createCompanies: [
      {
        id: companyId,
        name: 'Example Company',
        employees: 0,
        idealCustomerProfile: true,
        __typename: 'Company',
      },
    ],
  },
}));

const companyMocks = [
  {
    request: {
      query: gql`
        mutation CreateCompanies(
          $data: [CompanyCreateInput!]!
          $upsert: Boolean
        ) {
          createCompanies(data: $data, upsert: $upsert) {
            id
            name
            employees
            idealCustomerProfile
            __typename
          }
        }
      `,
    },
    variableMatcher: () => true,
    result: mockResult,
  },
];

const fakeCsv = () => {
  const csvContent = 'name\nExample Company';
  const blob = new Blob([csvContent], { type: 'text/csv' });
  return new File([blob], 'fakeData.csv', { type: 'text/csv' });
};

const Wrapper = getJestMetadataAndApolloMocksWrapper({
  apolloMocks: companyMocks,
});

describe('useOpenObjectRecordsSpreadsheetImportDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateMetadataField.mockResolvedValue({
      status: 'successful',
      response: {
        data: {
          createOneField: {
            id: 'created-field-id',
            universalIdentifier: 'created-field-id',
            name: 'secteurLocal',
            label: 'Secteur local',
            type: FieldMetadataType.TEXT,
            icon: 'IconTypography',
            isActive: true,
            isCustom: true,
            isSystem: false,
            isNullable: true,
            createdAt: '2023-01-01',
            updatedAt: '2023-01-01',
            settings: null,
            options: null,
          },
        },
      },
    });
  });

  it('should open dialog and configure onSubmit function correctly', async () => {
    const { result } = renderHook(
      () => {
        const { openObjectRecordsSpreadsheetImportDialog } =
          useOpenObjectRecordsSpreadsheetImportDialog(
            CoreObjectNameSingular.Company,
          );
        return {
          openObjectRecordsSpreadsheetImportDialog,
        };
      },
      { wrapper: Wrapper },
    );

    const spreadsheetImportDialog = jotaiStore.get(
      spreadsheetImportDialogState.atom,
    );

    expect(spreadsheetImportDialog.isOpen).toBe(false);
    expect(spreadsheetImportDialog.options).toBeNull();

    await act(async () => {
      result.current.openObjectRecordsSpreadsheetImportDialog();
    });

    const dialogAfterOpen = jotaiStore.get(spreadsheetImportDialogState.atom);

    expect(dialogAfterOpen.isOpen).toBe(true);
    expect(dialogAfterOpen.options).toHaveProperty('onSubmit');
    expect(dialogAfterOpen.options?.onSubmit).toBeInstanceOf(Function);
    expect(dialogAfterOpen.options).toHaveProperty('spreadsheetImportFields');
    expect(
      Array.isArray(dialogAfterOpen.options?.spreadsheetImportFields),
    ).toBe(true);
  });

  it('should call batchCreateManyRecords when onSubmit is executed', async () => {
    const { result } = renderHook(
      () => {
        const { openObjectRecordsSpreadsheetImportDialog } =
          useOpenObjectRecordsSpreadsheetImportDialog(
            CoreObjectNameSingular.Company,
          );
        return {
          openObjectRecordsSpreadsheetImportDialog,
        };
      },
      { wrapper: Wrapper },
    );

    await act(async () => {
      result.current.openObjectRecordsSpreadsheetImportDialog();
    });

    const spreadsheetImportDialog = jotaiStore.get(
      spreadsheetImportDialogState.atom,
    );

    const submitData = {
      validStructuredRows: [
        {
          id: companyId,
          name: 'Example Company',
          idealCustomerProfile: true,
          employees: '0',
        },
      ],
      invalidStructuredRows: [],
      allStructuredRows: [
        {
          id: companyId,
          name: 'Example Company',
          __index: 'cbc3985f-dde9-46d1-bae2-c124141700ac',
          idealCustomerProfile: true,
          employees: '0',
        },
      ],
    };

    await act(async () => {
      await spreadsheetImportDialog.options?.onSubmit(submitData, fakeCsv());
    });

    expect(mockBatchCreateManyRecords).toHaveBeenCalledTimes(1);

    const callArgs = mockBatchCreateManyRecords.mock.calls[0][0];
    expect(callArgs).toHaveProperty('recordsToCreate');
    expect(callArgs).toHaveProperty('upsert', true);
    expect(Array.isArray(callArgs.recordsToCreate)).toBe(true);
    expect(callArgs.recordsToCreate).toHaveLength(1);

    const recordToCreate = callArgs.recordsToCreate[0];
    expect(recordToCreate).toHaveProperty('name', 'Example Company');
    expect(recordToCreate).toHaveProperty('idealCustomerProfile', true);
    expect(recordToCreate).toHaveProperty('employees', 0);
  });

  it('should use a fresh abort controller after a cancelled import', async () => {
    const { result } = renderHook(
      () => {
        const { openObjectRecordsSpreadsheetImportDialog } =
          useOpenObjectRecordsSpreadsheetImportDialog(
            CoreObjectNameSingular.Company,
          );
        return {
          openObjectRecordsSpreadsheetImportDialog,
        };
      },
      { wrapper: Wrapper },
    );

    await act(async () => {
      result.current.openObjectRecordsSpreadsheetImportDialog();
    });

    const firstDialog = jotaiStore.get(spreadsheetImportDialogState.atom);

    await act(async () => {
      firstDialog.options?.onAbortSubmit?.();
    });

    await act(async () => {
      result.current.openObjectRecordsSpreadsheetImportDialog();
    });

    const secondDialog = jotaiStore.get(spreadsheetImportDialogState.atom);

    await act(async () => {
      await secondDialog.options?.onSubmit(
        {
          validStructuredRows: [{ name: 'Example Company' }],
          invalidStructuredRows: [],
          allStructuredRows: [
            { __index: 'import-row-1', name: 'Example Company' },
          ],
        },
        fakeCsv(),
      );
    });

    const callArgs = mockBatchCreateManyRecords.mock.calls[0][0];

    expect(callArgs.abortController).toBeInstanceOf(AbortController);
    expect(callArgs.abortController.signal.aborted).toBe(false);
  });

  it('creates a text field when the csv contains an unknown non-id column', async () => {
    const { result } = renderHook(
      () => {
        const { openObjectRecordsSpreadsheetImportDialog } =
          useOpenObjectRecordsSpreadsheetImportDialog(
            CoreObjectNameSingular.Company,
          );
        return {
          openObjectRecordsSpreadsheetImportDialog,
        };
      },
      { wrapper: Wrapper },
    );

    await act(async () => {
      result.current.openObjectRecordsSpreadsheetImportDialog();
    });

    const spreadsheetImportDialog = jotaiStore.get(
      spreadsheetImportDialogState.atom,
    );

    await act(async () => {
      await spreadsheetImportDialog.options?.selectHeaderStepHook?.(
        ['Secteur local'],
        [['Conseil']],
      );
    });

    expect(mockCreateMetadataField).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Secteur local',
        name: 'secteurLocal',
        type: FieldMetadataType.TEXT,
      }),
    );

    const dialogAfterFieldCreation = jotaiStore.get(
      spreadsheetImportDialogState.atom,
    );

    expect(dialogAfterFieldCreation.options?.spreadsheetImportFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'secteurLocal',
          label: 'Secteur local',
        }),
      ]),
    );
  });
});
