import { useMemo, useState } from 'react';

import { InternalEntityDetachConfirmationModal } from '@/internal-entity/components/InternalEntityDetachConfirmationModal';
import { MultipleRecordPicker } from '@/object-record/record-picker/multiple-record-picker/components/MultipleRecordPicker';
import { type RecordPickerLayoutDirection } from '@/object-record/record-picker/types/RecordPickerLayoutDirection';
import { type RecordPickerPickableMorphItem } from '@/object-record/record-picker/types/RecordPickerPickableMorphItem';
import { useModal } from '@/ui/layout/modal/hooks/useModal';

type InternalEntityRelationPickerProps = {
  componentInstanceId: string;
  focusId: string;
  layoutDirection?: RecordPickerLayoutDirection;
  modalInstanceId: string;
  onChange: (morphItem: RecordPickerPickableMorphItem) => void;
  onClickOutside: () => void;
  onSubmit?: () => void;
  selectedRecordIds?: readonly string[];
};

export const InternalEntityRelationPicker = ({
  componentInstanceId,
  focusId,
  layoutDirection,
  modalInstanceId,
  onChange,
  onClickOutside,
  onSubmit,
  selectedRecordIds,
}: InternalEntityRelationPickerProps) => {
  const { closeModal, openModal } = useModal();
  const [pendingRemovalMorphItem, setPendingRemovalMorphItem] =
    useState<RecordPickerPickableMorphItem | null>(null);
  const selectedRecordIdSet = useMemo(
    () => new Set(selectedRecordIds ?? []),
    [selectedRecordIds],
  );

  const handleChange = (morphItem: RecordPickerPickableMorphItem) => {
    if (morphItem.isSelected) {
      onChange(morphItem);

      return;
    }

    if (
      selectedRecordIds !== undefined &&
      !selectedRecordIdSet.has(morphItem.recordId)
    ) {
      onChange({
        ...morphItem,
        isSelected: true,
      });

      return;
    }

    setPendingRemovalMorphItem(morphItem);
    openModal(modalInstanceId);
  };

  const handleConfirmRemoval = async () => {
    if (pendingRemovalMorphItem === null) {
      return;
    }

    onChange(pendingRemovalMorphItem);
    setPendingRemovalMorphItem(null);
    closeModal(modalInstanceId);
  };

  return (
    <>
      <MultipleRecordPicker
        focusId={focusId}
        componentInstanceId={componentInstanceId}
        onChange={handleChange}
        onSubmit={onSubmit}
        onClickOutside={onClickOutside}
        layoutDirection={layoutDirection}
      />
      <InternalEntityDetachConfirmationModal
        modalInstanceId={modalInstanceId}
        onConfirmClick={handleConfirmRemoval}
        onClose={() => {
          setPendingRemovalMorphItem(null);
        }}
      />
    </>
  );
};
