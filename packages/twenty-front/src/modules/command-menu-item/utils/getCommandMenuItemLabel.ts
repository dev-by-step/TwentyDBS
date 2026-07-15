import { i18n, type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { isString } from '@sniptt/guards';
import { type Nullable } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

const NEW_COMMAND_LABEL_PREFIX = 'New ';

const translateLegacyNewCommandLabel = (label: string): string => {
  if (!label.startsWith(NEW_COMMAND_LABEL_PREFIX)) {
    return label;
  }

  return `${i18n._(msg`Create`)} ${label.slice(NEW_COMMAND_LABEL_PREFIX.length)}`;
};

export const getCommandMenuItemLabel = (
  label: Nullable<string | MessageDescriptor>,
): string => {
  if (!isDefined(label)) {
    return '';
  }

  return isString(label)
    ? translateLegacyNewCommandLabel(label)
    : i18n._(label);
};
