import { HeadlessEngineCommandWrapperEffect } from '@/command-menu-item/engine-command/components/HeadlessEngineCommandWrapperEffect';
import { useHeadlessCommandContextApi } from '@/command-menu-item/engine-command/hooks/useHeadlessCommandContextApi';
import { ImportRecordsNoSelectionRecordCommand } from '@/command-menu-item/engine-command/record/no-selection/components/ImportRecordsNoSelectionRecordCommand';
import { useOpenObjectRecordsSpreadsheetImportDialog } from '@/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog';
import { render } from '@testing-library/react';

const mockOpenObjectRecordsSpreadsheetImportDialog = jest.fn();

jest.mock(
  '@/command-menu-item/engine-command/hooks/useHeadlessCommandContextApi',
  () => ({
    useHeadlessCommandContextApi: jest.fn(),
  }),
);

jest.mock(
  '@/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog',
  () => ({
    useOpenObjectRecordsSpreadsheetImportDialog: jest.fn(),
  }),
);

jest.mock(
  '@/command-menu-item/engine-command/components/HeadlessEngineCommandWrapperEffect',
  () => ({
    HeadlessEngineCommandWrapperEffect: jest.fn(() => null),
  }),
);

const mockedUseHeadlessCommandContextApi = jest.mocked(
  useHeadlessCommandContextApi,
);
const mockedUseOpenObjectRecordsSpreadsheetImportDialog = jest.mocked(
  useOpenObjectRecordsSpreadsheetImportDialog,
);
const mockedHeadlessEngineCommandWrapperEffect = jest.mocked(
  HeadlessEngineCommandWrapperEffect,
);

describe('ImportRecordsNoSelectionRecordCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockedUseHeadlessCommandContextApi.mockReturnValue({
      objectMetadataItem: {
        nameSingular: 'opportunity',
      },
    } as any);

    mockedUseOpenObjectRecordsSpreadsheetImportDialog.mockReturnValue({
      openObjectRecordsSpreadsheetImportDialog:
        mockOpenObjectRecordsSpreadsheetImportDialog,
    });
  });

  it('should wire the command to the native spreadsheet import dialog', () => {
    render(<ImportRecordsNoSelectionRecordCommand />);

    expect(
      mockedUseOpenObjectRecordsSpreadsheetImportDialog,
    ).toHaveBeenCalledWith('opportunity');
    expect(mockedHeadlessEngineCommandWrapperEffect.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        execute: mockOpenObjectRecordsSpreadsheetImportDialog,
      }),
    );
  });
});
