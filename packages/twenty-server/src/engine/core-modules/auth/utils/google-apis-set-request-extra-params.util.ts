import {
  AuthException,
  AuthExceptionCode,
} from 'src/engine/core-modules/auth/auth.exception';
import { type APIsOAuthRequest } from 'src/engine/core-modules/auth/types/apis-oauth-request.type';

type APIsOAuthRequestExtraParams = {
  transientToken?: string;
  redirectLocation?: string;
  calendarVisibility?: string;
  messageVisibility?: string;
  visibleInternalEntityIds?: string | string[];
  loginHint?: string;
  userId?: string;
  workspaceId?: string;
  skipMessageChannelConfiguration?: string;
};

const parseVisibleInternalEntityIds = (
  value: string | string[] | undefined,
): string[] | undefined => {
  if (!value) {
    return undefined;
  }

  const values = Array.isArray(value) ? value : [value];
  const ids = values
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);

  return ids.length > 0 ? [...new Set(ids)] : undefined;
};

export const setRequestExtraParams = (
  request: APIsOAuthRequest,
  params: APIsOAuthRequestExtraParams,
): void => {
  const {
    transientToken,
    redirectLocation,
    calendarVisibility,
    messageVisibility,
    visibleInternalEntityIds,
    loginHint,
    userId,
    workspaceId,
    skipMessageChannelConfiguration,
  } = params;

  if (!transientToken) {
    throw new AuthException(
      'transientToken is required',
      AuthExceptionCode.INVALID_INPUT,
    );
  }

  request.params.transientToken = transientToken;

  if (redirectLocation) {
    request.params.redirectLocation = redirectLocation;
  }

  if (calendarVisibility) {
    request.params.calendarVisibility = calendarVisibility;
  }

  if (messageVisibility) {
    request.params.messageVisibility = messageVisibility;
  }

  const parsedVisibleInternalEntityIds =
    parseVisibleInternalEntityIds(visibleInternalEntityIds);

  if (parsedVisibleInternalEntityIds) {
    (request.params as Record<string, unknown>).visibleInternalEntityIds =
      parsedVisibleInternalEntityIds;
  }

  if (loginHint) {
    request.params.loginHint = loginHint;
  }

  if (userId) {
    request.params.userId = userId;
  }

  if (workspaceId) {
    request.params.workspaceId = workspaceId;
  }

  if (skipMessageChannelConfiguration) {
    request.params.skipMessageChannelConfiguration =
      skipMessageChannelConfiguration;
  }
};
