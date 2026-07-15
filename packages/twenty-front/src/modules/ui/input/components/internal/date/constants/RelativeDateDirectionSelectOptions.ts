import { msg } from '@lingui/core/macro';
import { type RelativeDateFilterDirection } from 'twenty-shared/utils';

type RelativeDateDirectionOption = {
  value: RelativeDateFilterDirection;
  label: string;
};

export const RELATIVE_DATE_DIRECTION_SELECT_OPTIONS: RelativeDateDirectionOption[] =
  [
    { value: 'PAST', label: msg`Past`.id },
    { value: 'THIS', label: msg`This`.id },
    { value: 'NEXT', label: msg`Next`.id },
  ];
