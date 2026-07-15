import { msg } from '@lingui/core/macro';
import { type RelativeDateFilterUnit } from 'twenty-shared/utils';

type RelativeDateUnitOption = {
  value: RelativeDateFilterUnit;
  label: string;
};

export const RELATIVE_DATE_UNITS_SELECT_OPTIONS: RelativeDateUnitOption[] = [
  { value: 'DAY', label: msg`Day`.id },
  { value: 'WEEK', label: msg`Week`.id },
  { value: 'MONTH', label: msg`Month`.id },
  { value: 'QUARTER', label: msg`Quarter`.id },
  { value: 'YEAR', label: msg`Year`.id },
];
