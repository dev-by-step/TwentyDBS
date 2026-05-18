import { Injectable } from '@nestjs/common';

import { msg } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

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
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { normalizeOptionalEntityId } from 'src/engine/utils/normalize-optional-entity-id.util';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import {
  ENTITY_CONFIGURATION_OBJECT_NAME_SET,
  ENTITY_MANAGER_ROLE_LABEL,
  ENTITY_SCOPED_CRM_OBJECT_NAME_SET,
  ENTITY_SCOPED_OBJECT_NAME_SET,
  HYBRID_SCOPED_OBJECT_NAME_SET,
  PERSONAL_WORK_OBJECT_NAME_SET,
} from 'src/modules/internal-entity/query-hooks/constants/internal-entity-access.constants';
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
  filterFieldName: string;
  requiresJunctionTargetFieldId: boolean;
};

@Injectable()
export class InternalEntityAccessPolicyService {
  // Per-process cache. Schema changes (init-internal-entities) are infrequent
  // and clearing this requires a server restart, which already happens after
  // a metadata migration in dev.
  private readonly entityScopeFieldAvailabilityByKey = new Map<
    string,
    boolean
  >();
  private readonly entityScopeBootstrapAvailabilityByWorkspaceId = new Map<
    string,
    boolean
  >();

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly userRoleService: UserRoleService,
    private readonly workspaceMemberInternalEntityService: WorkspaceMemberInternalEntityService,
    private readonly objectMetadataService: ObjectMetadataService,
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
    const scopedFilter = await this.buildScopedFilter(
      authContext,
      objectName,
      'read',
      sanitizedPayload.filter,
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
    const scopedFilter = await this.buildScopedFilter(
      authContext,
      objectName,
      'read',
      sanitizedPayload.filter,
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
    const scopedFilter = await this.buildScopedFilter(
      authContext,
      objectName,
      'read',
      sanitizedPayload.filter,
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
    await this.assertCanCreate(authContext, objectName, payload.data);

    return payload;
  }

  async validateCreateManyPayload(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: CreateManyResolverArgs<Record<string, unknown>>,
  ): Promise<CreateManyResolverArgs<Record<string, unknown>>> {
    for (const data of payload.data) {
      await this.assertCanCreate(authContext, objectName, data);
    }

    return payload;
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
      if (!(await this.isPlatformAdmin(authContext))) {
        this.throwPermissionDenied(
          msg`Only platform administrators can perform bulk updates on internal entity settings.`,
        );
      }
    } else if (ENTITY_CONFIGURATION_OBJECT_NAME_SET.has(objectName)) {
      if (!(await this.canManageEntityScopedRecords(authContext))) {
        this.throwPermissionDenied(
          msg`Bulk updates on entity assignments are reserved to entity managers and platform administrators.`,
        );
      }
    }

    if (
      ENTITY_SCOPED_CRM_OBJECT_NAME_SET.has(objectName) &&
      !(await this.canManageEntityScopedRecords(authContext))
    ) {
      this.throwPermissionDenied(
        msg`Bulk updates are reserved to entity managers and platform administrators.`,
      );
    }

    if (PERSONAL_WORK_OBJECT_NAME_SET.has(objectName)) {
      this.throwPermissionDenied(
        msg`Bulk updates are not allowed on personal work records.`,
      );
    }

    if (HYBRID_SCOPED_OBJECT_NAME_SET.has(objectName)) {
      this.throwPermissionDenied(
        msg`Bulk updates are not allowed on scoped timeline records.`,
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

    return {
      ...payload,
      filter: scopedFilter,
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
      if (await this.isPlatformAdmin(authContext)) {
        return payload;
      }

      this.throwPermissionDenied(
        msg`Duplicate detection on internal entities is reserved to platform administrators.`,
      );
    }

    if (!(await this.canManageEntityScopedRecords(authContext))) {
      this.throwPermissionDenied(
        msg`Duplicate detection on entity-scoped records is reserved to entity managers and platform administrators.`,
      );
    }

    const recordIds = payload.ids ?? [];

    if (recordIds.length === 0) {
      return payload;
    }

    const activeEntityId = await this.requireActiveEntityId(authContext);
    const recordSummaries = await Promise.all(
      recordIds.map((recordId) =>
        this.resolveRecordSummary({
          workspaceId: authContext.workspace.id,
          objectName,
          recordId,
        }),
      ),
    );

    if (
      recordSummaries.some(
        (recordSummary) =>
          recordSummary.entityIds.length === 0 ||
          recordSummary.entityIds.some(
            (recordEntityId) => recordEntityId !== activeEntityId,
          ),
      )
    ) {
      this.throwPermissionDenied(
        msg`You can only detect duplicates on records attached to your entity.`,
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
      );
    }

    if (!(await this.canManageEntityScopedRecords(authContext))) {
      this.throwPermissionDenied(
        msg`Only entity managers and platform administrators can merge entity records.`,
      );
    }

    const activeEntityId = await this.requireActiveEntityId(authContext);
    const recordSummaries = await Promise.all(
      payload.ids.map((recordId) =>
        this.resolveRecordSummary({
          workspaceId: authContext.workspace.id,
          objectName,
          recordId,
        }),
      ),
    );

    if (
      recordSummaries.some(
        (recordSummary) =>
          recordSummary.entityIds.length === 0 ||
          recordSummary.entityIds.some(
            (recordEntityId) => recordEntityId !== activeEntityId,
          ),
      )
    ) {
      this.throwPermissionDenied(
        msg`You can only merge records attached to your entity.`,
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
      (objectName === 'internalEntity' ||
        objectName === 'companyEntityMembership' ||
        objectName === 'personEntityMembership') &&
      (await this.isPlatformAdmin(authContext))
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
      );
    }

    if (HYBRID_SCOPED_OBJECT_NAME_SET.has(objectName)) {
      this.throwPermissionDenied(
        msg`Scoped timeline records cannot be modified manually.`,
      );
    }

    const activeEntityId = await this.requireActiveEntityId(authContext);

    if (
      recordSummary.entityIds.length > 0 &&
      !recordSummary.entityIds.includes(activeEntityId)
    ) {
      this.throwPermissionDenied(
        msg`You can only mutate records attached to your entity.`,
      );
    }

    if (objectName === 'internalEntity') {
      // Platform admins already returned earlier in this method, so we only
      // need to check the entity-manager role here (avoids a redundant
      // isPlatformAdmin lookup inside canManageEntityScopedRecords).
      if (method === 'updateOne' && (await this.isEntityManager(authContext))) {
        return;
      }

      this.throwPermissionDenied(
        msg`Only platform administrators can create, restore, delete, or destroy internal entities.`,
      );
    }

    if (
      objectName === 'companyEntityMembership' ||
      objectName === 'personEntityMembership'
    ) {
      this.throwPermissionDenied(
        msg`Only platform administrators can manage entity assignments.`,
      );
    }

    if (ENTITY_SCOPED_CRM_OBJECT_NAME_SET.has(objectName)) {
      if (await this.canManageEntityScopedRecords(authContext)) {
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
      );
    }

    if (!ENTITY_CONFIGURATION_OBJECT_NAME_SET.has(objectName)) {
      return;
    }

    if (objectName === 'internalEntity') {
      if (await this.isPlatformAdmin(authContext)) {
        return;
      }

      this.throwPermissionDenied(
        msg`Only platform administrators can create internal entities.`,
      );
    }

    if (
      objectName === 'companyEntityMembership' ||
      objectName === 'personEntityMembership'
    ) {
      if (await this.isPlatformAdmin(authContext)) {
        return;
      }

      this.throwPermissionDenied(
        msg`Only platform administrators can manage entity assignments.`,
      );
    }

    if (!(await this.canManageEntityScopedRecords(authContext))) {
      this.throwPermissionDenied(
        msg`Only entity managers and platform administrators can manage entity assignments.`,
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
    if (scopeMode === 'read' && !this.hasRequestedActiveEntity(authContext)) {
      return undefined;
    }

    const canApplyScopeFilter = await this.canApplyEntityScopeFilter(
      authContext.workspace.id,
      objectName,
    );

    if (!canApplyScopeFilter) {
      return undefined;
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
    const cached =
      this.entityScopeBootstrapAvailabilityByWorkspaceId.get(workspaceId);

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
        this.entityScopeBootstrapAvailabilityByWorkspaceId.set(
          workspaceId,
          false,
        );

        return false;
      }
    }

    this.entityScopeBootstrapAvailabilityByWorkspaceId.set(workspaceId, true);

    return true;
  }

  private async isEntityScopeFieldAvailable(
    workspaceId: string,
    objectName: string,
  ): Promise<boolean> {
    const cacheKey = `${workspaceId}::${objectName}`;
    const cached = this.entityScopeFieldAvailabilityByKey.get(cacheKey);

    if (isDefined(cached)) {
      return cached;
    }

    const requirement = this.getEntityScopeFieldRequirement(objectName);

    if (!isDefined(requirement)) {
      this.entityScopeFieldAvailabilityByKey.set(cacheKey, true);

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
    const filterField = objectMetadata?.fields?.find(
      (objectField) => objectField.name === requirement.filterFieldName,
    );

    const isAvailable =
      isDefined(field) &&
      isDefined(filterField) &&
      (!requirement.requiresJunctionTargetFieldId ||
        typeof (field.settings as { junctionTargetFieldId?: unknown })
          ?.junctionTargetFieldId === 'string');

    this.entityScopeFieldAvailabilityByKey.set(cacheKey, isAvailable);

    return isAvailable;
  }

  private getEntityScopeFieldRequirement(
    objectName: string,
  ): EntityScopeFieldRequirement | undefined {
    switch (objectName) {
      case 'company':
      case 'person':
        return {
          fieldName: 'internalEntities',
          filterFieldName: 'internalEntitiesId',
          requiresJunctionTargetFieldId: true,
        };
      case 'companyEntityMembership':
      case 'opportunity':
      case 'personEntityMembership':
        return {
          fieldName: 'internalEntity',
          filterFieldName: 'internalEntityId',
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
        return {
          or: [
            { authorId: { eq: currentWorkspaceMemberId } },
            this.buildCreatedByWorkspaceMemberFilter(currentWorkspaceMemberId),
          ],
        };
      case 'noteTarget': {
        const noteIds = await this.listAccessibleNoteIds(
          authContext.workspace.id,
          currentWorkspaceMemberId,
        );

        return { noteId: { in: noteIds } };
      }
      case 'taskTarget': {
        const taskIds = await this.listAccessibleTaskIds(
          authContext.workspace.id,
          currentWorkspaceMemberId,
        );

        return { taskId: { in: taskIds } };
      }
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
    const [noteIds, taskIds, companyIds, personIds, opportunityIds] =
      await Promise.all([
        this.listAccessibleNoteIds(
          authContext.workspace.id,
          currentWorkspaceMemberId,
        ),
        this.listAccessibleTaskIds(
          authContext.workspace.id,
          currentWorkspaceMemberId,
        ),
        this.listEntityScopedRecordIds(
          authContext.workspace.id,
          'companyEntityMembership',
          'companyId',
          accessibleEntityIds,
        ),
        this.listEntityScopedRecordIds(
          authContext.workspace.id,
          'personEntityMembership',
          'personId',
          accessibleEntityIds,
        ),
        this.listEntityScopedRecordIds(
          authContext.workspace.id,
          'opportunity',
          'id',
          accessibleEntityIds,
          'internalEntityId',
        ),
      ]);

    return {
      or: [
        { workspaceMemberId: { eq: currentWorkspaceMemberId } },
        { targetNoteId: { in: noteIds } },
        { targetTaskId: { in: taskIds } },
        { targetCompanyId: { in: companyIds } },
        { targetPersonId: { in: personIds } },
        { targetOpportunityId: { in: opportunityIds } },
      ],
    };
  }

  private async isPlatformAdmin(
    authContext: UserWorkspaceAuthContext,
  ): Promise<boolean> {
    if (authContext.user.canAccessFullAdminPanel) {
      return true;
    }

    const roles = await this.getUserWorkspaceRoles(authContext);

    return roles.some(
      (role) =>
        role.universalIdentifier === STANDARD_ROLE.admin.universalIdentifier,
    );
  }

  private async canManageEntityScopedRecords(
    authContext: UserWorkspaceAuthContext,
  ): Promise<boolean> {
    if (await this.isPlatformAdmin(authContext)) {
      return true;
    }

    return this.isEntityManager(authContext);
  }

  private async isEntityManager(
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

  private async getUserWorkspaceRoles(authContext: UserWorkspaceAuthContext) {
    const rolesByUserWorkspace =
      await this.userRoleService.getRolesByUserWorkspaces({
        userWorkspaceIds: [authContext.userWorkspaceId],
        workspaceId: authContext.workspace.id,
      });

    return rolesByUserWorkspace.get(authContext.userWorkspaceId) ?? [];
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
    const targetEntityId = this.extractRelationTargetId(
      payloadData,
      'internalEntity',
      'internalEntityId',
    )?.toLowerCase();

    if (!isDefined(targetEntityId) || targetEntityId !== activeEntityId) {
      this.throwPermissionDenied(
        msg`You can only manage assignments for your current entity.`,
      );
    }

    const sourceRecordId = this.extractRelationTargetId(
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

  private async listAccessibleNoteIds(
    workspaceId: string,
    workspaceMemberId: string,
  ): Promise<string[]> {
    const repository = await this.globalWorkspaceOrmManager.getRepository<
      Record<string, unknown>
    >(workspaceId, 'note', { shouldBypassPermissionChecks: true });
    const records = await (
      repository as {
        find: (args: unknown) => Promise<Record<string, unknown>[]>;
      }
    ).find({
      where: this.buildCreatedByWorkspaceMemberFilter(workspaceMemberId),
    });

    return records
      .map((record) => this.extractStringField(record, 'id'))
      .filter(isDefined);
  }

  private async listAccessibleTaskIds(
    workspaceId: string,
    workspaceMemberId: string,
  ): Promise<string[]> {
    const repository = await this.globalWorkspaceOrmManager.getRepository<
      Record<string, unknown>
    >(workspaceId, 'task', { shouldBypassPermissionChecks: true });
    const records = await (
      repository as {
        find: (args: unknown) => Promise<Record<string, unknown>[]>;
      }
    ).find({
      where: {
        or: [
          this.buildCreatedByWorkspaceMemberFilter(workspaceMemberId),
          { assigneeId: { eq: workspaceMemberId } },
        ],
      },
    });

    return records
      .map((record) => this.extractStringField(record, 'id'))
      .filter(isDefined);
  }

  private async listEntityScopedRecordIds(
    workspaceId: string,
    objectName: string,
    idFieldName: string,
    entityIds: string[],
    entityFieldName = 'internalEntityId',
  ): Promise<string[]> {
    if (entityIds.length === 0) {
      return [];
    }

    const repository = await this.globalWorkspaceOrmManager.getRepository<
      Record<string, unknown>
    >(workspaceId, objectName, { shouldBypassPermissionChecks: true });
    const records = await (
      repository as {
        find: (args: unknown) => Promise<Record<string, unknown>[]>;
      }
    ).find({
      where: {
        [entityFieldName]: {
          in: entityIds,
        },
      },
    });

    return records
      .map((record) => this.extractStringField(record, idFieldName))
      .filter(isDefined);
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

  private extractRelationTargetId(
    record: Record<string, unknown> | undefined,
    relationFieldName: string,
    joinColumnFieldName: string,
  ): string | null {
    const joinColumnValue = this.extractStringField(
      record,
      joinColumnFieldName,
    );

    if (isDefined(joinColumnValue)) {
      return joinColumnValue;
    }

    if (!isDefined(record)) {
      return null;
    }

    const relationFieldValue = record[relationFieldName];

    if (
      typeof relationFieldValue !== 'object' ||
      relationFieldValue === null ||
      Array.isArray(relationFieldValue)
    ) {
      return null;
    }

    const directId = (relationFieldValue as Record<string, unknown>).id;

    if (typeof directId === 'string' && directId.length > 0) {
      return directId;
    }

    const connectValue = (relationFieldValue as Record<string, unknown>)
      .connect;

    if (
      typeof connectValue !== 'object' ||
      connectValue === null ||
      Array.isArray(connectValue)
    ) {
      return null;
    }

    const connectId = (connectValue as Record<string, unknown>).id;

    return typeof connectId === 'string' && connectId.length > 0
      ? connectId
      : null;
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
  ): never {
    throw new PermissionsException(
      PermissionsExceptionMessage.PERMISSION_DENIED,
      PermissionsExceptionCode.PERMISSION_DENIED,
      {
        userFriendlyMessage,
      },
    );
  }
}
