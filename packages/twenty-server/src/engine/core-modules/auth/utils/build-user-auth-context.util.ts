import { type RawAuthContext } from 'src/engine/core-modules/auth/types/auth-context.type';
import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';

type UserAuthContextInput = {
  workspace: NonNullable<RawAuthContext['workspace']>;
  userWorkspaceId: NonNullable<RawAuthContext['userWorkspaceId']>;
  user: NonNullable<RawAuthContext['user']>;
  activeInternalEntityId?: RawAuthContext['activeInternalEntityId'];
  workspaceMemberId: NonNullable<RawAuthContext['workspaceMemberId']>;
  workspaceMember: NonNullable<RawAuthContext['workspaceMember']>;
  workspaceMetadataVersion?: string;
};

export const buildUserAuthContext = (
  input: UserAuthContextInput,
): UserWorkspaceAuthContext => {
  return {
    type: 'user',
    workspace: input.workspace,
    userWorkspaceId: input.userWorkspaceId,
    user: input.user,
    activeInternalEntityId: input.activeInternalEntityId,
    workspaceMemberId: input.workspaceMemberId,
    workspaceMember: input.workspaceMember,
    workspaceMetadataVersion: input.workspaceMetadataVersion,
  };
};
