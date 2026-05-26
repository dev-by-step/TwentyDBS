import { type MessageDescriptor } from '@lingui/core';
import { SETTINGS_COMPOSITE_FIELD_TYPE_CONFIGS } from '@/settings/data-model/constants/SettingsCompositeFieldTypeConfigs';
import { type CompositeFieldType } from '@/settings/data-model/types/CompositeFieldType';

export const getCompositeSubFieldLabel = (
  compositeFieldType: CompositeFieldType,
  subFieldName: (typeof SETTINGS_COMPOSITE_FIELD_TYPE_CONFIGS)[CompositeFieldType]['subFields'][number]['subFieldName'],
): string => {
  const label =
    SETTINGS_COMPOSITE_FIELD_TYPE_CONFIGS[compositeFieldType].subFields.find(
      (subField) => subField.subFieldName === subFieldName,
    )?.subFieldLabel || '';
  return typeof label === 'string' ? label : label.id;
};
