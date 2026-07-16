import { fireEvent, render, screen } from '@testing-library/react';

import { InternalEntityRelationPicker } from '@/internal-entity/components/InternalEntityRelationPicker';
import { useModal } from '@/ui/layout/modal/hooks/useModal';

let latestMultipleRecordPickerProps: Record<string, unknown> | undefined;
let latestDetachModalProps: Record<string, unknown> | undefined;

jest.mock(
  '@/object-record/record-picker/multiple-record-picker/components/MultipleRecordPicker',
  () => ({
    MultipleRecordPicker: (props: Record<string, unknown>) => {
      latestMultipleRecordPickerProps = props;

      return (
        <div>
          <button
            data-testid="select-record"
            onClick={() =>
              (props.onChange as Function)({
                objectMetadataId: 'internal-entity-object-id',
                recordId: 'internal-entity-1',
                isMatchingSearchFilter: true,
                isSelected: true,
              })
            }
            type="button"
          />
          <button
            data-testid="deselect-record"
            onClick={() =>
              (props.onChange as Function)({
                objectMetadataId: 'internal-entity-object-id',
                recordId: 'internal-entity-1',
                isMatchingSearchFilter: true,
                isSelected: false,
              })
            }
            type="button"
          />
        </div>
      );
    },
  }),
);

jest.mock(
  '@/internal-entity/components/InternalEntityDetachConfirmationModal',
  () => ({
    InternalEntityDetachConfirmationModal: (props: Record<string, unknown>) => {
      latestDetachModalProps = props;

      return (
        <div>
          <button
            data-testid="confirm-detach"
            onClick={() => (props.onConfirmClick as Function)()}
            type="button"
          />
          <button
            data-testid="close-detach-modal"
            onClick={() => (props.onClose as Function | undefined)?.()}
            type="button"
          />
        </div>
      );
    },
  }),
);

jest.mock('@/ui/layout/modal/hooks/useModal');

const mockUseModal = useModal as jest.MockedFunction<typeof useModal>;

describe('InternalEntityRelationPicker', () => {
  const mockOpenModal = jest.fn();
  const mockCloseModal = jest.fn();
  const mockOnChange = jest.fn();
  const mockOnClickOutside = jest.fn();
  const modalInstanceId = 'internal-entity-modal-id';

  beforeEach(() => {
    latestMultipleRecordPickerProps = undefined;
    latestDetachModalProps = undefined;
    jest.clearAllMocks();

    mockUseModal.mockReturnValue({
      closeModal: mockCloseModal,
      openModal: mockOpenModal,
      toggleModal: jest.fn(),
    });
  });

  const renderPicker = ({
    selectedRecordIds,
  }: { selectedRecordIds?: readonly string[] } = {}) =>
    render(
      <InternalEntityRelationPicker
        componentInstanceId="picker-instance-id"
        focusId="picker-focus-id"
        modalInstanceId={modalInstanceId}
        onChange={mockOnChange}
        onClickOutside={mockOnClickOutside}
        selectedRecordIds={selectedRecordIds}
      />,
    );

  it('should not expose create new from the internal entity picker', () => {
    renderPicker();

    expect(latestMultipleRecordPickerProps?.onCreate).toBeUndefined();
  });

  it('should forward selected entities immediately', () => {
    renderPicker();

    fireEvent.click(screen.getByTestId('select-record'));

    expect(mockOnChange).toHaveBeenCalledWith({
      objectMetadataId: 'internal-entity-object-id',
      recordId: 'internal-entity-1',
      isMatchingSearchFilter: true,
      isSelected: true,
    });
    expect(mockOpenModal).not.toHaveBeenCalled();
  });

  it('should require confirmation before removing an entity', () => {
    renderPicker({ selectedRecordIds: ['internal-entity-1'] });

    fireEvent.click(screen.getByTestId('deselect-record'));

    expect(mockOnChange).not.toHaveBeenCalled();
    expect(mockOpenModal).toHaveBeenCalledWith(modalInstanceId);

    fireEvent.click(screen.getByTestId('confirm-detach'));

    expect(mockOnChange).toHaveBeenCalledWith({
      objectMetadataId: 'internal-entity-object-id',
      recordId: 'internal-entity-1',
      isMatchingSearchFilter: true,
      isSelected: false,
    });
    expect(mockCloseModal).toHaveBeenCalledWith(modalInstanceId);
  });

  it('should treat stale deselection as an add without opening the removal modal', () => {
    renderPicker({ selectedRecordIds: [] });

    fireEvent.click(screen.getByTestId('deselect-record'));

    expect(mockOnChange).toHaveBeenCalledWith({
      objectMetadataId: 'internal-entity-object-id',
      recordId: 'internal-entity-1',
      isMatchingSearchFilter: true,
      isSelected: true,
    });
    expect(mockOpenModal).not.toHaveBeenCalled();
  });

  it('should clear the pending removal when the modal closes', () => {
    renderPicker({ selectedRecordIds: ['internal-entity-1'] });

    fireEvent.click(screen.getByTestId('deselect-record'));
    fireEvent.click(screen.getByTestId('close-detach-modal'));
    fireEvent.click(screen.getByTestId('confirm-detach'));

    expect(mockOnChange).not.toHaveBeenCalled();
    expect(latestDetachModalProps?.modalInstanceId).toBe(modalInstanceId);
  });
});
