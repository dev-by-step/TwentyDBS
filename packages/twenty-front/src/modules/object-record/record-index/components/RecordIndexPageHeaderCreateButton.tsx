import { isLayoutCustomizationModeEnabledState } from '@/layout-customization/states/isLayoutCustomizationModeEnabledState';
import { isObjectMetadataReadOnly } from '@/object-record/read-only/utils/isObjectMetadataReadOnly';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { hasAnySoftDeleteFilterOnViewComponentSelector } from '@/object-record/record-filter/states/hasAnySoftDeleteFilterOnView';
import { useCreateNewIndexRecord } from '@/object-record/record-table/hooks/useCreateNewIndexRecord';
import { isRecordTableCreateDisabled } from '@/object-record/record-table/utils/isRecordTableCreateDisabled';
import { useAtomComponentSelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { IconPlus } from 'twenty-ui/display';
import { Button } from 'twenty-ui/input';
import { useIsMobile } from 'twenty-ui/utilities';

export const RecordIndexPageHeaderCreateButton = () => {
  const { objectMetadataItem, objectPermissionsByObjectMetadataId } =
    useRecordIndexContextOrThrow();

  const isMobile = useIsMobile();
  const isLayoutCustomizationModeEnabled = useAtomStateValue(
    isLayoutCustomizationModeEnabledState,
  );

  const hasAnySoftDeleteFilterOnView = useAtomComponentSelectorValue(
    hasAnySoftDeleteFilterOnViewComponentSelector,
  );

  const { createNewIndexRecord } = useCreateNewIndexRecord({
    objectMetadataItem,
  });

  const objectPermissions =
    objectPermissionsByObjectMetadataId[objectMetadataItem.id];

  if (!isDefined(objectPermissions)) {
    return null;
  }

  if (!isMobile) {
    return null;
  }

  const isReadOnly =
    isLayoutCustomizationModeEnabled ||
    isObjectMetadataReadOnly({
      objectPermissions,
      objectMetadataItem,
    });

  if (isReadOnly) {
    return null;
  }

  if (!objectPermissions.canUpdateObjectRecords) {
    return null;
  }

  if (hasAnySoftDeleteFilterOnView) {
    return null;
  }

  if (isRecordTableCreateDisabled(objectMetadataItem)) {
    return null;
  }

  const createButtonTitle = [t`Create`, objectMetadataItem.labelSingular].join(
    ' ',
  );

  return (
    <Button
      Icon={IconPlus}
      title={createButtonTitle}
      ariaLabel={createButtonTitle}
      size="small"
      accent="blue"
      dataTestId="record-index-page-header-create-button"
      onClick={() => createNewIndexRecord({ position: 'first' })}
    />
  );
};
