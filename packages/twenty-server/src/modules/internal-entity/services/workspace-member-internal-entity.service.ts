import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';
import { In } from 'typeorm';

import { ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { normalizeOptionalEntityId } from 'src/engine/utils/normalize-optional-entity-id.util';

const WORKSPACE_MEMBER_ENTITY_MEMBERSHIP_OBJECT_NAME =
  'workspaceMemberEntityMembership';
const INTERNAL_ENTITY_OBJECT_NAME = 'internalEntity';

export type WorkspaceMemberInternalEntityContext = {
  // Default entity used when no explicit active entity is requested.
  currentEntityId: string | null;
  // Entity currently used for scoped mutations and source tagging.
  activeEntityId: string | null;
  // Entities the workspace member is attached to.
  entityIds: string[];
};

export type WorkspaceMemberManageableEntityAccess = {
  // Entities this user can expose or manage in entity-aware settings.
  manageableEntityIds: string[];
  // Stable default entity for metadata-only visibility and fallback ownership.
  primaryEntityId: string | null;
};

@Injectable()
export class WorkspaceMemberInternalEntityService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly objectMetadataService: ObjectMetadataService,
  ) {}

  async resolveContext({
    workspaceId,
    workspaceMemberId,
    fallbackEntityId,
    requestedActiveEntityId,
  }: {
    workspaceId: string;
    workspaceMemberId?: string | null;
    fallbackEntityId?: string | null;
    requestedActiveEntityId?: string | null;
  }): Promise<WorkspaceMemberInternalEntityContext> {
    if (!isDefined(workspaceMemberId) || workspaceMemberId.length === 0) {
      return this.buildFallbackContext({
        fallbackEntityId,
        requestedActiveEntityId,
      });
    }

    const contexts = await this.resolveContextsByWorkspaceMemberIds({
      workspaceId,
      workspaceMemberIds: [workspaceMemberId],
      fallbackEntityIdByWorkspaceMemberId: new Map([
        [workspaceMemberId, fallbackEntityId ?? null],
      ]),
    });

    const context =
      contexts.get(workspaceMemberId) ??
      this.buildFallbackContext({
        fallbackEntityId,
        requestedActiveEntityId,
      });

    return {
      ...context,
      activeEntityId: this.resolveActiveEntityId({
        entityIds: context.entityIds,
        currentEntityId: context.currentEntityId,
        requestedActiveEntityId,
      }),
    };
  }

  async resolveContextsByWorkspaceMemberIds({
    workspaceId,
    workspaceMemberIds,
    fallbackEntityIdByWorkspaceMemberId,
  }: {
    workspaceId: string;
    workspaceMemberIds: string[];
    fallbackEntityIdByWorkspaceMemberId?: ReadonlyMap<string, string | null>;
  }): Promise<Map<string, WorkspaceMemberInternalEntityContext>> {
    const uniqueWorkspaceMemberIds = [...new Set(workspaceMemberIds)].filter(
      (workspaceMemberId) => workspaceMemberId.length > 0,
    );

    if (uniqueWorkspaceMemberIds.length === 0) {
      return new Map();
    }

    if (!(await this.hasWorkspaceMemberEntityMembershipObject(workspaceId))) {
      return this.buildFallbackContexts(
        uniqueWorkspaceMemberIds,
        fallbackEntityIdByWorkspaceMemberId,
      );
    }

    const memberships =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const membershipRepository =
            await this.globalWorkspaceOrmManager.getRepository<
              Record<string, unknown>
            >(workspaceId, WORKSPACE_MEMBER_ENTITY_MEMBERSHIP_OBJECT_NAME, {
              shouldBypassPermissionChecks: true,
            });

          return membershipRepository.find({
            where: {
              workspaceMemberId: In(uniqueWorkspaceMemberIds),
            },
          });
        },
        buildSystemAuthContext(workspaceId),
      );

    const entityIdsByWorkspaceMemberId = new Map<string, string[]>();

    for (const membership of memberships) {
      const workspaceMemberId = this.extractNonEmptyString(
        membership,
        'workspaceMemberId',
      );
      const internalEntityId = this.normalizeEntityId(
        this.extractNonEmptyString(membership, 'internalEntityId'),
      );

      if (
        !isDefined(workspaceMemberId) ||
        !isDefined(internalEntityId) ||
        !uniqueWorkspaceMemberIds.includes(workspaceMemberId)
      ) {
        continue;
      }

      const entityIds =
        entityIdsByWorkspaceMemberId.get(workspaceMemberId) ?? [];

      if (!entityIds.includes(internalEntityId)) {
        entityIds.push(internalEntityId);
      }

      entityIdsByWorkspaceMemberId.set(workspaceMemberId, entityIds);
    }

    const contexts = new Map<string, WorkspaceMemberInternalEntityContext>();

    for (const workspaceMemberId of uniqueWorkspaceMemberIds) {
      const fallbackEntityId = this.normalizeEntityId(
        fallbackEntityIdByWorkspaceMemberId?.get(workspaceMemberId) ?? null,
      );
      const entityIds =
        entityIdsByWorkspaceMemberId.get(workspaceMemberId) ?? [];

      const currentEntityId = this.resolveCurrentEntityId({
        entityIds,
        fallbackEntityId,
      });

      contexts.set(workspaceMemberId, {
        entityIds:
          entityIds.length > 0
            ? entityIds
            : isDefined(fallbackEntityId)
              ? [fallbackEntityId]
              : [],
        currentEntityId,
        activeEntityId: currentEntityId,
      });
    }

    return contexts;
  }

  async resolveManageableEntityIds({
    workspaceId,
    workspaceMemberId,
    fallbackEntityId,
    canAccessFullAdminPanel,
  }: {
    workspaceId: string;
    workspaceMemberId?: string | null;
    fallbackEntityId?: string | null;
    canAccessFullAdminPanel: boolean;
  }): Promise<string[]> {
    const { manageableEntityIds } = await this.resolveManageableEntityAccess({
      workspaceId,
      workspaceMemberId,
      fallbackEntityId,
      canAccessFullAdminPanel,
    });

    return manageableEntityIds;
  }

  async resolvePrimaryEntityId({
    workspaceId,
    workspaceMemberId,
    fallbackEntityId,
  }: {
    workspaceId: string;
    workspaceMemberId?: string | null;
    fallbackEntityId?: string | null;
  }): Promise<string | null> {
    const { primaryEntityId } = await this.resolveManageableEntityAccess({
      workspaceId,
      workspaceMemberId,
      fallbackEntityId,
      canAccessFullAdminPanel: false,
    });

    return primaryEntityId;
  }

  async resolveManageableEntityAccess({
    workspaceId,
    workspaceMemberId,
    fallbackEntityId,
    canAccessFullAdminPanel,
  }: {
    workspaceId: string;
    workspaceMemberId?: string | null;
    fallbackEntityId?: string | null;
    canAccessFullAdminPanel: boolean;
  }): Promise<WorkspaceMemberManageableEntityAccess> {
    const context = await this.resolveContext({
      workspaceId,
      workspaceMemberId,
      fallbackEntityId,
    });

    if (canAccessFullAdminPanel) {
      const allInternalEntityIds =
        await this.findAllInternalEntityIds(workspaceId);

      if (allInternalEntityIds.length > 0) {
        return {
          manageableEntityIds: allInternalEntityIds,
          primaryEntityId: context.currentEntityId,
        };
      }
    }

    return {
      manageableEntityIds: context.entityIds,
      primaryEntityId: context.currentEntityId,
    };
  }

  private async hasWorkspaceMemberEntityMembershipObject(workspaceId: string) {
    const objectMetadata =
      await this.objectMetadataService.findOneWithinWorkspace(workspaceId, {
        where: {
          nameSingular: WORKSPACE_MEMBER_ENTITY_MEMBERSHIP_OBJECT_NAME,
        },
      });

    return isDefined(objectMetadata);
  }

  private async hasInternalEntityObject(workspaceId: string) {
    const objectMetadata =
      await this.objectMetadataService.findOneWithinWorkspace(workspaceId, {
        where: {
          nameSingular: INTERNAL_ENTITY_OBJECT_NAME,
        },
      });

    return isDefined(objectMetadata);
  }

  private async findAllInternalEntityIds(workspaceId: string) {
    if (!(await this.hasInternalEntityObject(workspaceId))) {
      return [];
    }

    const internalEntityRecords =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const internalEntityRepository =
            await this.globalWorkspaceOrmManager.getRepository<
              Record<string, unknown>
            >(workspaceId, INTERNAL_ENTITY_OBJECT_NAME, {
              shouldBypassPermissionChecks: true,
            });

          return internalEntityRepository.find();
        },
        buildSystemAuthContext(workspaceId),
      );

    return internalEntityRecords
      .map((internalEntityRecord) =>
        this.normalizeEntityId(
          this.extractNonEmptyString(internalEntityRecord, 'id'),
        ),
      )
      .filter(isDefined);
  }

  private buildFallbackContext({
    fallbackEntityId,
    requestedActiveEntityId,
  }: {
    fallbackEntityId?: string | null;
    requestedActiveEntityId?: string | null;
  }): WorkspaceMemberInternalEntityContext {
    const normalizedFallbackEntityId = this.normalizeEntityId(fallbackEntityId);
    const entityIds = isDefined(normalizedFallbackEntityId)
      ? [normalizedFallbackEntityId]
      : [];

    return {
      currentEntityId: normalizedFallbackEntityId,
      activeEntityId: this.resolveActiveEntityId({
        entityIds,
        currentEntityId: normalizedFallbackEntityId,
        requestedActiveEntityId,
      }),
      entityIds,
    };
  }

  private buildFallbackContexts(
    workspaceMemberIds: string[],
    fallbackEntityIdByWorkspaceMemberId?: ReadonlyMap<string, string | null>,
  ) {
    return new Map(
      workspaceMemberIds.map((workspaceMemberId) => [
        workspaceMemberId,
        this.buildFallbackContext({
          fallbackEntityId:
            fallbackEntityIdByWorkspaceMemberId?.get(workspaceMemberId) ?? null,
        }),
      ]),
    );
  }

  private resolveCurrentEntityId({
    entityIds,
    fallbackEntityId,
  }: {
    entityIds: string[];
    fallbackEntityId: string | null;
  }) {
    if (isDefined(fallbackEntityId) && entityIds.includes(fallbackEntityId)) {
      return fallbackEntityId;
    }

    if (entityIds.length > 0) {
      return entityIds[0];
    }

    return fallbackEntityId;
  }

  private resolveActiveEntityId({
    entityIds,
    currentEntityId,
    requestedActiveEntityId,
  }: {
    entityIds: string[];
    currentEntityId: string | null;
    requestedActiveEntityId?: string | null;
  }) {
    const normalizedRequestedActiveEntityId = this.normalizeEntityId(
      requestedActiveEntityId,
    );

    if (
      isDefined(normalizedRequestedActiveEntityId) &&
      entityIds.includes(normalizedRequestedActiveEntityId)
    ) {
      return normalizedRequestedActiveEntityId;
    }

    return currentEntityId;
  }

  private extractNonEmptyString(
    record: Record<string, unknown>,
    fieldName: string,
  ) {
    const value = record[fieldName];

    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private normalizeEntityId(entityId?: string | null) {
    return normalizeOptionalEntityId(entityId);
  }
}
