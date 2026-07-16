import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import {
  type UserWorkspaceAuthContext,
  type WorkspaceAuthContext,
} from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { ENTITY_MANAGER_ROLE_LABEL } from 'src/modules/internal-entity/query-hooks/constants/internal-entity-access.constants';

@Injectable()
export class InternalEntityRoleService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly userRoleService: UserRoleService,
  ) {}

  async isPlatformAdmin(
    authContext: UserWorkspaceAuthContext,
  ): Promise<boolean> {
    if (authContext.user.canAccessFullAdminPanel) {
      return true;
    }

    const persistedUser = await this.userRepository.findOne({
      select: ['id', 'canAccessFullAdminPanel'],
      where: { id: authContext.user.id },
    });

    if (persistedUser?.canAccessFullAdminPanel === true) {
      return true;
    }

    const roles = await this.getUserWorkspaceRoles(authContext);

    return roles.some(
      (role) =>
        role.universalIdentifier === STANDARD_ROLE.admin.universalIdentifier,
    );
  }

  async isEntityManager(
    authContext: UserWorkspaceAuthContext,
  ): Promise<boolean> {
    const roles = await this.getUserWorkspaceRoles(authContext);

    return roles.some(
      (role) =>
        role.universalIdentifier ===
          STANDARD_ROLE.entityManager.universalIdentifier ||
        role.label === ENTITY_MANAGER_ROLE_LABEL,
    );
  }

  async canManageEntityScopedRecords(
    authContext: UserWorkspaceAuthContext,
  ): Promise<boolean> {
    if (await this.isPlatformAdmin(authContext)) {
      return true;
    }

    return this.isEntityManager(authContext);
  }

  isInternalEntitySuperAdmin(authContext: WorkspaceAuthContext): boolean {
    return (
      authContext.type === 'user' &&
      authContext.user.canAccessFullAdminPanel === true
    );
  }

  private async getUserWorkspaceRoles(authContext: UserWorkspaceAuthContext) {
    const rolesByUserWorkspace =
      await this.userRoleService.getRolesByUserWorkspaces({
        userWorkspaceIds: [authContext.userWorkspaceId],
        workspaceId: authContext.workspace.id,
      });

    return rolesByUserWorkspace.get(authContext.userWorkspaceId) ?? [];
  }
}
