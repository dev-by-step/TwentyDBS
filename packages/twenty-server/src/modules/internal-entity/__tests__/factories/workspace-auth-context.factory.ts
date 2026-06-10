import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { buildUserEntity } from 'src/engine/core-modules/user/utils/__tests__/factories/user-entity.factory';
import {
  buildWorkspaceMemberRecord,
  buildWorkspaceRecord,
} from 'src/modules/internal-entity/__tests__/factories/workspace-record.factory';

export const buildWorkspaceAuthContext = ({
  entityId,
  workspaceId,
}: {
  entityId?: string | null;
  workspaceId?: string;
} = {}): WorkspaceAuthContext => {
  const workspace = buildWorkspaceRecord(
    workspaceId ? { id: workspaceId } : undefined,
  );
  const user = buildUserEntity({ entityId: entityId ?? null });
  const workspaceMember = buildWorkspaceMemberRecord();

  return {
    type: 'user',
    workspace: {
      id: workspace.id,
    },
    user,
    userWorkspaceId: workspaceMember.id,
    workspaceMemberId: workspaceMember.id,
    workspaceMember,
  } as unknown as WorkspaceAuthContext;
};
