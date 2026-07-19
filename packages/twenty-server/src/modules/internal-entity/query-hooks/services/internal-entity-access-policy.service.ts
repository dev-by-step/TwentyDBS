import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { msg } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { In, type FindOptionsWhere, type Repository } from 'typeorm';

import {
  CommonQueryRunnerException,
  CommonQueryRunnerExceptionCode,
} from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';
import {
  type CreateManyResolverArgs,
  type CreateOneResolverArgs,
  type DeleteManyResolverArgs,
  type DestroyManyResolverArgs,
  type FindDuplicatesResolverArgs,
  type FindManyResolverArgs,
  type FindOneResolverArgs,
  type GroupByResolverArgs,
  type MergeManyResolverArgs,
  type RestoreManyResolverArgs,
  type UpdateOneResolverArgs,
  type UpdateManyResolverArgs,
} from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import {
  type UserWorkspaceAuthContext,
  type WorkspaceAuthContext,
} from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  PermissionsException,
  PermissionsExceptionCode,
  PermissionsExceptionMessage,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { normalizeOptionalEntityId } from 'src/engine/utils/normalize-optional-entity-id.util';
import {
  ENTITY_CONFIGURATION_OBJECT_NAME_SET,
  ENTITY_SCOPED_CRM_OBJECT_NAME_SET,
  ENTITY_SCOPED_OBJECT_NAME_SET,
  HYBRID_SCOPED_OBJECT_NAME_SET,
  PERSONAL_WORK_OBJECT_NAME_SET,
} from 'src/modules/internal-entity/query-hooks/constants/internal-entity-access.constants';
import { extractRelationTargetId } from 'src/modules/internal-entity/query-hooks/utils/extract-relation-target-id.util';
import { InternalEntityScopeCacheService } from 'src/modules/internal-entity/query-hooks/services/internal-entity-scope-cache.service';
import { InternalEntityAuditLoggerService } from 'src/modules/internal-entity/services/internal-entity-audit-logger.service';
import { InternalEntityRoleService } from 'src/modules/internal-entity/services/internal-entity-role.service';
import { WorkspaceMemberInternalEntityService } from 'src/modules/internal-entity/services/workspace-member-internal-entity.service';

type RecordFilter = Record<string, unknown>;

type BulkMutationArgs =
  | DeleteManyResolverArgs<RecordFilter>
  | DestroyManyResolverArgs<RecordFilter>
  | RestoreManyResolverArgs<RecordFilter>
  | UpdateManyResolverArgs<Record<string, unknown>, RecordFilter>;

type SingleMutationMethod =
  | 'deleteOne'
  | 'destroyOne'
  | 'restoreOne'
  | 'updateOne';

type RecordSummary = {
  createdByWorkspaceMemberId: string | null;
  entityIds: string[];
  relatedWorkspaceMemberIds: string[];
};

type ScopeMode = 'read' | 'mutation';

type EntityScopeFieldRequirement = {
  fieldName: string;
  requiresJunctionTargetFieldId: boolean;
};

type PermissionDeniedAuditMetadata = {
  authContext?: UserWorkspaceAuthContext;
  objectName?: string;
  recordId?: string;
  reason?: string;
};

type CachedAvailability = {
  isAvailable: boolean;
  expiresAt: number | null;
};

// Negative availability results must expire: `init-internal-entities` can run
// against a live server (e.g. `dokku enter` in production) and entity scoping
// has to become effective without a restart. Positive results are cached for
// the process lifetime since the fields never disappear once created.
const NEGATIVE_AVAILABILITY_RECHECK_DELAY_MS = 30_000;
const NEVER_MATCH_RECORD_ID = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class InternalEntityAccessPolicyService {
  private readonly entityScopeFieldAvailabilityByKey = new Map<
    string,
    CachedAvailability
  >();
  private readonly entityScopeBootstrapAvailabilityByWorkspaceId = new Map<
    string,
    CachedAvailability
  >();

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly workspaceMemberInternalEntityService: WorkspaceMemberInternalEntityService,
    private readonly objectMetadataService: ObjectMetadataService,
    private readonly internalEntityScopeCacheService: InternalEntityScopeCacheService,
    private readonly internalEntityAuditLoggerService: InternalEntityAuditLoggerService,
    private readonly internalEntityRoleService: InternalEntityRoleService,
  ) {}

  async scopeFindManyPayload(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: FindManyResolverArgs<RecordFilter>,
  ): Promise<FindManyResolverArgs<RecordFilter>> {
    const sanitizedPayload = await this.sanitizeEntityScopeFilterFromPayload(
      authContext,
      objectName,
      payload,
    );
    const scopedFilter =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        () =>
          this.buildScopedFilter(
            authContext,
            objectName,
            'read',
            sanitizedPayload.filter,
          ),
        authContext,
      );
    if (!isDefined(scopedFilter)) {
      return sanitizedPayload;
    }

    return {
      ...sanitizedPayload,
      filter: scopedFilter,
    };
  }

  async scopeFindOnePayload(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: FindOneResolverArgs<RecordFilter>,
  ): Promise<FindOneResolverArgs<RecordFilter>> {
    const sanitizedPayload = await this.sanitizeEntityScopeFilterFromPayload(
      authContext,
      objectName,
      payload,
    );
    const scopedFilter =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        () =>
          this.buildScopedFilter(
            authContext,
            objectName,
            'read',
            sanitizedPayload.filter,
          ),
        authContext,
      );
    if (!isDefined(scopedFilter)) {
      return sanitizedPayload;
    }

    return {
      ...sanitizedPayload,
      filter: scopedFilter,
    };
  }

  async scopeGroupByPayload(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: GroupByResolverArgs<RecordFilter>,
  ): Promise<GroupByResolverArgs<RecordFilter>> {
    const sanitizedPayload = await this.sanitizeEntityScopeFilterFromPayload(
      authContext,
      objectName,
      payload,
    );
    const scopedFilter =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        () =>
          this.buildScopedFilter(
            authContext,
            objectName,
            'read',
            sanitizedPayload.filter,
          ),
        authContext,
      );
    if (!isDefined(scopedFilter)) {
      return sanitizedPayload;
    }

    return {
      ...sanitizedPayload,
      filter: scopedFilter,
    };
  }

  private async sanitizeEntityScopeFilterFromPayload<
    T extends { filter?: RecordFilter },
  >(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: T,
  ): Promise<T> {
    if (
      !isUserAuthContext(authContext) ||
      !ENTITY_SCOPED_OBJECT_NAME_SET.has(objectName) ||
      !isDefined(payload.filter)
    ) {
      return payload;
    }

    const canApplyScopeFilter = await this.canApplyEntityScopeFilter(
      authContext.workspace.id,
      objectName,
    );

    if (canApplyScopeFilter) {
      return payload;
    }

    return {
      ...payload,
      filter: this.removeEntityScopeFilterKeys(payload.filter),
    };
  }

  private removeEntityScopeFilterKeys(filter: RecordFilter): RecordFilter {
    const sanitizedEntries = Object.entries(filter)
      .map(([key, value]) => {
        if (key === 'internalEntityId' || key === 'internalEntitiesId') {
          return undefined;
        }

        if (key === 'and' || key === 'or') {
          if (!Array.isArray(value)) {
            return [key, value] as const;
          }

          const sanitizedChildren = value
            .map((child) =>
              typeof child === 'object' && child !== null
                ? this.removeEntityScopeFilterKeys(child as RecordFilter)
                : child,
            )
            .filter(
              (child) =>
                typeof child !== 'object' ||
                child === null ||
                Object.keys(child as RecordFilter).length > 0,
            );

          if (sanitizedChildren.length === 0) {
            return undefined;
          }

          return [key, sanitizedChildren] as const;
        }

        if (
          key === 'not' &&
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value)
        ) {
          const sanitizedChild = this.removeEntityScopeFilterKeys(
            value as RecordFilter,
          );

          if (Object.keys(sanitizedChild).length === 0) {
            return undefined;
          }

          return [key, sanitizedChild] as const;
        }

        return [key, value] as const;
      })
      .filter(isDefined);

    return Object.fromEntries(sanitizedEntries);
  }

  async validateCreatePayload(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: CreateOneResolverArgs<Record<string, unknown>>,
  ): Promise<CreateOneResolverArgs<Record<string, unknown>>> {
    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      () => this.assertCanCreate(authContext, objectName, payload.data),
      authContext,
    );

    if (isUserAuthContext(authContext) && objectName === 'internalEntity') {
      return {
        ...payload,
        data: this.normalizeInternalEntityDataOrThrow({
          authContext,
          payloadData: payload.data,
          nameIsRequired: true,
        }),
      };
    }

    return payload;
  }

  async validateCreateManyPayload(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: CreateManyResolverArgs<Record<string, unknown>>,
  ): Promise<CreateManyResolverArgs<Record<string, unknown>>> {
    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      for (const data of payload.data) {
        await this.assertCanCreate(authContext, objectName, data);
      }
    }, authContext);

    if (isUserAuthContext(authContext) && objectName === 'internalEntity') {
      return {
        ...payload,
        data: payload.data.map((data) =>
          this.normalizeInternalEntityDataOrThrow({
            authContext,
            payloadData: data,
            nameIsRequired: true,
          }),
        ),
      };
    }

    return payload;
  }

  async validateUpdatePayload(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: UpdateOneResolverArgs<Record<string, unknown>>,
  ): Promise<UpdateOneResolverArgs<Record<string, unknown>>> {
    if (!isUserAuthContext(authContext) || objectName !== 'internalEntity') {
      return payload;
    }

    return {
      ...payload,
      data: this.normalizeInternalEntityDataOrThrow({
        authContext,
        payloadData: payload.data,
        nameIsRequired: false,
      }),
    };
  }

  async scopeBulkMutationPayload<T extends BulkMutationArgs>(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: T,
  ): Promise<T> {
    if (!isUserAuthContext(authContext)) {
      return payload;
    }

    if (objectName === 'internalEntity') {
      if (!(await this.internalEntityRoleService.isInternalEntitySuperAdmin(authContext))) {
        this.throwPermissionDenied(
          msg`Only superadmins can modify internal entity settings.`,
          {
            authContext,
            objectName,
            reason: 'not-internal-entity-super-admin',
          },
        );
      }
    } else if (objectName === 'workspaceMemberEntityMembership') {
      if (!(await this.internalEntityRoleService.isPlatformAdmin(authContext))) {
        this.throwPermissionDenied(
          msg`Bulk updates on workspace member entity assignments are reserved to platform administrators.`,
          {
            authContext,
            objectName,
            reason: 'not-platform-admin',
          },
        );
      }
    } else if (ENTITY_CONFIGURATION_OBJECT_NAME_SET.has(objectName)) {
      if (!(await this.internalEntityRoleService.canManageEntityScopedRecords(authContext))) {
        this.throwPermissionDenied(
          msg`Bulk updates on entity assignments are reserved to entity managers and platform administrators.`,
          {
            authContext,
            objectName,
            reason: 'cannot-manage-entity-scoped-records',
          },
        );
      }
    }

    if (
      ENTITY_SCOPED_CRM_OBJECT_NAME_SET.has(objectName) &&
      !(await this.internalEntityRoleService.canManageEntityScopedRecords(authContext))
    ) {
      this.throwPermissionDenied(
        msg`Bulk updates are reserved to entity managers and platform administrators.`,
        {
          authContext,
          objectName,
          reason: 'bulk-update-not-entity-manager',
        },
      );
    }

    if (PERSONAL_WORK_OBJECT_NAME_SET.has(objectName)) {
      this.throwPermissionDenied(
        msg`Bulk updates are not allowed on personal work records.`,
        {
          authContext,
          objectName,
          reason: 'bulk-update-on-personal-work',
        },
      );
    }

    if (HYBRID_SCOPED_OBJECT_NAME_SET.has(objectName)) {
      this.throwPermissionDenied(
        msg`Bulk updates are not allowed on scoped timeline records.`,
        {
          authContext,
          objectName,
          reason: 'bulk-update-on-hybrid-scoped',
        },
      );
    }

    const scopedFilter = await this.buildScopedFilter(
      authContext,
      objectName,
      'mutation',
      payload.filter,
    );

    if (!isDefined(scopedFilter)) {
      return payload;
    }

    const scopedPayload = {
      ...payload,
      filter: scopedFilter,
    };

    if (
      objectName !== 'internalEntity' ||
      !('data' in scopedPayload) ||
      !isUserAuthContext(authContext)
    ) {
      return scopedPayload;
    }

    return {
      ...scopedPayload,
      data: this.normalizeInternalEntityDataOrThrow({
        authContext,
        payloadData: scopedPayload.data,
        nameIsRequired: false,
      }),
    };
  }

  async validateFindDuplicatesPayload(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: FindDuplicatesResolverArgs<Record<string, unknown>>,
  ): Promise<FindDuplicatesResolverArgs<Record<string, unknown>>> {
    if (!isUserAuthContext(authContext)) {
      return payload;
    }

    if (!ENTITY_SCOPED_OBJECT_NAME_SET.has(objectName)) {
      return payload;
    }

    if (objectName === 'internalEntity') {
      if (await this.internalEntityRoleService.isInternalEntitySuperAdmin(authContext)) {
        return payload;
      }

      this.throwPermissionDenied(
        msg`Duplicate detection on internal entities is reserved to superadmins.`,
        {
          authContext,
          objectName,
          reason: 'duplicate-detection-not-super-admin',
        },
      );
    }

    if (!(await this.internalEntityRoleService.canManageEntityScopedRecords(authContext))) {
      this.throwPermissionDenied(
        msg`Duplicate detection on entity-scoped records is reserved to entity managers and platform administrators.`,
        {
          authContext,
          objectName,
          reason: 'duplicate-detection-not-manager',
        },
      );
    }

    const recordIds = payload.ids ?? [];

    if (recordIds.length === 0) {
      return payload;
    }

    const activeEntityId = await this.requireActiveEntityId(authContext);
    const recordSummaries =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        () =>
          Promise.all(
            recordIds.map((recordId) =>
              this.resolveRecordSummary({
                workspaceId: authContext.workspace.id,
                objectName,
                recordId,
              }),
            ),
          ),
        authContext,
      );

    if (
      recordSummaries.some(
        (recordSummary) =>
          recordSummary.entityIds.length === 0 ||
          !recordSummary.entityIds.includes(activeEntityId),
      )
    ) {
      this.throwPermissionDenied(
        msg`You can only detect duplicates on records attached to your entity.`,
        {
          authContext,
          objectName,
          reason: 'duplicate-detection-record-out-of-scope',
        },
      );
    }

    return payload;
  }

  async validateMergeManyPayload(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: MergeManyResolverArgs,
  ): Promise<MergeManyResolverArgs> {
    if (!isUserAuthContext(authContext)) {
      return payload;
    }

    if (!ENTITY_SCOPED_OBJECT_NAME_SET.has(objectName)) {
      return payload;
    }

    if (!ENTITY_SCOPED_CRM_OBJECT_NAME_SET.has(objectName)) {
      this.throwPermissionDenied(
        msg`Only entity-scoped CRM records can be merged.`,
        {
          authContext,
          objectName,
          reason: 'merge-not-crm-object',
        },
      );
    }

    if (!(await this.internalEntityRoleService.canManageEntityScopedRecords(authContext))) {
      this.throwPermissionDenied(
        msg`Only entity managers and platform administrators can merge entity records.`,
        {
          authContext,
          objectName,
          reason: 'merge-not-manager',
        },
      );
    }

    const activeEntityId = await this.requireActiveEntityId(authContext);
    const recordSummaries =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        () =>
          Promise.all(
            payload.ids.map((recordId) =>
              this.resolveRecordSummary({
                workspaceId: authContext.workspace.id,
                objectName,
                recordId,
              }),
            ),
          ),
        authContext,
      );

    if (
      recordSummaries.some(
        (recordSummary) =>
          recordSummary.entityIds.length === 0 ||
          !recordSummary.entityIds.includes(activeEntityId),
      )
    ) {
      this.throwPermissionDenied(
        msg`You can only merge records attached to your entity.`,
        {
          authContext,
          objectName,
          reason: 'merge-record-out-of-scope',
        },
      );
    }

    return payload;
  }

  async assertSingleMutationAllowed(
    authContext: WorkspaceAuthContext,
    objectName: string,
    recordId: string,
    method: SingleMutationMethod,
  ): Promise<void> {
    if (!isUserAuthContext(authContext)) {
      return;
    }

    if (
      objectName === 'internalEntity' &&
      (await this.internalEntityRoleService.isInternalEntitySuperAdmin(authContext))
    ) {
      return;
    }

    if (
      (objectName === 'companyEntityMembership' ||
        objectName === 'personEntityMembership' ||
        objectName === 'workspaceMemberEntityMembership') &&
      (await this.internalEntityRoleService.isPlatformAdmin(authContext))
    ) {
      return;
    }

    const recordSummary =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        () =>
          this.resolveRecordSummary({
            workspaceId: authContext.workspace.id,
            objectName,
            recordId,
          }),
        authContext,
      );

    if (PERSONAL_WORK_OBJECT_NAME_SET.has(objectName)) {
      const currentWorkspaceMemberId =
        this.requireCurrentWorkspaceMemberId(authContext);

      if (
        recordSummary.createdByWorkspaceMemberId === currentWorkspaceMemberId
      ) {
        return;
      }

      if (
        objectName === 'task' &&
        method === 'updateOne' &&
        recordSummary.relatedWorkspaceMemberIds.includes(
          currentWorkspaceMemberId,
        )
      ) {
        return;
      }

      this.throwPermissionDenied(
        msg`You can only modify your own personal work records.`,
        {
          authContext,
          objectName,
          recordId,
          reason: 'personal-work-record-not-owner',
        },
      );
    }

    if (HYBRID_SCOPED_OBJECT_NAME_SET.has(objectName)) {
      this.throwPermissionDenied(
        msg`Scoped timeline records cannot be modified manually.`,
        {
          authContext,
          objectName,
          recordId,
          reason: 'hybrid-scoped-record-mutation',
        },
      );
    }

    const activeEntityId = await this.requireActiveEntityId(authContext);
    // Entity managers and platform administrators are meant to bypass the
    // active-entity match on CRM objects entirely (that's the whole point of
    // `canManageEntityScopedRecords`) — so this check must be evaluated
    // before the unconditional entity-match throw below, not after it, or a
    // privileged user's cross-entity mutation would be denied before ever
    // reaching the bypass.
    const canBypassEntityMatchForCrmObject =
      ENTITY_SCOPED_CRM_OBJECT_NAME_SET.has(objectName) &&
      (await this.internalEntityRoleService.canManageEntityScopedRecords(authContext));

    if (
      !canBypassEntityMatchForCrmObject &&
      recordSummary.entityIds.length > 0 &&
      !recordSummary.entityIds.includes(activeEntityId)
    ) {
      this.throwPermissionDenied(
        msg`You can only mutate records attached to your entity.`,
        {
          authContext,
          objectName,
          recordId,
          reason: 'single-mutation-record-out-of-scope',
        },
      );
    }

    if (objectName === 'internalEntity') {
      this.throwPermissionDenied(
        msg`Only superadmins can create, update, restore, delete, or destroy internal entities.`,
        {
          authContext,
          objectName,
          recordId,
          reason: 'internal-entity-not-super-admin',
        },
      );
    }

    if (
      objectName === 'companyEntityMembership' ||
      objectName === 'personEntityMembership' ||
      objectName === 'workspaceMemberEntityMembership'
    ) {
      this.throwPermissionDenied(
        msg`Only platform administrators can manage entity assignments.`,
        {
          authContext,
          objectName,
          recordId,
          reason: 'membership-management-not-platform-admin',
        },
      );
    }

    if (ENTITY_SCOPED_CRM_OBJECT_NAME_SET.has(objectName)) {
      if (canBypassEntityMatchForCrmObject) {
        return;
      }

      if (
        isDefined(recordSummary.createdByWorkspaceMemberId) &&
        recordSummary.createdByWorkspaceMemberId ===
          authContext.workspaceMemberId
      ) {
        return;
      }

      this.throwPermissionDenied(
        msg`You can only modify records that you created, unless you are an entity manager or a platform administrator.`,
        {
          authContext,
          objectName,
          recordId,
          reason: 'crm-record-not-owner-nor-manager',
        },
      );
    }
  }

  private async assertCanCreate(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payloadData?: Record<string, unknown>,
  ): Promise<void> {
    if (!isUserAuthContext(authContext)) {
      return;
    }

    if (PERSONAL_WORK_OBJECT_NAME_SET.has(objectName)) {
      await this.assertCanCreatePersonalObject(
        authContext,
        objectName,
        payloadData,
      );

      return;
    }

    if (HYBRID_SCOPED_OBJECT_NAME_SET.has(objectName)) {
      this.throwPermissionDenied(
        msg`Scoped timeline records cannot be created manually.`,
        {
          authContext,
          objectName,
          reason: 'create-hybrid-scoped-record',
        },
      );
    }

    if (!ENTITY_CONFIGURATION_OBJECT_NAME_SET.has(objectName)) {
      return;
    }

    if (objectName === 'internalEntity') {
      if (await this.internalEntityRoleService.isInternalEntitySuperAdmin(authContext)) {
        return;
      }

      this.throwPermissionDenied(
        msg`Only superadmins can create internal entities.`,
        {
          authContext,
          objectName,
          reason: 'create-internal-entity-not-super-admin',
        },
      );
    }

    if (
      objectName === 'companyEntityMembership' ||
      objectName === 'personEntityMembership' ||
      objectName === 'workspaceMemberEntityMembership'
    ) {
      if (await this.internalEntityRoleService.isPlatformAdmin(authContext)) {
        return;
      }

      this.throwPermissionDenied(
        msg`Only platform administrators can manage entity assignments.`,
        {
          authContext,
          objectName,
          reason: 'create-membership-not-platform-admin',
        },
      );
    }

    if (!(await this.internalEntityRoleService.canManageEntityScopedRecords(authContext))) {
      this.throwPermissionDenied(
        msg`Only entity managers and platform administrators can manage entity assignments.`,
        {
          authContext,
          objectName,
          reason: 'create-entity-config-not-manager',
        },
      );
    }

    await this.assertMembershipCreateTargetsCurrentEntity(
      authContext,
      objectName,
      payloadData,
    );
  }

  private async buildScopedFilter(
    authContext: WorkspaceAuthContext,
    objectName: string,
    scopeMode: ScopeMode,
    filter?: RecordFilter,
  ): Promise<RecordFilter | undefined> {
    if (!isUserAuthContext(authContext)) {
      return filter;
    }

    const scopeFilter = ENTITY_SCOPED_OBJECT_NAME_SET.has(objectName)
      ? await this.getEntityScopedObjectFilter(
          authContext,
          objectName,
          scopeMode,
        )
      : HYBRID_SCOPED_OBJECT_NAME_SET.has(objectName)
        ? await this.getHybridScopeFilter(authContext, objectName)
        : PERSONAL_WORK_OBJECT_NAME_SET.has(objectName)
          ? await this.getPersonalScopeFilter(authContext, objectName)
          : undefined;

    if (!isDefined(scopeFilter)) {
      return filter;
    }

    if (!isDefined(filter) || Object.keys(filter).length === 0) {
      return scopeFilter;
    }

    return {
      and: [filter, scopeFilter],
    };
  }

  private async getEntityScopedObjectFilter(
    authContext: UserWorkspaceAuthContext,
    objectName: string,
    scopeMode: ScopeMode,
  ): Promise<RecordFilter | undefined> {
    if (
      scopeMode === 'read' &&
      ENTITY_CONFIGURATION_OBJECT_NAME_SET.has(objectName) &&
      (await this.internalEntityRoleService.isPlatformAdmin(authContext))
    ) {
      return undefined;
    }

    const canApplyScopeFilter = await this.canApplyEntityScopeFilter(
      authContext.workspace.id,
      objectName,
    );

    if (!canApplyScopeFilter) {
      return undefined;
    }

    // La portée de lecture est TOUJOURS dérivée des adhésions résolues côté
    // serveur — jamais de ce que le client déclare. L'en-tête
    // `ACTIVE_INTERNAL_ENTITY_ID_HEADER_NAME` ne peut que RESTREINDRE la portée
    // à une de ses entités, jamais l'élargir : `resolveContext` ne retient
    // l'entité demandée que si elle figure dans `entityIds` (adhésions réelles).
    //
    // Vue Groupe (aucune entité active demandée) = toutes les entités du membre,
    // et non plus « aucun filtre ». Auparavant ce cas retournait `undefined`,
    // donc une requête omettant simplement l'en-tête voyait l'intégralité du
    // workspace.
    if (scopeMode === 'read' && !this.hasRequestedActiveEntity(authContext)) {
      const { entityIds } = await this.resolveEntityContext(authContext);

      return this.getEntityScopeFilter(objectName, entityIds);
    }

    return this.getEntityScopeFilter(objectName, [
      await this.requireActiveEntityId(authContext),
    ]);
  }

  private async canApplyEntityScopeFilter(
    workspaceId: string,
    objectName: string,
  ): Promise<boolean> {
    const isBootstrapReady =
      await this.isEntityScopeBootstrapAvailable(workspaceId);

    if (!isBootstrapReady) {
      return false;
    }

    return this.isEntityScopeFieldAvailable(workspaceId, objectName);
  }

  private async isEntityScopeBootstrapAvailable(
    workspaceId: string,
  ): Promise<boolean> {
    const cached = this.readCachedAvailability(
      this.entityScopeBootstrapAvailabilityByWorkspaceId,
      workspaceId,
    );

    if (isDefined(cached)) {
      return cached;
    }

    const requiredObjectNames = [
      'company',
      'person',
      'opportunity',
      'companyEntityMembership',
      'personEntityMembership',
    ];

    for (const objectName of requiredObjectNames) {
      const isObjectReady = await this.isEntityScopeFieldAvailable(
        workspaceId,
        objectName,
      );

      if (!isObjectReady) {
        this.writeCachedAvailability(
          this.entityScopeBootstrapAvailabilityByWorkspaceId,
          workspaceId,
          false,
        );

        return false;
      }
    }

    this.writeCachedAvailability(
      this.entityScopeBootstrapAvailabilityByWorkspaceId,
      workspaceId,
      true,
    );

    return true;
  }

  private async isEntityScopeFieldAvailable(
    workspaceId: string,
    objectName: string,
  ): Promise<boolean> {
    const cacheKey = `${workspaceId}::${objectName}`;
    const cached = this.readCachedAvailability(
      this.entityScopeFieldAvailabilityByKey,
      cacheKey,
    );

    if (isDefined(cached)) {
      return cached;
    }

    const requirement = this.getEntityScopeFieldRequirement(objectName);

    if (!isDefined(requirement)) {
      this.writeCachedAvailability(
        this.entityScopeFieldAvailabilityByKey,
        cacheKey,
        true,
      );

      return true;
    }

    const objectMetadata = await this.objectMetadataService
      .findOneWithinWorkspace(workspaceId, {
        where: { nameSingular: objectName },
      })
      .catch(() => null);

    const field = objectMetadata?.fields?.find(
      (objectField) => objectField.name === requirement.fieldName,
    );

    // `filterFieldName` (e.g. "internalEntityId", "internalEntitiesId") is a
    // join-column / filter-input key computed at the GraphQL schema layer
    // from the relation field — it is never a discrete, independently
    // listed entry in objectMetadata.fields (neither for the MANY_TO_ONE
    // join column nor for the ONE_TO_MANY virtual filter key). Looking it up
    // as if it were its own field always failed, which made
    // isEntityScopeBootstrapAvailable() permanently false for the whole
    // workspace and silently disabled read-side entity scoping for every
    // object. The relation `field` existing (with junctionTargetFieldId set,
    // for the junction/ONE_TO_MANY case) is itself the complete availability
    // signal — nothing else needs to be looked up.
    const isAvailable = requirement.requiresJunctionTargetFieldId
      ? isDefined(field) &&
        typeof (field.settings as { junctionTargetFieldId?: unknown })
          ?.junctionTargetFieldId === 'string'
      : isDefined(field);

    this.writeCachedAvailability(
      this.entityScopeFieldAvailabilityByKey,
      cacheKey,
      isAvailable,
    );

    return isAvailable;
  }

  private readCachedAvailability(
    cache: Map<string, CachedAvailability>,
    key: string,
  ): boolean | undefined {
    const cached = cache.get(key);

    if (!isDefined(cached)) {
      return undefined;
    }

    if (cached.expiresAt !== null && cached.expiresAt <= Date.now()) {
      cache.delete(key);

      return undefined;
    }

    return cached.isAvailable;
  }

  private writeCachedAvailability(
    cache: Map<string, CachedAvailability>,
    key: string,
    isAvailable: boolean,
  ): void {
    cache.set(key, {
      isAvailable,
      expiresAt: isAvailable
        ? null
        : Date.now() + NEGATIVE_AVAILABILITY_RECHECK_DELAY_MS,
    });
  }

  private getEntityScopeFieldRequirement(
    objectName: string,
  ): EntityScopeFieldRequirement | undefined {
    switch (objectName) {
      case 'company':
      case 'person':
        return {
          fieldName: 'internalEntities',
          requiresJunctionTargetFieldId: true,
        };
      case 'companyEntityMembership':
      case 'opportunity':
      case 'personEntityMembership':
        return {
          fieldName: 'internalEntity',
          requiresJunctionTargetFieldId: false,
        };
      case 'internalEntity':
        return undefined;
      default:
        return undefined;
    }
  }

  private hasRequestedActiveEntity(
    authContext: UserWorkspaceAuthContext,
  ): boolean {
    return (
      isDefined(authContext.activeInternalEntityId) &&
      authContext.activeInternalEntityId.length > 0
    );
  }

  private getEntityScopeFilter(
    objectName: string,
    entityIds: string[],
  ): RecordFilter {
    switch (objectName) {
      case 'company':
      case 'person':
        return { internalEntitiesId: { in: entityIds } };
      case 'companyEntityMembership':
      case 'opportunity':
      case 'personEntityMembership':
        return { internalEntityId: { in: entityIds } };
      case 'internalEntity':
        return { id: { in: entityIds } };
      default:
        return {};
    }
  }

  private async getPersonalScopeFilter(
    authContext: UserWorkspaceAuthContext,
    objectName: string,
  ): Promise<RecordFilter | undefined> {
    const currentWorkspaceMemberId =
      this.requireCurrentWorkspaceMemberId(authContext);

    switch (objectName) {
      case 'note':
        return this.buildCreatedByWorkspaceMemberFilter(
          currentWorkspaceMemberId,
        );
      case 'task':
        return {
          or: [
            this.buildCreatedByWorkspaceMemberFilter(currentWorkspaceMemberId),
            { assigneeId: { eq: currentWorkspaceMemberId } },
          ],
        };
      case 'attachment':
        return this.buildCreatedByWorkspaceMemberFilter(
          currentWorkspaceMemberId,
        );
      case 'noteTarget':
        return this.buildIdsScopeFilter(
          'noteId',
          await this.getReadablePersonalNoteIds(
            authContext,
            currentWorkspaceMemberId,
          ),
        );
      case 'taskTarget':
        return this.buildIdsScopeFilter(
          'taskId',
          await this.getReadablePersonalTaskIds(
            authContext,
            currentWorkspaceMemberId,
          ),
        );
      default:
        return undefined;
    }
  }

  private async getHybridScopeFilter(
    authContext: UserWorkspaceAuthContext,
    objectName: string,
  ): Promise<RecordFilter | undefined> {
    if (objectName !== 'timelineActivity') {
      return undefined;
    }

    const currentWorkspaceMemberId =
      this.requireCurrentWorkspaceMemberId(authContext);
    const accessibleEntityIds =
      await this.requireAccessibleEntityIds(authContext);
    const [
      readableNoteIds,
      readableTaskIds,
      readableCompanyIds,
      readablePersonIds,
      readableOpportunityIds,
    ] = await Promise.all([
      this.getReadablePersonalNoteIds(authContext, currentWorkspaceMemberId),
      this.getReadablePersonalTaskIds(authContext, currentWorkspaceMemberId),
      this.getReadableEntityScopedRecordIds(
        authContext,
        'company',
        accessibleEntityIds,
      ),
      this.getReadableEntityScopedRecordIds(
        authContext,
        'person',
        accessibleEntityIds,
      ),
      this.getReadableEntityScopedRecordIds(
        authContext,
        'opportunity',
        accessibleEntityIds,
      ),
    ]);
    const scopeBranches = [
      { workspaceMemberId: { eq: currentWorkspaceMemberId } },
      this.buildOptionalIdsScopeFilter('targetNoteId', readableNoteIds),
      this.buildOptionalIdsScopeFilter('targetTaskId', readableTaskIds),
      this.buildOptionalIdsScopeFilter('targetCompanyId', readableCompanyIds),
      this.buildOptionalIdsScopeFilter('targetPersonId', readablePersonIds),
      this.buildOptionalIdsScopeFilter(
        'targetOpportunityId',
        readableOpportunityIds,
      ),
    ].filter(isDefined);

    return {
      or: scopeBranches,
    };
  }

  private async getReadablePersonalNoteIds(
    authContext: UserWorkspaceAuthContext,
    workspaceMemberId: string,
  ): Promise<string[]> {
    const cacheKey = {
      workspaceId: authContext.workspace.id,
      workspaceMemberId,
      entityIds: [],
      objectName: 'readableNoteIds',
    };
    const cached =
      this.internalEntityScopeCacheService.getReadableIds(cacheKey);

    if (isDefined(cached)) {
      return cached;
    }

    const noteRepository = await this.globalWorkspaceOrmManager.getRepository<
      Record<string, unknown>
    >(authContext.workspace.id, 'note', { shouldBypassPermissionChecks: true });
    const createdByFilter =
      this.buildCreatedByWorkspaceMemberWhere(workspaceMemberId);
    const notes = await noteRepository.find({
      where: createdByFilter,
    });
    const ids = this.extractRecordIds(notes);

    this.internalEntityScopeCacheService.setReadableIds(cacheKey, ids);

    return ids;
  }

  private async getReadablePersonalTaskIds(
    authContext: UserWorkspaceAuthContext,
    workspaceMemberId: string,
  ): Promise<string[]> {
    const cacheKey = {
      workspaceId: authContext.workspace.id,
      workspaceMemberId,
      entityIds: [],
      objectName: 'readableTaskIds',
    };
    const cached =
      this.internalEntityScopeCacheService.getReadableIds(cacheKey);

    if (isDefined(cached)) {
      return cached;
    }

    const taskRepository = await this.globalWorkspaceOrmManager.getRepository<
      Record<string, unknown>
    >(authContext.workspace.id, 'task', { shouldBypassPermissionChecks: true });
    const createdByFilter =
      this.buildCreatedByWorkspaceMemberWhere(workspaceMemberId);
    const assigneeFilter = {
      assigneeId: workspaceMemberId,
    } as FindOptionsWhere<Record<string, unknown>>;
    const tasks = await taskRepository.find({
      where: [createdByFilter, assigneeFilter],
    });
    const ids = this.extractRecordIds(tasks);

    this.internalEntityScopeCacheService.setReadableIds(cacheKey, ids);

    return ids;
  }

  private async getReadableEntityScopedRecordIds(
    authContext: UserWorkspaceAuthContext,
    objectName: 'company' | 'opportunity' | 'person',
    entityIds: string[],
  ): Promise<string[]> {
    if (entityIds.length === 0) {
      return [];
    }

    const cacheKey = {
      workspaceId: authContext.workspace.id,
      workspaceMemberId: authContext.workspaceMemberId,
      entityIds,
      objectName: `readable${this.capitalize(objectName)}Ids`,
    };
    const cached =
      this.internalEntityScopeCacheService.getReadableIds(cacheKey);

    if (isDefined(cached)) {
      return cached;
    }

    let ids: string[];

    if (objectName === 'opportunity') {
      const opportunityRepository =
        await this.globalWorkspaceOrmManager.getRepository<
          Record<string, unknown>
        >(authContext.workspace.id, 'opportunity', {
          shouldBypassPermissionChecks: true,
        });
      const opportunities = await opportunityRepository.find({
        where: { internalEntityId: In(entityIds) },
      });

      ids = this.extractRecordIds(opportunities);
    } else {
      const membershipObjectName =
        objectName === 'company'
          ? 'companyEntityMembership'
          : 'personEntityMembership';
      const sourceFieldName =
        objectName === 'company' ? 'companyId' : 'personId';
      const membershipRepository =
        await this.globalWorkspaceOrmManager.getRepository<
          Record<string, unknown>
        >(authContext.workspace.id, membershipObjectName, {
          shouldBypassPermissionChecks: true,
        });
      const memberships = await membershipRepository.find({
        where: { internalEntityId: In(entityIds) },
      });

      ids = this.extractRecordFieldIds(memberships, sourceFieldName);
    }

    this.internalEntityScopeCacheService.setReadableIds(cacheKey, ids);

    return ids;
  }

  private capitalize(value: string): string {
    return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
  }

  private buildIdsScopeFilter(fieldName: string, ids: string[]): RecordFilter {
    return (
      this.buildOptionalIdsScopeFilter(fieldName, ids) ??
      this.buildNeverMatchFilter()
    );
  }

  private buildOptionalIdsScopeFilter(
    fieldName: string,
    ids: string[],
  ): RecordFilter | undefined {
    const uniqueIds = this.normalizeUniqueIds(ids);

    if (uniqueIds.length === 0) {
      return undefined;
    }

    return {
      [fieldName]: {
        in: uniqueIds,
      },
    };
  }

  private buildNeverMatchFilter(): RecordFilter {
    return {
      id: {
        eq: NEVER_MATCH_RECORD_ID,
      },
    };
  }

  private extractRecordIds(records: Record<string, unknown>[]): string[] {
    return this.extractRecordFieldIds(records, 'id');
  }

  private extractRecordFieldIds(
    records: Record<string, unknown>[],
    fieldName: string,
  ): string[] {
    return this.normalizeUniqueIds(records.map((record) => record[fieldName]));
  }

  private normalizeUniqueIds(values: unknown[]): string[] {
    return Array.from(
      new Set(
        values.filter(
          (value): value is string =>
            typeof value === 'string' && value.length > 0,
        ),
      ),
    );
  }

  private requireCurrentWorkspaceMemberId(
    authContext: UserWorkspaceAuthContext,
  ): string {
    if (
      !isDefined(authContext.workspaceMemberId) ||
      authContext.workspaceMemberId.length === 0
    ) {
      this.throwPermissionDenied(
        msg`Your session is not attached to a workspace member.`,
      );
    }

    return authContext.workspaceMemberId;
  }

  private async requireAccessibleEntityIds(
    authContext: UserWorkspaceAuthContext,
  ): Promise<string[]> {
    const { entityIds } = await this.resolveEntityContext(authContext);

    if (entityIds.length === 0) {
      this.throwPermissionDenied(
        msg`Your profile is not attached to an internal entity.`,
      );
    }

    return entityIds;
  }

  private async requireActiveEntityId(
    authContext: UserWorkspaceAuthContext,
  ): Promise<string> {
    const { activeEntityId } = await this.resolveEntityContext(authContext);

    if (!isDefined(activeEntityId) || activeEntityId.length === 0) {
      this.throwPermissionDenied(
        msg`Your profile is not attached to an active internal entity.`,
      );
    }

    return activeEntityId;
  }

  private async resolveEntityContext(authContext: UserWorkspaceAuthContext) {
    return await this.workspaceMemberInternalEntityService.resolveContext({
      workspaceId: authContext.workspace.id,
      workspaceMemberId: authContext.workspaceMemberId,
      fallbackEntityId: authContext.user.entityId,
      requestedActiveEntityId: authContext.activeInternalEntityId,
    });
  }

  private async assertMembershipCreateTargetsCurrentEntity(
    authContext: UserWorkspaceAuthContext,
    objectName: string,
    payloadData?: Record<string, unknown>,
  ): Promise<void> {
    if (
      !isDefined(payloadData) ||
      (objectName !== 'companyEntityMembership' &&
        objectName !== 'personEntityMembership')
    ) {
      return;
    }

    const activeEntityId = (
      await this.requireActiveEntityId(authContext)
    ).toLowerCase();
    const targetEntityId = extractRelationTargetId(
      payloadData,
      'internalEntity',
      'internalEntityId',
    )?.toLowerCase();

    if (!isDefined(targetEntityId) || targetEntityId !== activeEntityId) {
      this.throwPermissionDenied(
        msg`You can only manage assignments for your current entity.`,
      );
    }

    const sourceRecordId = extractRelationTargetId(
      payloadData,
      objectName === 'companyEntityMembership' ? 'company' : 'person',
      objectName === 'companyEntityMembership' ? 'companyId' : 'personId',
    );

    if (!isDefined(sourceRecordId)) {
      return;
    }

    const sourceObjectName =
      objectName === 'companyEntityMembership' ? 'company' : 'person';
    const sourceRecordSummary =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        () =>
          this.resolveRecordSummary({
            workspaceId: authContext.workspace.id,
            objectName: sourceObjectName,
            recordId: sourceRecordId,
          }),
        authContext,
      );
    const isSourceRecordUnassigned = sourceRecordSummary.entityIds.length === 0;
    const isSourceRecordAlreadyVisibleInCurrentEntity =
      sourceRecordSummary.entityIds.includes(activeEntityId);

    if (
      isSourceRecordUnassigned ||
      isSourceRecordAlreadyVisibleInCurrentEntity
    ) {
      return;
    }

    this.throwPermissionDenied(
      msg`You can only manage assignments for records already visible in your entity or not yet assigned.`,
    );
  }

  private async resolveRecordSummary({
    workspaceId,
    objectName,
    recordId,
  }: {
    workspaceId: string;
    objectName: string;
    recordId: string;
  }): Promise<RecordSummary> {
    switch (objectName) {
      case 'internalEntity':
        return {
          createdByWorkspaceMemberId: null,
          entityIds: [recordId.toLowerCase()],
          relatedWorkspaceMemberIds: [],
        };
      case 'opportunity': {
        const opportunityRepository =
          await this.globalWorkspaceOrmManager.getRepository<
            Record<string, unknown>
          >(workspaceId, 'opportunity', { shouldBypassPermissionChecks: true });
        const record = await opportunityRepository.findOne({
          where: { id: recordId },
        });

        return {
          createdByWorkspaceMemberId: this.extractWorkspaceMemberId(
            record?.createdBy,
          ),
          entityIds: this.normalizeEntityIds(record?.internalEntityId),
          relatedWorkspaceMemberIds: [],
        };
      }
      case 'companyEntityMembership':
      case 'personEntityMembership': {
        const membershipRepository =
          await this.globalWorkspaceOrmManager.getRepository<
            Record<string, unknown>
          >(workspaceId, objectName, { shouldBypassPermissionChecks: true });
        const record = await membershipRepository.findOne({
          where: { id: recordId },
        });

        return {
          createdByWorkspaceMemberId: null,
          entityIds: this.normalizeEntityIds(record?.internalEntityId),
          relatedWorkspaceMemberIds: [],
        };
      }
      case 'note': {
        const repository = await this.globalWorkspaceOrmManager.getRepository<
          Record<string, unknown>
        >(workspaceId, 'note', { shouldBypassPermissionChecks: true });
        const record = await repository.findOne({
          where: { id: recordId },
          withDeleted: true,
        });

        return {
          createdByWorkspaceMemberId: this.extractWorkspaceMemberId(
            record?.createdBy,
          ),
          entityIds: [],
          relatedWorkspaceMemberIds: [],
        };
      }
      case 'task': {
        const repository = await this.globalWorkspaceOrmManager.getRepository<
          Record<string, unknown>
        >(workspaceId, 'task', { shouldBypassPermissionChecks: true });
        const record = await repository.findOne({
          where: { id: recordId },
          withDeleted: true,
        });

        return {
          createdByWorkspaceMemberId: this.extractWorkspaceMemberId(
            record?.createdBy,
          ),
          entityIds: [],
          relatedWorkspaceMemberIds: this.normalizeWorkspaceMemberIds(
            record?.assigneeId,
          ),
        };
      }
      case 'attachment': {
        const repository = await this.globalWorkspaceOrmManager.getRepository<
          Record<string, unknown>
        >(workspaceId, 'attachment', { shouldBypassPermissionChecks: true });
        const record = await repository.findOne({
          where: { id: recordId },
        });

        return {
          createdByWorkspaceMemberId:
            this.extractWorkspaceMemberId(record?.createdBy) ??
            this.extractDirectWorkspaceMemberId(record?.authorId),
          entityIds: [],
          relatedWorkspaceMemberIds: [],
        };
      }
      case 'noteTarget': {
        const repository = await this.globalWorkspaceOrmManager.getRepository<
          Record<string, unknown>
        >(workspaceId, 'noteTarget', { shouldBypassPermissionChecks: true });
        const record = await repository.findOne({
          where: { id: recordId },
          withDeleted: true,
        });
        const noteId =
          typeof record?.noteId === 'string' ? record.noteId : null;

        if (!isDefined(noteId)) {
          return {
            createdByWorkspaceMemberId: null,
            entityIds: [],
            relatedWorkspaceMemberIds: [],
          };
        }

        return this.resolveRecordSummary({
          workspaceId,
          objectName: 'note',
          recordId: noteId,
        });
      }
      case 'taskTarget': {
        const repository = await this.globalWorkspaceOrmManager.getRepository<
          Record<string, unknown>
        >(workspaceId, 'taskTarget', { shouldBypassPermissionChecks: true });
        const record = await repository.findOne({
          where: { id: recordId },
          withDeleted: true,
        });
        const taskId =
          typeof record?.taskId === 'string' ? record.taskId : null;

        if (!isDefined(taskId)) {
          return {
            createdByWorkspaceMemberId: null,
            entityIds: [],
            relatedWorkspaceMemberIds: [],
          };
        }

        return this.resolveRecordSummary({
          workspaceId,
          objectName: 'task',
          recordId: taskId,
        });
      }
      case 'company':
      case 'person': {
        const repository = await this.globalWorkspaceOrmManager.getRepository<
          Record<string, unknown>
        >(workspaceId, objectName, { shouldBypassPermissionChecks: true });
        const record = await repository.findOne({
          where: { id: recordId },
        });
        const membershipsRepository =
          await this.globalWorkspaceOrmManager.getRepository<
            Record<string, unknown>
          >(
            workspaceId,
            objectName === 'company'
              ? 'companyEntityMembership'
              : 'personEntityMembership',
            { shouldBypassPermissionChecks: true },
          );
        const sourceFieldName =
          objectName === 'company' ? 'companyId' : 'personId';
        const memberships = await membershipsRepository.find({
          where: {
            [sourceFieldName]: recordId,
          },
        });

        return {
          createdByWorkspaceMemberId: this.extractWorkspaceMemberId(
            record?.createdBy,
          ),
          entityIds: memberships.flatMap((membership) =>
            this.normalizeEntityIds(membership.internalEntityId),
          ),
          relatedWorkspaceMemberIds: [],
        };
      }
      default:
        return {
          createdByWorkspaceMemberId: null,
          entityIds: [],
          relatedWorkspaceMemberIds: [],
        };
    }
  }

  private async assertCanCreatePersonalObject(
    authContext: UserWorkspaceAuthContext,
    objectName: string,
    payloadData?: Record<string, unknown>,
  ): Promise<void> {
    if (!isDefined(payloadData)) {
      return;
    }

    if (objectName === 'noteTarget') {
      const noteId = this.extractStringField(payloadData, 'noteId');

      if (!isDefined(noteId)) {
        return;
      }

      const recordSummary = await this.resolveRecordSummary({
        workspaceId: authContext.workspace.id,
        objectName: 'note',
        recordId: noteId,
      });

      if (
        recordSummary.createdByWorkspaceMemberId ===
        authContext.workspaceMemberId
      ) {
        return;
      }

      this.throwPermissionDenied(
        msg`You can only attach your own notes to targets.`,
      );
    }

    if (objectName === 'taskTarget') {
      const taskId = this.extractStringField(payloadData, 'taskId');

      if (!isDefined(taskId)) {
        return;
      }

      const recordSummary = await this.resolveRecordSummary({
        workspaceId: authContext.workspace.id,
        objectName: 'task',
        recordId: taskId,
      });

      if (
        recordSummary.createdByWorkspaceMemberId ===
        authContext.workspaceMemberId
      ) {
        return;
      }

      this.throwPermissionDenied(
        msg`You can only attach your own tasks to targets.`,
      );
    }
  }

  private buildCreatedByWorkspaceMemberFilter(
    workspaceMemberId: string,
  ): RecordFilter {
    return {
      createdBy: {
        workspaceMemberId: {
          eq: workspaceMemberId,
        },
      },
    };
  }

  private buildCreatedByWorkspaceMemberWhere(
    workspaceMemberId: string,
  ): FindOptionsWhere<Record<string, unknown>> {
    return {
      createdBy: {
        workspaceMemberId,
      },
    } as FindOptionsWhere<Record<string, unknown>>;
  }

  private extractWorkspaceMemberId(actor: unknown): string | null {
    if (
      !isDefined(actor) ||
      typeof actor !== 'object' ||
      !('workspaceMemberId' in actor)
    ) {
      return null;
    }

    const workspaceMemberId = actor.workspaceMemberId;

    return typeof workspaceMemberId === 'string' && workspaceMemberId.length > 0
      ? workspaceMemberId
      : null;
  }

  private extractDirectWorkspaceMemberId(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private extractStringField(
    record: Record<string, unknown> | undefined,
    fieldName: string,
  ): string | null {
    if (!isDefined(record)) {
      return null;
    }

    const value = record[fieldName];

    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private normalizeEntityIds(entityId: unknown): string[] {
    const normalized = normalizeOptionalEntityId(entityId);

    return normalized !== null ? [normalized] : [];
  }

  private normalizeWorkspaceMemberIds(workspaceMemberId: unknown): string[] {
    if (
      typeof workspaceMemberId !== 'string' ||
      workspaceMemberId.length === 0
    ) {
      return [];
    }

    return [workspaceMemberId];
  }

  private throwPermissionDenied(
    userFriendlyMessage?: ReturnType<typeof msg>,
    auditMetadata?: PermissionDeniedAuditMetadata,
  ): never {
    if (auditMetadata != null) {
      const { authContext, objectName, recordId, reason } = auditMetadata;

      this.internalEntityAuditLoggerService.logPermissionDenied({
        workspaceId: authContext?.workspace.id ?? '',
        userId: authContext?.user.id,
        workspaceMemberId: authContext?.workspaceMemberId,
        objectName,
        recordId,
        reason,
      });
    }

    throw new PermissionsException(
      PermissionsExceptionMessage.PERMISSION_DENIED,
      PermissionsExceptionCode.PERMISSION_DENIED,
      {
        userFriendlyMessage,
      },
    );
  }

  private normalizeInternalEntityDataOrThrow({
    authContext,
    payloadData,
    nameIsRequired,
  }: {
    authContext: UserWorkspaceAuthContext;
    payloadData?: Record<string, unknown>;
    nameIsRequired: boolean;
  }): Record<string, unknown> {
    if (!isDefined(payloadData)) {
      throw new CommonQueryRunnerException(
        'Payload data is required',
        CommonQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
        {
          userFriendlyMessage: msg`Payload data is required.`,
        },
      );
    }

    const normalizedData: Record<string, unknown> = {
      ...payloadData,
      workspaceId: authContext.workspace.id,
    };
    const rawName = normalizedData.name;

    if (rawName !== undefined) {
      if (typeof rawName !== 'string') {
        throw new CommonQueryRunnerException(
          'Internal entity name must be a string',
          CommonQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
          {
            userFriendlyMessage: msg`Internal entity name must be a string.`,
          },
        );
      }

      normalizedData.name = rawName.trim();
    }

    const normalizedName = normalizedData.name;

    if (
      (nameIsRequired || normalizedName !== undefined) &&
      (typeof normalizedName !== 'string' || normalizedName.length === 0)
    ) {
      throw new CommonQueryRunnerException(
        'Internal entity name is required',
        CommonQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
        {
          userFriendlyMessage: msg`Internal entity name is required.`,
        },
      );
    }

    if (
      isDefined(payloadData.workspaceId) &&
      payloadData.workspaceId !== authContext.workspace.id
    ) {
      throw new CommonQueryRunnerException(
        'Internal entity workspaceId does not match the current workspace',
        CommonQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
        {
          userFriendlyMessage: msg`Internal entities can only be created in the current workspace.`,
        },
      );
    }

    return normalizedData;
  }
}
