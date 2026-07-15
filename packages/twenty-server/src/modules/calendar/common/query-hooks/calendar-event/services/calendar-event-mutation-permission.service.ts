import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { msg } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { In, Repository } from 'typeorm';

import {
  type CreateManyResolverArgs,
  type CreateOneResolverArgs,
} from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import {
  type UserWorkspaceAuthContext,
  type WorkspaceAuthContext,
} from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import {
  PermissionsException,
  PermissionsExceptionCode,
  PermissionsExceptionMessage,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { ENTITY_MANAGER_ROLE_LABEL } from 'src/modules/internal-entity/query-hooks/constants/internal-entity-access.constants';
import { WorkspaceMemberInternalEntityService } from 'src/modules/internal-entity/services/workspace-member-internal-entity.service';

const SUPPORTED_CALENDAR_MUTATION_OBJECT_NAMES = [
  'calendarChannelEventAssociation',
  'calendarEvent',
  'calendarEventParticipant',
] as const;

const SUPPORTED_CALENDAR_MUTATION_OBJECT_NAME_SET = new Set<string>(
  SUPPORTED_CALENDAR_MUTATION_OBJECT_NAMES,
);

@Injectable()
export class CalendarEventMutationPermissionService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly userRoleService: UserRoleService,
    @InjectRepository(CalendarChannelEntity)
    private readonly calendarChannelRepository: Repository<CalendarChannelEntity>,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly workspaceMemberInternalEntityService: WorkspaceMemberInternalEntityService,
  ) {}

  async validateCreatePayload(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: CreateOneResolverArgs<Record<string, unknown>>,
  ): Promise<CreateOneResolverArgs<Record<string, unknown>>> {
    if (!isUserAuthContext(authContext)) {
      return payload;
    }

    if (!SUPPORTED_CALENDAR_MUTATION_OBJECT_NAME_SET.has(objectName)) {
      return payload;
    }

    if (objectName === 'calendarChannelEventAssociation') {
      const calendarChannelId = this.extractStringValue(
        payload.data,
        'calendarChannelId',
      );

      if (isDefined(calendarChannelId)) {
        await this.assertCalendarChannelMutationAllowed(
          authContext,
          [calendarChannelId],
          msg`Only the entity manager or the platform administrator can create this calendar link.`,
        );
      }

      return payload;
    }

    if (objectName === 'calendarEvent') {
      await this.assertCalendarRecordCreationAllowed(authContext);

      return payload;
    }

    if (objectName === 'calendarEventParticipant') {
      const calendarEventId = this.extractStringValue(
        payload.data,
        'calendarEventId',
      );

      if (isDefined(calendarEventId)) {
        await this.assertCalendarEventMutationAllowed(
          authContext,
          calendarEventId,
        );
      }
    }

    return payload;
  }

  async validateCreateManyPayload(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: CreateManyResolverArgs<Record<string, unknown>>,
  ): Promise<CreateManyResolverArgs<Record<string, unknown>>> {
    if (!isUserAuthContext(authContext)) {
      return payload;
    }

    if (!SUPPORTED_CALENDAR_MUTATION_OBJECT_NAME_SET.has(objectName)) {
      return payload;
    }

    for (const data of payload.data) {
      await this.validateCreatePayload(authContext, objectName, {
        data,
      });
    }

    return payload;
  }

  async assertSingleMutationAllowed(
    authContext: WorkspaceAuthContext,
    objectName: string,
    recordId: string,
  ): Promise<void> {
    if (!isUserAuthContext(authContext)) {
      return;
    }

    if (!SUPPORTED_CALENDAR_MUTATION_OBJECT_NAME_SET.has(objectName)) {
      return;
    }

    if (objectName === 'calendarEvent') {
      await this.assertCalendarEventMutationAllowed(authContext, recordId);

      return;
    }

    if (objectName === 'calendarChannelEventAssociation') {
      const association =
        await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
          async () => {
            const associationRepository =
              await this.globalWorkspaceOrmManager.getRepository<
                Record<string, unknown>
              >(authContext.workspace.id, 'calendarChannelEventAssociation', {
                shouldBypassPermissionChecks: true,
              });

            return associationRepository.findOne({
              where: { id: recordId },
            });
          },
          authContext,
        );
      const calendarChannelId = this.extractStringValue(
        association,
        'calendarChannelId',
      );

      if (!isDefined(calendarChannelId)) {
        this.throwPermissionDenied(
          msg`Only the entity manager or the platform administrator can modify this calendar link.`,
        );
      }

      await this.assertCalendarChannelMutationAllowed(
        authContext,
        [calendarChannelId],
        msg`Only the entity manager or the platform administrator can modify this calendar link.`,
      );

      return;
    }

    const participant =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const participantRepository =
            await this.globalWorkspaceOrmManager.getRepository<
              Record<string, unknown>
            >(authContext.workspace.id, 'calendarEventParticipant', {
              shouldBypassPermissionChecks: true,
            });

          return participantRepository.findOne({
            where: { id: recordId },
          });
        },
        authContext,
      );
    const calendarEventId = this.extractStringValue(
      participant,
      'calendarEventId',
    );

    if (!isDefined(calendarEventId)) {
      this.throwPermissionDenied(
        msg`Only the entity manager or the platform administrator can modify this event participant.`,
      );
    }

    await this.assertCalendarEventMutationAllowed(authContext, calendarEventId);
  }

  async assertBulkMutationAllowed(
    authContext: WorkspaceAuthContext,
    objectName: string,
  ): Promise<void> {
    if (!isUserAuthContext(authContext)) {
      return;
    }

    if (!SUPPORTED_CALENDAR_MUTATION_OBJECT_NAME_SET.has(objectName)) {
      return;
    }

    this.throwPermissionDenied(
      msg`Bulk calendar mutations are disabled for scoped calendar records.`,
    );
  }

  private async assertCalendarEventMutationAllowed(
    authContext: UserWorkspaceAuthContext,
    calendarEventId: string,
  ): Promise<void> {
    const { calendarEvent, associations } =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const calendarEventRepository =
            await this.globalWorkspaceOrmManager.getRepository<
              Record<string, unknown>
            >(authContext.workspace.id, 'calendarEvent', {
              shouldBypassPermissionChecks: true,
            });
          const associationRepository =
            await this.globalWorkspaceOrmManager.getRepository<
              Record<string, unknown>
            >(authContext.workspace.id, 'calendarChannelEventAssociation', {
              shouldBypassPermissionChecks: true,
            });

          return {
            calendarEvent: await calendarEventRepository.findOne({
              where: { id: calendarEventId },
            }),
            associations: await associationRepository.find({
              where: {
                calendarEventId,
              },
            }),
          };
        },
        authContext,
      );

    if (!isDefined(calendarEvent)) {
      this.throwPermissionDenied(
        msg`Only the entity manager or the platform administrator can modify this event.`,
      );
    }

    const calendarChannelIds = [
      ...new Set(
        associations
          .map((association) => association.calendarChannelId)
          .filter(
            (calendarChannelId): calendarChannelId is string =>
              typeof calendarChannelId === 'string',
          ),
      ),
    ];

    if (calendarChannelIds.length === 0) {
      this.throwPermissionDenied(
        msg`Only the entity manager or the platform administrator can modify this event.`,
      );
    }

    await this.assertCalendarChannelMutationAllowed(
      authContext,
      calendarChannelIds,
    );
  }

  private async assertCalendarChannelMutationAllowed(
    authContext: UserWorkspaceAuthContext,
    calendarChannelIds: string[],
    permissionDeniedMessage = msg`Only the entity manager or the platform administrator can modify this event.`,
  ): Promise<void> {
    if (calendarChannelIds.length === 0) {
      this.throwPermissionDenied(permissionDeniedMessage);
    }

    if (!(await this.canManageScopedCalendarRecords(authContext))) {
      this.throwPermissionDenied(permissionDeniedMessage);
    }

    const calendarChannels = await this.calendarChannelRepository.find({
      where: {
        id: In(calendarChannelIds),
        workspaceId: authContext.workspace.id,
      },
      select: ['id', 'connectedAccountId'],
    });

    if (calendarChannels.length !== calendarChannelIds.length) {
      this.throwPermissionDenied(permissionDeniedMessage);
    }

    if (
      calendarChannels.some(
        (calendarChannel) => !isDefined(calendarChannel.connectedAccountId),
      )
    ) {
      this.throwPermissionDenied(permissionDeniedMessage);
    }

    const connectedAccountIds = [
      ...new Set(
        calendarChannels
          .map((calendarChannel) => calendarChannel.connectedAccountId)
          .filter(isDefined),
      ),
    ];
    const connectedAccounts =
      connectedAccountIds.length > 0
        ? await this.connectedAccountRepository.find({
            where: {
              id: In(connectedAccountIds),
              workspaceId: authContext.workspace.id,
            },
            select: ['id', 'userWorkspaceId'],
          })
        : [];

    if (connectedAccounts.length !== connectedAccountIds.length) {
      this.throwPermissionDenied(permissionDeniedMessage);
    }

    const ownerEntityIds = await this.resolveOwnerEntityIds(
      authContext.workspace.id,
      connectedAccounts,
    );
    const { entityIds } =
      await this.workspaceMemberInternalEntityService.resolveContext({
        workspaceId: authContext.workspace.id,
        workspaceMemberId: authContext.workspaceMemberId,
        fallbackEntityId: authContext.user.entityId,
        requestedActiveEntityId: authContext.activeInternalEntityId,
      });

    if (entityIds.length === 0) {
      this.throwPermissionDenied(
        msg`Your profile is not attached to an internal entity.`,
      );
    }

    if (entityIds.some((entityId) => ownerEntityIds.has(entityId))) {
      return;
    }

    this.throwPermissionDenied(permissionDeniedMessage);
  }

  private async assertCalendarRecordCreationAllowed(
    authContext: UserWorkspaceAuthContext,
  ): Promise<void> {
    if (!(await this.canManageScopedCalendarRecords(authContext))) {
      this.throwPermissionDenied(
        msg`Only the entity manager or the platform administrator can create this event.`,
      );
    }

    const { entityIds } =
      await this.workspaceMemberInternalEntityService.resolveContext({
        workspaceId: authContext.workspace.id,
        workspaceMemberId: authContext.workspaceMemberId,
        fallbackEntityId: authContext.user.entityId,
        requestedActiveEntityId: authContext.activeInternalEntityId,
      });

    if (entityIds.length === 0) {
      this.throwPermissionDenied(
        msg`Your profile is not attached to an internal entity.`,
      );
    }
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

  private async canManageScopedCalendarRecords(
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

  private async resolveOwnerEntityIds(
    workspaceId: string,
    connectedAccounts: Array<{
      id?: string | null;
      userWorkspaceId?: string | null;
    }>,
  ) {
    const userWorkspaceIds = [
      ...new Set(
        connectedAccounts
          .map((connectedAccount) => connectedAccount.userWorkspaceId)
          .filter(isDefined),
      ),
    ];
    const userWorkspaces =
      userWorkspaceIds.length > 0
        ? await this.userWorkspaceRepository.find({
            where: {
              id: In(userWorkspaceIds),
              workspaceId,
            },
            select: ['id', 'userId'],
          })
        : [];

    const userIds = [
      ...new Set(
        userWorkspaces
          .map((userWorkspace) => userWorkspace.userId)
          .filter(isDefined),
      ),
    ];
    const users =
      userIds.length > 0
        ? await this.userRepository.find({
            where: {
              id: In(userIds),
            },
            select: ['id', 'entityId'],
          })
        : [];
    const workspaceMembers =
      userIds.length > 0
        ? await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
            async () => {
              const workspaceMemberRepository =
                await this.globalWorkspaceOrmManager.getRepository<
                  Record<string, unknown>
                >(workspaceId, 'workspaceMember', {
                  shouldBypassPermissionChecks: true,
                });

              return workspaceMemberRepository.find({
                where: {
                  userId: In(userIds),
                },
              });
            },
            buildSystemAuthContext(workspaceId),
          )
        : [];

    const ownerUserIdByWorkspaceId = new Map(
      userWorkspaces.map((userWorkspace) => [
        userWorkspace.id,
        userWorkspace.userId,
      ]),
    );
    const ownerWorkspaceMemberIdByUserId = new Map(
      workspaceMembers
        .map((workspaceMember) => {
          const workspaceMemberId = this.extractStringValue(
            workspaceMember,
            'id',
          );
          const userId = this.extractStringValue(workspaceMember, 'userId');

          return isDefined(workspaceMemberId) && isDefined(userId)
            ? ([userId, workspaceMemberId] as const)
            : null;
        })
        .filter(isDefined),
    );
    const fallbackEntityIdByWorkspaceMemberId = new Map(
      users
        .map((user) => {
          const workspaceMemberId = ownerWorkspaceMemberIdByUserId.get(user.id);

          return isDefined(workspaceMemberId)
            ? ([workspaceMemberId, user.entityId ?? null] as const)
            : null;
        })
        .filter(isDefined),
    );
    const ownerWorkspaceMemberIds = connectedAccounts
      .map((connectedAccount) =>
        ownerUserIdByWorkspaceId.get(connectedAccount.userWorkspaceId ?? ''),
      )
      .filter(isDefined)
      .map((ownerUserId) => ownerWorkspaceMemberIdByUserId.get(ownerUserId))
      .filter(isDefined);
    const ownerContexts =
      await this.workspaceMemberInternalEntityService.resolveContextsByWorkspaceMemberIds(
        {
          workspaceId,
          workspaceMemberIds: ownerWorkspaceMemberIds,
          fallbackEntityIdByWorkspaceMemberId,
        },
      );

    return new Set(
      ownerWorkspaceMemberIds
        .map(
          (workspaceMemberId) =>
            ownerContexts.get(workspaceMemberId)?.currentEntityId ?? null,
        )
        .filter(isDefined),
    );
  }

  private extractStringValue(data: unknown, fieldName: string): string | null {
    if (!isDefined(data) || typeof data !== 'object' || !(fieldName in data)) {
      return null;
    }

    const value = (data as Record<string, unknown>)[fieldName];

    return typeof value === 'string' && value.length > 0 ? value : null;
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
