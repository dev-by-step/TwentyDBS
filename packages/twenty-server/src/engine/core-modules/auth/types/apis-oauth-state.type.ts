import {
  CalendarChannelVisibility,
  MessageChannelVisibility,
} from 'twenty-shared/types';

export type APIsOAuthState = {
  transientToken?: string;
  redirectLocation?: string;
  calendarVisibility?: CalendarChannelVisibility;
  messageVisibility?: MessageChannelVisibility;
  visibleInternalEntityIds?: string[];
  skipMessageChannelConfiguration?: boolean;
};
