import { Injectable } from '@nestjs/common';

import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';
import { MEMBER_ROLE_LABEL } from 'src/engine/metadata-modules/permissions/constants/member-role-label.constants';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

// Member et Entity Manager ont `canUpdateAllObjectRecords: false` par
// défaut (comportement standard Twenty). Sans octroi objectPermission
// explicite par objet — et aucun n'existe dans ce fork — les objets non
// système (company, opportunity, person, note, task, calendarEventEntityAudience,
// calendarEventPersonAudience...) deviennent uneditable/non-créables pour tout
// non-admin. Les objets réellement sensibles (internalEntity, *EntityMembership)
// restent protégés indépendamment par InternalEntityAccessPolicyService,
// qui exige explicitement platform admin — ce flag ne les concerne pas.
//
// Le cache Redis des permissions par rôle (clé "rolesPermissions") n'est
// invalidé que via RoleService.updateRole ; un UPDATE SQL direct le laisse
// périmé. On le flush explicitement par workspace affecté après la mise à
// jour, sinon le correctif reste invisible tant que le cache n'expire pas.
@Injectable()
@RegisteredInstanceCommand('2.1.0', 1785000000001)
export class GrantMemberEntityManagerUpdatePermissionFastInstanceCommand
  implements FastInstanceCommand
{
  constructor(private readonly workspaceCacheService: WorkspaceCacheService) {}

  public async up(queryRunner: QueryRunner): Promise<void> {
    const affectedWorkspaceIds = await this.applyGrantAndCollectWorkspaceIds(
      queryRunner,
      true,
    );

    await this.flushRolesPermissionsCache(affectedWorkspaceIds);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const affectedWorkspaceIds = await this.applyGrantAndCollectWorkspaceIds(
      queryRunner,
      false,
    );

    await this.flushRolesPermissionsCache(affectedWorkspaceIds);
  }

  private async applyGrantAndCollectWorkspaceIds(
    queryRunner: QueryRunner,
    grant: boolean,
  ): Promise<string[]> {
    const entityManagerRows: Array<{ workspaceId: string }> =
      await queryRunner.query(
        `UPDATE "core"."role" SET "canUpdateAllObjectRecords" = $1 WHERE "universalIdentifier" = $2 AND "canUpdateAllObjectRecords" = $3 RETURNING "workspaceId"`,
        [grant, STANDARD_ROLE.entityManager.universalIdentifier, !grant],
      );
    const memberRows: Array<{ workspaceId: string }> = await queryRunner.query(
      `UPDATE "core"."role" SET "canUpdateAllObjectRecords" = $1 WHERE "label" = $2 AND "isEditable" = true AND "canUpdateAllObjectRecords" = $3 RETURNING "workspaceId"`,
      [grant, MEMBER_ROLE_LABEL, !grant],
    );

    return [
      ...new Set(
        [...entityManagerRows, ...memberRows].map((row) => row.workspaceId),
      ),
    ];
  }

  private async flushRolesPermissionsCache(
    workspaceIds: string[],
  ): Promise<void> {
    await Promise.all(
      workspaceIds.map((workspaceId) =>
        this.workspaceCacheService.flush(workspaceId, ['rolesPermissions']),
      ),
    );
  }
}
