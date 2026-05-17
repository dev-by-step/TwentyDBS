import { availableWorkspacesState } from '@/auth/states/availableWorkspacesState';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceMembersState } from '@/auth/states/currentWorkspaceMembersState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { authProvidersState } from '@/client-config/states/authProvidersState';
import { useIsCurrentLocationOnAWorkspace } from '@/domain-manager/hooks/useIsCurrentLocationOnAWorkspace';
import { activeEntityIdState } from '@/entity-filter/states/activeEntityIdState';
import { useLastAuthenticatedWorkspaceDomain } from '@/domain-manager/hooks/useLastAuthenticatedWorkspaceDomain';
import { selectedEntityIdState } from '@/entity-filter/states/selectedEntityIdAtom';
import { useInitializeFormatPreferences } from '@/localization/hooks/useInitializeFormatPreferences';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { workspaceAuthBypassProvidersState } from '@/workspace/states/workspaceAuthBypassProvidersState';
import { useCallback } from 'react';
import { SOURCE_LOCALE, type APP_LOCALES } from 'twenty-shared/translations';
import { type ObjectPermissions } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { type ColorScheme } from 'twenty-ui/input';
import { useApolloClient } from '@apollo/client/react';
import {
  GetCurrentUserDocument,
  type GetCurrentUserQuery,
  type GetCurrentUserQueryVariables,
} from '~/generated-metadata/graphql';
import { getWorkspaceUrl } from '~/utils/getWorkspaceUrl';
import { dynamicActivate } from '~/utils/i18n/dynamicActivate';

export const useLoadCurrentUser = () => {
  const currentUser = useAtomStateValue(currentUserState);
  const setCurrentUser = useSetAtomState(currentUserState);
  const [activeEntityId, setActiveEntityId] = useAtomState(activeEntityIdState);
  const [selectedEntityId, setSelectedEntityId] = useAtomState(
    selectedEntityIdState,
  );
  const setAvailableWorkspaces = useSetAtomState(availableWorkspacesState);
  const setCurrentWorkspaceMember = useSetAtomState(
    currentWorkspaceMemberState,
  );
  const { setLastAuthenticateWorkspaceDomain } =
    useLastAuthenticatedWorkspaceDomain();
  const setCurrentUserWorkspace = useSetAtomState(currentUserWorkspaceState);
  const setCurrentWorkspaceMembers = useSetAtomState(
    currentWorkspaceMembersState,
  );
  const setCurrentWorkspace = useSetAtomState(currentWorkspaceState);
  const { initializeFormatPreferences } = useInitializeFormatPreferences();
  const setWorkspaceAuthBypassProviders = useSetAtomState(
    workspaceAuthBypassProvidersState,
  );
  const authProviders = useAtomStateValue(authProvidersState);

  const { isOnAWorkspace } = useIsCurrentLocationOnAWorkspace();

  const client = useApolloClient();

  const loadCurrentUser = useCallback(async () => {
    const currentUserResult = await client.query<
      GetCurrentUserQuery,
      GetCurrentUserQueryVariables
    >({
      query: GetCurrentUserDocument,
      fetchPolicy: 'network-only',
    });

    if (isDefined(currentUserResult.error)) {
      throw new Error(currentUserResult.error.message);
    }

    const user = currentUserResult.data?.currentUser;

    if (!isDefined(user)) {
      throw new Error('No current user result');
    }

    let workspaceMember = null;

    setCurrentUser(user);

    const currentUserEntityId = user.entityId ?? null;
    const isUserChanged = currentUser?.id !== user.id;
    const hasActiveEntityId =
      isDefined(activeEntityId) && activeEntityId.length > 0;
    const hasSelectedEntityId =
      isDefined(selectedEntityId) && selectedEntityId.length > 0;

    if (isUserChanged) {
      setActiveEntityId(currentUserEntityId);
      setSelectedEntityId(currentUserEntityId);
    } else {
      if (!hasActiveEntityId) {
        setActiveEntityId(
          hasSelectedEntityId ? selectedEntityId : currentUserEntityId,
        );
      }

      if (!hasSelectedEntityId && !hasActiveEntityId) {
        setSelectedEntityId(currentUserEntityId);
      }
    }

    if (isDefined(user.workspaceMembers)) {
      setCurrentWorkspaceMembers(user.workspaceMembers);
    }

    if (isDefined(user.availableWorkspaces)) {
      setAvailableWorkspaces(user.availableWorkspaces);
    }

    if (isDefined(user.currentUserWorkspace)) {
      setCurrentUserWorkspace({
        permissionFlags: user.currentUserWorkspace.permissionFlags ?? [],
        twoFactorAuthenticationMethodSummary:
          user.currentUserWorkspace.twoFactorAuthenticationMethodSummary ?? [],
        objectsPermissions:
          (user.currentUserWorkspace.objectsPermissions as Array<
            ObjectPermissions & { objectMetadataId: string }
          >) ?? [],
      });
    }

    if (isDefined(user.workspaceMember)) {
      workspaceMember = {
        ...user.workspaceMember,
        colorScheme: user.workspaceMember?.colorScheme as ColorScheme,
        locale: user.workspaceMember?.locale ?? SOURCE_LOCALE,
      };

      setCurrentWorkspaceMember(workspaceMember);

      // Initialize unified format preferences state
      initializeFormatPreferences(workspaceMember);
      dynamicActivate(
        (workspaceMember.locale as keyof typeof APP_LOCALES) ?? SOURCE_LOCALE,
      );
    }

    const workspace = isDefined(user.currentWorkspace)
      ? {
          ...user.currentWorkspace,
          workspaceCustomApplication:
            user.currentWorkspace.workspaceCustomApplication ?? null,
        }
      : null;

    setCurrentWorkspace(workspace);

    if (isDefined(workspace)) {
      setWorkspaceAuthBypassProviders({
        google: authProviders.google && workspace.isGoogleAuthBypassEnabled,
        microsoft:
          authProviders.microsoft && workspace.isMicrosoftAuthBypassEnabled,
        password:
          authProviders.password && workspace.isPasswordAuthBypassEnabled,
      });
    }

    if (isDefined(workspace) && isOnAWorkspace) {
      setLastAuthenticateWorkspaceDomain({
        workspaceId: workspace.id,
        workspaceUrl: getWorkspaceUrl(workspace.workspaceUrls),
      });
    }

    return {
      user,
      workspaceMember,
      workspace,
    };
  }, [
    client,
    currentUser?.id,
    activeEntityId,
    selectedEntityId,
    setCurrentUser,
    setActiveEntityId,
    setSelectedEntityId,
    setCurrentWorkspace,
    isOnAWorkspace,
    setCurrentWorkspaceMembers,
    setAvailableWorkspaces,
    setCurrentUserWorkspace,
    setCurrentWorkspaceMember,
    initializeFormatPreferences,
    setLastAuthenticateWorkspaceDomain,
    authProviders,
    setWorkspaceAuthBypassProviders,
  ]);

  return {
    loadCurrentUser,
  };
};
