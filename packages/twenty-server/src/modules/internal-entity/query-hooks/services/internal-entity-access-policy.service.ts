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
import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  PermissionsException,
  PermissionsExceptionCode,
  PermissionsExceptionMessage,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import {
  ENTITY_CONFIGURATION_OBJECT_NAME_SET,
  ENTITY_MANAGER_ROLE_LABEL,
  ENTITY_SCOPED_CRM_OBJECT_NAME_SET,
  ENTITY_SCOPED_OBJECT_NAME_SET,
  HYBRID_SCOPED_OBJECT_NAME_SET,
  PERSONAL_WORK_OBJECT_NAME_SET,
} from 'src/modules/internal-entity/query-hooks/constants/internal-entity-access.constants';

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

@Injectable()
export class InternalEntityAccessPolicyService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly userRoleService: UserRoleService,
  ) {}

  async scopeFindManyPayload(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: FindManyResolverArgs<RecordFilter>,
  ): Promise<FindManyResolverArgs<RecordFilter>> {
    const scopedFilter = await this.buildScopedFilter(
      authContext,
      objectName,
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

  async scopeFindOnePayload(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: FindOneResolverArgs<RecordFilter>,
  ): Promise<FindOneResolverArgs<RecordFilter>> {
    const scopedFilter = await this.buildScopedFilter(
      authContext,
      objectName,
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

  async scopeGroupByPayload(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: GroupByResolverArgs<RecordFilter>,
  ): Promise<GroupByResolverArgs<RecordFilter>> {
    const scopedFilter = await this.buildScopedFilter(
      authContext,
      objectName,
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

    if (!(await this.isSuperAdmin(authContext))) {
      if (ENTITY_CONFIGURATION_OBJECT_NAME_SET.has(objectName)) {
        this.throwPermissionDenied(
          msg`Only administrators can perform bulk updates on entity configuration.`,
        );
      }

      if (
        ENTITY_SCOPED_CRM_OBJECT_NAME_SET.has(objectName) &&
        !(await this.isEntityManager(authContext))
      ) {
        this.throwPermissionDenied(
          msg`Bulk updates are reserved to entity managers and administrators.`,
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
    }

    const scopedFilter = await this.buildScopedFilter(
      authContext,
      objectName,
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

    if (await this.isSuperAdmin(authContext)) {
      return payload;
    }

    if (ENTITY_SCOPED_OBJECT_NAME_SET.has(objectName)) {
      this.throwPermissionDenied(
        msg`Duplicate detection on entity-scoped records is reserved to administrators.`,
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

    if (await this.isSuperAdmin(authContext)) {
      return payload;
    }

    if (!ENTITY_SCOPED_OBJECT_NAME_SET.has(objectName)) {
      return payload;
    }

    if (!ENTITY_SCOPED_CRM_OBJECT_NAME_SET.has(objectName)) {
      this.throwPermissionDenied(
        msg`Only administrators can merge entity configuration records.`,
      );
    }

    if (!(await this.isEntityManager(authContext))) {
      this.throwPermissionDenied(
        msg`Only entity managers and administrators can merge entity records.`,
      );
    }

    const currentEntityId = this.requireCurrentEntityId(authContext);
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
            (recordEntityId) => recordEntityId !== currentEntityId,
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

    if (await this.isSuperAdmin(authContext)) {
      return;
    }

    const recordSummary = await this.resolveRecordSummary({
      workspaceId: authContext.workspace.id,
      objectName,
      recordId,
    });

    if (PERSONAL_WORK_OBJECT_NAME_SET.has(objectName)) {
      const currentWorkspaceMemberId =
        this.requireCurrentWorkspaceMemberId(authContext);

      if (recordSummary.createdByWorkspaceMemberId === currentWorkspaceMemberId) {
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
        msg`Only administrators can modify scoped timeline records.`,
      );
    }

    const currentEntityId = this.requireCurrentEntityId(authContext);

    if (
      recordSummary.entityIds.length > 0 &&
      !recordSummary.entityIds.includes(currentEntityId)
    ) {
      this.throwPermissionDenied(
        msg`You can only mutate records attached to your entity.`,
      );
    }

    if (objectName === 'internalEntity') {
      if (method === 'updateOne' && (await this.isEntityManager(authContext))) {
        return;
      }

      this.throwPermissionDenied(
        msg`Only administrators can create, restore, delete, or destroy internal entities.`,
      );
    }

    if (objectName === 'companyEntityMembership' || objectName === 'personEntityMembership') {
      if (await this.isEntityManager(authContext)) {
        return;
      }

      this.throwPermissionDenied(
        msg`Only entity managers and administrators can manage entity assignments.`,
      );
    }

    if (ENTITY_SCOPED_CRM_OBJECT_NAME_SET.has(objectName)) {
      if (await this.isEntityManager(authContext)) {
        return;
      }

      if (
        isDefined(recordSummary.createdByWorkspaceMemberId) &&
        recordSummary.createdByWorkspaceMemberId === authContext.workspaceMemberId
      ) {
        return;
      }

      this.throwPermissionDenied(
        msg`You can only modify records that you created, unless you are an entity manager.`,
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
        msg`Only administrators can create scoped timeline records manually.`,
      );
    }

    if (!ENTITY_CONFIGURATION_OBJECT_NAME_SET.has(objectName)) {
      return;
    }

    if (await this.isSuperAdmin(authContext)) {
      return;
    }

    if (objectName === 'internalEntity') {
      this.throwPermissionDenied(
        msg`Only administrators can create internal entities.`,
      );
    }

    if (!(await this.isEntityManager(authContext))) {
      this.throwPermissionDenied(
        msg`Only entity managers and administrators can manage entity assignments.`,
      );
    }
  }

  private async buildScopedFilter(
    authContext: WorkspaceAuthContext,
    objectName: string,
    filter?: RecordFilter,
  ): Promise<RecordFilter | undefined> {
    if (!isUserAuthContext(authContext)) {
      return filter;
    }

    if (await this.isSuperAdmin(authContext)) {
      return filter;
    }

    const scopeFilter = ENTITY_SCOPED_OBJECT_NAME_SET.has(objectName)
      ? this.getEntityScopeFilter(
          objectName,
          this.requireCurrentEntityId(authContext),
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

  private getEntityScopeFilter(
    objectName: string,
    currentEntityId: string,
  ): RecordFilter {
    switch (objectName) {
      case 'company':
      case 'person':
        return { internalEntitiesId: { in: [currentEntityId] } };
      case 'companyEntityMembership':
      case 'opportunity':
      case 'personEntityMembership':
        return { internalEntityId: { eq: currentEntityId } };
      case 'internalEntity':
        return { id: { eq: currentEntityId } };
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
        return this.buildCreatedByWorkspaceMemberFilter(currentWorkspaceMemberId);
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
    const currentEntityId = this.requireCurrentEntityId(authContext);
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
          currentEntityId,
        ),
        this.listEntityScopedRecordIds(
          authContext.workspace.id,
          'personEntityMembership',
          'personId',
          currentEntityId,
        ),
        this.listEntityScopedRecordIds(
          authContext.workspace.id,
          'opportunity',
          'id',
          currentEntityId,
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

  private async isSuperAdmin(
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
    const rolesByUserWorkspace = await this.userRoleService.getRolesByUserWorkspaces(
      {
        userWorkspaceIds: [authContext.userWorkspaceId],
        workspaceId: authContext.workspace.id,
      },
    );

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

  private requireCurrentEntityId(authContext: UserWorkspaceAuthContext): string {
    const currentEntityId = authContext.user.entityId?.toLowerCase();

    if (!isDefined(currentEntityId) || currentEntityId.length === 0) {
      this.throwPermissionDenied(
        msg`Your profile is not attached to an internal entity.`,
      );
    }

    return currentEntityId;
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
          await this.globalWorkspaceOrmManager.getRepository<Record<string, unknown>>(
            workspaceId,
            'opportunity',
            { shouldBypassPermissionChecks: true },
          );
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
          await this.globalWorkspaceOrmManager.getRepository<Record<string, unknown>>(
            workspaceId,
            objectName,
            { shouldBypassPermissionChecks: true },
          );
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
        const repository =
          await this.globalWorkspaceOrmManager.getRepository<Record<string, unknown>>(
            workspaceId,
            'note',
            { shouldBypassPermissionChecks: true },
          );
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
        const repository =
          await this.globalWorkspaceOrmManager.getRepository<Record<string, unknown>>(
            workspaceId,
            'task',
            { shouldBypassPermissionChecks: true },
          );
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
        const repository =
          await this.globalWorkspaceOrmManager.getRepository<Record<string, unknown>>(
            workspaceId,
            'attachment',
            { shouldBypassPermissionChecks: true },
          );
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
        const repository =
          await this.globalWorkspaceOrmManager.getRepository<Record<string, unknown>>(
            workspaceId,
            'noteTarget',
            { shouldBypassPermissionChecks: true },
          );
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
        const repository =
          await this.globalWorkspaceOrmManager.getRepository<Record<string, unknown>>(
            workspaceId,
            'taskTarget',
            { shouldBypassPermissionChecks: true },
          );
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
        const repository =
          await this.globalWorkspaceOrmManager.getRepository<Record<string, unknown>>(
            workspaceId,
            objectName,
            { shouldBypassPermissionChecks: true },
          );
        const record = await repository.findOne({
          where: { id: recordId },
        });
        const membershipsRepository =
          await this.globalWorkspaceOrmManager.getRepository<Record<string, unknown>>(
            workspaceId,
            objectName === 'company'
              ? 'companyEntityMembership'
              : 'personEntityMembership',
            { shouldBypassPermissionChecks: true },
          );
        const sourceFieldName = objectName === 'company' ? 'companyId' : 'personId';
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

      if (recordSummary.createdByWorkspaceMemberId === authContext.workspaceMemberId) {
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

      if (recordSummary.createdByWorkspaceMemberId === authContext.workspaceMemberId) {
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
    const repository =
      await this.globalWorkspaceOrmManager.getRepository<Record<string, unknown>>(
        workspaceId,
        'note',
        { shouldBypassPermissionChecks: true },
      );
    const records = await (repository as {
      find: (args: unknown) => Promise<Record<string, unknown>[]>;
    }).find({
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
    const repository =
      await this.globalWorkspaceOrmManager.getRepository<Record<string, unknown>>(
        workspaceId,
        'task',
        { shouldBypassPermissionChecks: true },
      );
    const records = await (repository as {
      find: (args: unknown) => Promise<Record<string, unknown>[]>;
    }).find({
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
    entityId: string,
    entityFieldName = 'internalEntityId',
  ): Promise<string[]> {
    const repository =
      await this.globalWorkspaceOrmManager.getRepository<Record<string, unknown>>(
        workspaceId,
        objectName,
        { shouldBypassPermissionChecks: true },
      );
    const records = await (repository as {
      find: (args: unknown) => Promise<Record<string, unknown>[]>;
    }).find({
      where: {
        [entityFieldName]: {
          eq: entityId,
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

  private normalizeEntityIds(entityId: unknown): string[] {
    if (typeof entityId !== 'string' || entityId.length === 0) {
      return [];
    }

    return [entityId.toLowerCase()];
  }

  private normalizeWorkspaceMemberIds(workspaceMemberId: unknown): string[] {
    if (typeof workspaceMemberId !== 'string' || workspaceMemberId.length === 0) {
      return [];
    }

    return [workspaceMemberId];
  }

  private throwPermissionDenied(userFriendlyMessage?: ReturnType<typeof msg>): never {
    throw new PermissionsException(
      PermissionsExceptionMessage.PERMISSION_DENIED,
      PermissionsExceptionCode.PERMISSION_DENIED,
      {
        userFriendlyMessage,
      },
    );
  }
}
