import { type Request } from 'express';
import { type APP_LOCALES, SOURCE_LOCALE } from 'twenty-shared/translations';

import { type RawAuthContext } from 'src/engine/core-modules/auth/types/auth-context.type';

export const ACTIVE_INTERNAL_ENTITY_ID_HEADER =
  'x-active-internal-entity-id';

const normalizeOptionalEntityId = (entityId?: string | null) => {
  if (!entityId || entityId.trim().length === 0) {
    return null;
  }

  return entityId.trim().toLowerCase();
};

export const extractActiveInternalEntityIdFromRequest = (
  request: Pick<Request, 'headers'>,
) => {
  const headerValue = request.headers[ACTIVE_INTERNAL_ENTITY_ID_HEADER];

  return normalizeOptionalEntityId(
    typeof headerValue === 'string' ? headerValue : null,
  );
};

export const bindDataToRequestObject = (
  data: RawAuthContext,
  request: Request,
  metadataVersion: number | undefined,
) => {
  request.user = data.user;
  request.apiKey = data.apiKey;
  request.application = data.application;
  request.userWorkspace = data.userWorkspace;
  request.workspace = data.workspace;
  request.workspaceId = data.workspace?.id;
  request.workspaceMetadataVersion = metadataVersion;
  request.activeInternalEntityId =
    data.activeInternalEntityId ??
    extractActiveInternalEntityIdFromRequest(request);
  request.workspaceMemberId = data.workspaceMemberId;
  request.workspaceMember = data.workspaceMember;
  request.userWorkspaceId = data.userWorkspaceId;
  request.authProvider = data.authProvider;
  request.impersonationContext = data.impersonationContext;

  request.locale =
    data.userWorkspace?.locale ??
    (request.headers['x-locale'] as keyof typeof APP_LOCALES) ??
    SOURCE_LOCALE;
};
