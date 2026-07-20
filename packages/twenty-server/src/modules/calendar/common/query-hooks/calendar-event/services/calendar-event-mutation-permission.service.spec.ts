import { faker } from '@faker-js/faker';
import { FindOperator } from 'typeorm';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { PermissionsExceptionCode } from 'src/engine/metadata-modules/permissions/permissions.exception';
import { type InternalEntityAuditLoggerService } from 'src/modules/internal-entity/services/internal-entity-audit-logger.service';
import { type InternalEntityRoleService } from 'src/modules/internal-entity/services/internal-entity-role.service';
import { createContextAwareOrmManagerMock } from 'src/engine/twenty-orm/global-workspace-datasource/__test-utils__/create-context-aware-orm-manager-mock';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { ENTITY_MANAGER_ROLE_LABEL } from 'src/modules/internal-entity/query-hooks/constants/internal-entity-access.constants';
import { CalendarEventMutationPermissionService } from 'src/modules/calendar/common/query-hooks/calendar-event/services/calendar-event-mutation-permission.service';
import { type WorkspaceMemberInternalEntityService } from 'src/modules/internal-entity/services/workspace-member-internal-entity.service';

const buildServiceContext = ({
  roleLabel,
  roleUniversalIdentifier,
  canAccessFullAdminPanel = false,
  accessibleEntityIds,
  activeEntityId,
}: {
  roleLabel?: string;
  roleUniversalIdentifier?: string;
  canAccessFullAdminPanel?: boolean;
  accessibleEntityIds?: string[];
  activeEntityId?: string;
} = {}) => {
  const workspaceId = faker.string.uuid();
  const entityId = faker.string.uuid();
  const userId = faker.string.uuid();
  const userWorkspaceId = faker.string.uuid();
  const workspaceMemberId = faker.string.uuid();

  const calendarEventRepository = {
    findOne: jest.fn(),
  };
  const associationRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const participantRepository = {
    findOne: jest.fn(),
  };
  const workspaceMemberRepository = {
    find: jest.fn(),
  };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(async (fn: () => unknown) => fn()),
    getRepository: jest.fn(async (_workspaceId: string, objectName: string) => {
      if (objectName === 'calendarEvent') {
        return calendarEventRepository;
      }

      if (objectName === 'calendarChannelEventAssociation') {
        return associationRepository;
      }

      if (objectName === 'calendarEventParticipant') {
        return participantRepository;
      }

      if (objectName === 'workspaceMember') {
        return workspaceMemberRepository;
      }

      return {
        findOne: jest.fn(),
        find: jest.fn(),
      };
    }),
  };

  const calendarChannelRepository = {
    find: jest.fn(),
  };
  const connectedAccountRepository = {
    find: jest.fn(),
  };
  const userWorkspaceRepository = {
    find: jest.fn(),
  };
  const userRepository = {
    find: jest.fn(),
  };

  workspaceMemberRepository.find.mockResolvedValue([]);

  const service = new CalendarEventMutationPermissionService(
    globalWorkspaceOrmManager as unknown as GlobalWorkspaceOrmManager,
    calendarChannelRepository as any,
    connectedAccountRepository as any,
    userWorkspaceRepository as any,
    userRepository as any,
    {
      resolveContext: jest.fn().mockResolvedValue({
        currentEntityId: entityId,
        activeEntityId: activeEntityId ?? entityId,
        entityIds: accessibleEntityIds ?? [entityId],
      }),
      resolveContextsByWorkspaceMemberIds: jest.fn().mockImplementation(
        async ({
          workspaceMemberIds,
          fallbackEntityIdByWorkspaceMemberId,
        }: {
          workspaceMemberIds: string[];
          fallbackEntityIdByWorkspaceMemberId?: Map<string, string | null>;
        }) =>
          new Map(
            workspaceMemberIds.map((workspaceMemberId) => [
              workspaceMemberId,
              {
                currentEntityId:
                  fallbackEntityIdByWorkspaceMemberId?.get(workspaceMemberId) ??
                  entityId,
                activeEntityId:
                  fallbackEntityIdByWorkspaceMemberId?.get(workspaceMemberId) ??
                  entityId,
                entityIds: [
                  fallbackEntityIdByWorkspaceMemberId?.get(workspaceMemberId) ??
                    entityId,
                ],
              },
            ]),
          ),
      ),
    } as unknown as WorkspaceMemberInternalEntityService,
    {
      logPermissionDenied: jest.fn(),
    } as unknown as InternalEntityAuditLoggerService,
    {
      isPlatformAdmin: jest.fn().mockResolvedValue(canAccessFullAdminPanel),
      isEntityManager: jest
        .fn()
        .mockResolvedValue(roleLabel === ENTITY_MANAGER_ROLE_LABEL),
      canManageEntityScopedRecords: jest
        .fn()
        .mockResolvedValue(
          canAccessFullAdminPanel || roleLabel === ENTITY_MANAGER_ROLE_LABEL,
        ),
      isInternalEntitySuperAdmin: jest
        .fn()
        .mockReturnValue(canAccessFullAdminPanel),
    } as unknown as InternalEntityRoleService,
  );

  const authContext: WorkspaceAuthContext = {
    type: 'user',
    workspace: { id: workspaceId },
    userWorkspaceId,
    workspaceMemberId,
    workspaceMember: { id: workspaceMemberId },
    user: {
      id: userId,
      entityId,
      canAccessFullAdminPanel,
    },
  } as WorkspaceAuthContext;

  return {
    service,
    authContext,
    calendarEventRepository,
    associationRepository,
    participantRepository,
    workspaceMemberRepository,
    calendarChannelRepository,
    connectedAccountRepository,
    userWorkspaceRepository,
    userRepository,
    entityId,
    userWorkspaceId,
    workspaceMemberId,
  };
};

describe('CalendarEventMutationPermissionService', () => {
  it('should deny the author from mutating their own event when they are not an entity manager or platform administrator', async () => {
    const {
      service,
      authContext,
      calendarEventRepository,
      associationRepository,
      workspaceMemberId,
    } = buildServiceContext();

    calendarEventRepository.findOne.mockResolvedValue({
      createdBy: {
        workspaceMemberId,
      },
    });
    associationRepository.find.mockResolvedValue([
      {
        calendarChannelId: 'calendar-channel-1',
      },
    ]);

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'calendarEvent',
        faker.string.uuid(),
      ),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should deny the connected account owner from mutating an event when they are not an entity manager or platform administrator', async () => {
    const {
      service,
      authContext,
      calendarEventRepository,
      associationRepository,
      calendarChannelRepository,
      connectedAccountRepository,
      userWorkspaceId,
    } = buildServiceContext();

    calendarEventRepository.findOne.mockResolvedValue({
      createdBy: {
        workspaceMemberId: faker.string.uuid(),
      },
    });
    associationRepository.find.mockResolvedValue([
      {
        calendarChannelId: 'calendar-channel-1',
      },
    ]);
    calendarChannelRepository.find.mockResolvedValue([
      {
        id: 'calendar-channel-1',
        connectedAccountId: 'connected-account-1',
      },
    ]);
    connectedAccountRepository.find.mockResolvedValue([
      {
        id: 'connected-account-1',
        userWorkspaceId,
      },
    ]);

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'calendarEvent',
        faker.string.uuid(),
      ),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should allow an entity manager to mutate an event owned by the same entity', async () => {
    const {
      service,
      authContext,
      calendarEventRepository,
      associationRepository,
      calendarChannelRepository,
      connectedAccountRepository,
      userWorkspaceRepository,
      workspaceMemberRepository,
      userRepository,
      entityId,
    } = buildServiceContext({
      roleLabel: ENTITY_MANAGER_ROLE_LABEL,
    });

    calendarEventRepository.findOne.mockResolvedValue({
      createdBy: {
        workspaceMemberId: faker.string.uuid(),
      },
    });
    associationRepository.find.mockResolvedValue([
      {
        calendarChannelId: 'calendar-channel-1',
      },
    ]);
    calendarChannelRepository.find.mockResolvedValue([
      {
        id: 'calendar-channel-1',
        connectedAccountId: 'connected-account-1',
      },
    ]);
    connectedAccountRepository.find.mockResolvedValue([
      {
        id: 'connected-account-1',
        userWorkspaceId: 'owner-user-workspace-1',
      },
    ]);
    userWorkspaceRepository.find.mockResolvedValue([
      {
        id: 'owner-user-workspace-1',
        userId: 'owner-user-1',
      },
    ]);
    workspaceMemberRepository.find.mockResolvedValue([
      {
        id: 'owner-workspace-member-1',
        userId: 'owner-user-1',
      },
    ]);
    userRepository.find.mockResolvedValue([
      {
        id: 'owner-user-1',
        entityId,
      },
    ]);

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'calendarEvent',
        faker.string.uuid(),
      ),
    ).resolves.toBeUndefined();
  });

  it('should allow an entity manager to mutate an event owned by any entity they belong to', async () => {
    const primaryActiveEntityId = faker.string.uuid();
    const secondaryEntityId = faker.string.uuid();
    const {
      service,
      authContext,
      calendarEventRepository,
      associationRepository,
      calendarChannelRepository,
      connectedAccountRepository,
      userWorkspaceRepository,
      workspaceMemberRepository,
      userRepository,
    } = buildServiceContext({
      roleLabel: ENTITY_MANAGER_ROLE_LABEL,
      accessibleEntityIds: [primaryActiveEntityId, secondaryEntityId],
      activeEntityId: primaryActiveEntityId,
    });

    calendarEventRepository.findOne.mockResolvedValue({
      createdBy: {
        workspaceMemberId: faker.string.uuid(),
      },
    });
    associationRepository.find.mockResolvedValue([
      {
        calendarChannelId: 'calendar-channel-1',
      },
    ]);
    calendarChannelRepository.find.mockResolvedValue([
      {
        id: 'calendar-channel-1',
        connectedAccountId: 'connected-account-1',
      },
    ]);
    connectedAccountRepository.find.mockResolvedValue([
      {
        id: 'connected-account-1',
        userWorkspaceId: 'owner-user-workspace-1',
      },
    ]);
    userWorkspaceRepository.find.mockResolvedValue([
      { id: 'owner-user-workspace-1', userId: 'owner-user-1' },
    ]);
    workspaceMemberRepository.find.mockResolvedValue([
      { id: 'owner-workspace-member-1', userId: 'owner-user-1' },
    ]);
    userRepository.find.mockResolvedValue([
      { id: 'owner-user-1', entityId: secondaryEntityId },
    ]);

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'calendarEvent',
        faker.string.uuid(),
      ),
    ).resolves.toBeUndefined();
  });

  it('should deny an entity manager from mutating an event owned by an entity they do not belong to', async () => {
    const managerEntityId = faker.string.uuid();
    const otherEntityId = faker.string.uuid();
    const {
      service,
      authContext,
      calendarEventRepository,
      associationRepository,
      calendarChannelRepository,
      connectedAccountRepository,
      userWorkspaceRepository,
      workspaceMemberRepository,
      userRepository,
    } = buildServiceContext({
      roleLabel: ENTITY_MANAGER_ROLE_LABEL,
      accessibleEntityIds: [managerEntityId],
      activeEntityId: managerEntityId,
    });

    calendarEventRepository.findOne.mockResolvedValue({
      createdBy: {
        workspaceMemberId: faker.string.uuid(),
      },
    });
    associationRepository.find.mockResolvedValue([
      {
        calendarChannelId: 'calendar-channel-1',
      },
    ]);
    calendarChannelRepository.find.mockResolvedValue([
      {
        id: 'calendar-channel-1',
        connectedAccountId: 'connected-account-1',
      },
    ]);
    connectedAccountRepository.find.mockResolvedValue([
      {
        id: 'connected-account-1',
        userWorkspaceId: 'owner-user-workspace-1',
      },
    ]);
    userWorkspaceRepository.find.mockResolvedValue([
      { id: 'owner-user-workspace-1', userId: 'owner-user-1' },
    ]);
    workspaceMemberRepository.find.mockResolvedValue([
      { id: 'owner-workspace-member-1', userId: 'owner-user-1' },
    ]);
    userRepository.find.mockResolvedValue([
      { id: 'owner-user-1', entityId: otherEntityId },
    ]);

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'calendarEvent',
        faker.string.uuid(),
      ),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should allow a platform administrator to mutate an event owned by the same entity', async () => {
    const {
      service,
      authContext,
      calendarEventRepository,
      associationRepository,
      calendarChannelRepository,
      connectedAccountRepository,
      userWorkspaceRepository,
      workspaceMemberRepository,
      userRepository,
      entityId,
    } = buildServiceContext({
      canAccessFullAdminPanel: true,
    });

    calendarEventRepository.findOne.mockResolvedValue({
      createdBy: {
        workspaceMemberId: faker.string.uuid(),
      },
    });
    associationRepository.find.mockResolvedValue([
      {
        calendarChannelId: 'calendar-channel-1',
      },
    ]);
    calendarChannelRepository.find.mockResolvedValue([
      {
        id: 'calendar-channel-1',
        connectedAccountId: 'connected-account-1',
      },
    ]);
    connectedAccountRepository.find.mockResolvedValue([
      {
        id: 'connected-account-1',
        userWorkspaceId: 'owner-user-workspace-1',
      },
    ]);
    userWorkspaceRepository.find.mockResolvedValue([
      {
        id: 'owner-user-workspace-1',
        userId: 'owner-user-1',
      },
    ]);
    workspaceMemberRepository.find.mockResolvedValue([
      {
        id: 'owner-workspace-member-1',
        userId: 'owner-user-1',
      },
    ]);
    userRepository.find.mockResolvedValue([
      {
        id: 'owner-user-1',
        entityId,
      },
    ]);

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'calendarEvent',
        faker.string.uuid(),
      ),
    ).resolves.toBeUndefined();
  });

  it('should recognize the entity manager role by universal identifier', async () => {
    const {
      service,
      authContext,
      calendarEventRepository,
      associationRepository,
      calendarChannelRepository,
      connectedAccountRepository,
      userWorkspaceRepository,
      workspaceMemberRepository,
      userRepository,
      entityId,
    } = buildServiceContext({
      roleLabel: ENTITY_MANAGER_ROLE_LABEL,
      roleUniversalIdentifier: STANDARD_ROLE.entityManager.universalIdentifier,
    });

    calendarEventRepository.findOne.mockResolvedValue({
      createdBy: {
        workspaceMemberId: faker.string.uuid(),
      },
    });
    associationRepository.find.mockResolvedValue([
      {
        calendarChannelId: 'calendar-channel-1',
      },
    ]);
    calendarChannelRepository.find.mockResolvedValue([
      {
        id: 'calendar-channel-1',
        connectedAccountId: 'connected-account-1',
      },
    ]);
    connectedAccountRepository.find.mockResolvedValue([
      {
        id: 'connected-account-1',
        userWorkspaceId: 'owner-user-workspace-1',
      },
    ]);
    userWorkspaceRepository.find.mockResolvedValue([
      {
        id: 'owner-user-workspace-1',
        userId: 'owner-user-1',
      },
    ]);
    workspaceMemberRepository.find.mockResolvedValue([
      {
        id: 'owner-workspace-member-1',
        userId: 'owner-user-1',
      },
    ]);
    userRepository.find.mockResolvedValue([
      {
        id: 'owner-user-1',
        entityId,
      },
    ]);

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'calendarEvent',
        faker.string.uuid(),
      ),
    ).resolves.toBeUndefined();
  });

  it('should deny a standard user from mutating an event owned by another entity', async () => {
    const {
      service,
      authContext,
      calendarEventRepository,
      associationRepository,
      calendarChannelRepository,
      connectedAccountRepository,
      userWorkspaceRepository,
      workspaceMemberRepository,
      userRepository,
    } = buildServiceContext();

    calendarEventRepository.findOne.mockResolvedValue({
      createdBy: {
        workspaceMemberId: faker.string.uuid(),
      },
    });
    associationRepository.find.mockResolvedValue([
      {
        calendarChannelId: 'calendar-channel-1',
      },
    ]);
    calendarChannelRepository.find.mockResolvedValue([
      {
        id: 'calendar-channel-1',
        connectedAccountId: 'connected-account-1',
      },
    ]);
    connectedAccountRepository.find.mockResolvedValue([
      {
        id: 'connected-account-1',
        userWorkspaceId: 'owner-user-workspace-1',
      },
    ]);
    userWorkspaceRepository.find.mockResolvedValue([
      {
        id: 'owner-user-workspace-1',
        userId: 'owner-user-1',
      },
    ]);
    workspaceMemberRepository.find.mockResolvedValue([
      {
        id: 'owner-workspace-member-1',
        userId: 'owner-user-1',
      },
    ]);
    userRepository.find.mockResolvedValue([
      {
        id: 'owner-user-1',
        entityId: faker.string.uuid(),
      },
    ]);

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'calendarEvent',
        faker.string.uuid(),
      ),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should deny a platform administrator from mutating an event owned by another entity', async () => {
    const {
      service,
      authContext,
      calendarEventRepository,
      associationRepository,
      calendarChannelRepository,
      connectedAccountRepository,
      userWorkspaceRepository,
      workspaceMemberRepository,
      userRepository,
    } = buildServiceContext({
      canAccessFullAdminPanel: true,
    });

    calendarEventRepository.findOne.mockResolvedValue({
      createdBy: {
        workspaceMemberId: faker.string.uuid(),
      },
    });
    associationRepository.find.mockResolvedValue([
      {
        calendarChannelId: 'calendar-channel-1',
      },
    ]);
    calendarChannelRepository.find.mockResolvedValue([
      {
        id: 'calendar-channel-1',
        connectedAccountId: 'connected-account-1',
      },
    ]);
    connectedAccountRepository.find.mockResolvedValue([
      {
        id: 'connected-account-1',
        userWorkspaceId: 'owner-user-workspace-1',
      },
    ]);
    userWorkspaceRepository.find.mockResolvedValue([
      {
        id: 'owner-user-workspace-1',
        userId: 'owner-user-1',
      },
    ]);
    workspaceMemberRepository.find.mockResolvedValue([
      {
        id: 'owner-workspace-member-1',
        userId: 'owner-user-1',
      },
    ]);
    userRepository.find.mockResolvedValue([
      {
        id: 'owner-user-1',
        entityId: faker.string.uuid(),
      },
    ]);

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'calendarEvent',
        faker.string.uuid(),
      ),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should deny creating a calendar link to a standard user even when they own the connected account', async () => {
    const {
      service,
      authContext,
      calendarChannelRepository,
      connectedAccountRepository,
      userWorkspaceId,
    } = buildServiceContext();

    calendarChannelRepository.find.mockResolvedValue([
      {
        id: 'calendar-channel-1',
        connectedAccountId: 'connected-account-1',
      },
    ]);
    connectedAccountRepository.find.mockResolvedValue([
      {
        id: 'connected-account-1',
        userWorkspaceId,
      },
    ]);

    await expect(
      service.validateCreatePayload(
        authContext,
        'calendarChannelEventAssociation',
        {
          data: {
            calendarChannelId: 'calendar-channel-1',
          },
        },
      ),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should allow an entity manager to create a calendar link for an entity they belong to', async () => {
    const {
      service,
      authContext,
      calendarChannelRepository,
      connectedAccountRepository,
      userWorkspaceRepository,
      workspaceMemberRepository,
      userRepository,
      entityId,
    } = buildServiceContext({
      roleLabel: ENTITY_MANAGER_ROLE_LABEL,
    });

    calendarChannelRepository.find.mockResolvedValue([
      {
        id: 'calendar-channel-1',
        connectedAccountId: 'connected-account-1',
      },
    ]);
    connectedAccountRepository.find.mockResolvedValue([
      {
        id: 'connected-account-1',
        userWorkspaceId: 'owner-user-workspace-1',
      },
    ]);
    userWorkspaceRepository.find.mockResolvedValue([
      {
        id: 'owner-user-workspace-1',
        userId: 'owner-user-1',
      },
    ]);
    workspaceMemberRepository.find.mockResolvedValue([
      {
        id: 'owner-workspace-member-1',
        userId: 'owner-user-1',
      },
    ]);
    userRepository.find.mockResolvedValue([
      {
        id: 'owner-user-1',
        entityId,
      },
    ]);

    await expect(
      service.validateCreatePayload(
        authContext,
        'calendarChannelEventAssociation',
        {
          data: {
            calendarChannelId: 'calendar-channel-1',
          },
        },
      ),
    ).resolves.toEqual({
      data: {
        calendarChannelId: 'calendar-channel-1',
      },
    });
  });

  it('should validate calendar link creation when the channel is provided as a relation connect input', async () => {
    const {
      service,
      authContext,
      calendarChannelRepository,
      connectedAccountRepository,
      userWorkspaceRepository,
      workspaceMemberRepository,
      userRepository,
      entityId,
    } = buildServiceContext({
      roleLabel: ENTITY_MANAGER_ROLE_LABEL,
    });

    calendarChannelRepository.find.mockResolvedValue([
      {
        id: 'calendar-channel-1',
        connectedAccountId: 'connected-account-1',
      },
    ]);
    connectedAccountRepository.find.mockResolvedValue([
      {
        id: 'connected-account-1',
        userWorkspaceId: 'owner-user-workspace-1',
      },
    ]);
    userWorkspaceRepository.find.mockResolvedValue([
      {
        id: 'owner-user-workspace-1',
        userId: 'owner-user-1',
      },
    ]);
    workspaceMemberRepository.find.mockResolvedValue([
      {
        id: 'owner-workspace-member-1',
        userId: 'owner-user-1',
      },
    ]);
    userRepository.find.mockResolvedValue([
      {
        id: 'owner-user-1',
        entityId,
      },
    ]);

    await expect(
      service.validateCreatePayload(
        authContext,
        'calendarChannelEventAssociation',
        {
          data: {
            calendarChannel: {
              connect: {
                where: {
                  id: 'calendar-channel-1',
                },
              },
            },
          },
        },
      ),
    ).resolves.toEqual({
      data: {
        calendarChannel: {
          connect: {
            where: {
              id: 'calendar-channel-1',
            },
          },
        },
      },
    });
  });

  // FIX-11 : un payload sans référence extractible ne doit plus sauter la
  // vérification — il est refusé, même pour un entity manager.
  it('should deny creating a calendar link when no channel reference is extractable', async () => {
    const { service, authContext } = buildServiceContext({
      roleLabel: ENTITY_MANAGER_ROLE_LABEL,
    });

    await expect(
      service.validateCreatePayload(
        authContext,
        'calendarChannelEventAssociation',
        {
          data: {
            calendarChannel: { unexpectedShape: true },
          },
        },
      ),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should deny a calendar link batch when one row has no extractable channel reference', async () => {
    const { service, authContext } = buildServiceContext({
      roleLabel: ENTITY_MANAGER_ROLE_LABEL,
    });

    await expect(
      service.validateCreateManyPayload(
        authContext,
        'calendarChannelEventAssociation',
        {
          data: [
            { calendarChannelId: 'calendar-channel-1' },
            { eventExternalId: 'row-without-channel' },
          ],
        },
      ),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should deny creating an event participant when no event reference is extractable', async () => {
    const { service, authContext } = buildServiceContext({
      roleLabel: ENTITY_MANAGER_ROLE_LABEL,
    });

    await expect(
      service.validateCreatePayload(authContext, 'calendarEventParticipant', {
        data: {
          handle: 'someone@example.com',
        },
      }),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should deny an event participant batch when one row has no extractable event reference', async () => {
    const { service, authContext } = buildServiceContext({
      roleLabel: ENTITY_MANAGER_ROLE_LABEL,
    });

    await expect(
      service.validateCreateManyPayload(
        authContext,
        'calendarEventParticipant',
        {
          data: [
            { calendarEventId: 'calendar-event-1' },
            { handle: 'row-without-event@example.com' },
          ],
        },
      ),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should deny creating a calendar event to a standard user', async () => {
    const { service, authContext } = buildServiceContext();

    await expect(
      service.validateCreatePayload(authContext, 'calendarEvent', {
        data: {
          title: 'Weekly sync',
        },
      }),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should allow an entity manager attached to an entity to create a calendar event', async () => {
    const { service, authContext } = buildServiceContext({
      roleLabel: ENTITY_MANAGER_ROLE_LABEL,
    });

    await expect(
      service.validateCreatePayload(authContext, 'calendarEvent', {
        data: {
          title: 'Weekly sync',
        },
      }),
    ).resolves.toEqual({
      data: {
        title: 'Weekly sync',
      },
    });
  });

  it('should deny a platform administrator without entity membership from creating a calendar event', async () => {
    const { service, authContext } = buildServiceContext({
      canAccessFullAdminPanel: true,
      accessibleEntityIds: [],
      activeEntityId: undefined,
    });

    await expect(
      service.validateCreatePayload(authContext, 'calendarEvent', {
        data: {
          title: 'Weekly sync',
        },
      }),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should deny creating an event participant on an event owned by another entity', async () => {
    const {
      service,
      authContext,
      calendarEventRepository,
      associationRepository,
      calendarChannelRepository,
      connectedAccountRepository,
      userWorkspaceRepository,
      workspaceMemberRepository,
      userRepository,
    } = buildServiceContext();

    calendarEventRepository.findOne.mockResolvedValue({
      createdBy: {
        workspaceMemberId: faker.string.uuid(),
      },
    });
    associationRepository.find.mockResolvedValue([
      {
        calendarChannelId: 'calendar-channel-1',
      },
    ]);
    calendarChannelRepository.find.mockResolvedValue([
      {
        id: 'calendar-channel-1',
        connectedAccountId: 'connected-account-1',
      },
    ]);
    connectedAccountRepository.find.mockResolvedValue([
      {
        id: 'connected-account-1',
        userWorkspaceId: 'owner-user-workspace-1',
      },
    ]);
    userWorkspaceRepository.find.mockResolvedValue([
      {
        id: 'owner-user-workspace-1',
        userId: 'owner-user-1',
      },
    ]);
    workspaceMemberRepository.find.mockResolvedValue([
      {
        id: 'owner-workspace-member-1',
        userId: 'owner-user-1',
      },
    ]);
    userRepository.find.mockResolvedValue([
      {
        id: 'owner-user-1',
        entityId: faker.string.uuid(),
      },
    ]);

    await expect(
      service.validateCreatePayload(authContext, 'calendarEventParticipant', {
        data: {
          calendarEventId: faker.string.uuid(),
        },
      }),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should deny creating an event participant on another entity event when the event is provided as a relation connect input', async () => {
    const {
      service,
      authContext,
      calendarEventRepository,
      associationRepository,
      calendarChannelRepository,
      connectedAccountRepository,
      userWorkspaceRepository,
      workspaceMemberRepository,
      userRepository,
    } = buildServiceContext();

    calendarEventRepository.findOne.mockResolvedValue({
      createdBy: {
        workspaceMemberId: faker.string.uuid(),
      },
    });
    associationRepository.find.mockResolvedValue([
      {
        calendarChannelId: 'calendar-channel-1',
      },
    ]);
    calendarChannelRepository.find.mockResolvedValue([
      {
        id: 'calendar-channel-1',
        connectedAccountId: 'connected-account-1',
      },
    ]);
    connectedAccountRepository.find.mockResolvedValue([
      {
        id: 'connected-account-1',
        userWorkspaceId: 'owner-user-workspace-1',
      },
    ]);
    userWorkspaceRepository.find.mockResolvedValue([
      {
        id: 'owner-user-workspace-1',
        userId: 'owner-user-1',
      },
    ]);
    workspaceMemberRepository.find.mockResolvedValue([
      {
        id: 'owner-workspace-member-1',
        userId: 'owner-user-1',
      },
    ]);
    userRepository.find.mockResolvedValue([
      {
        id: 'owner-user-1',
        entityId: faker.string.uuid(),
      },
    ]);

    await expect(
      service.validateCreatePayload(authContext, 'calendarEventParticipant', {
        data: {
          calendarEvent: {
            connect: {
              where: {
                id: faker.string.uuid(),
              },
            },
          },
        },
      }),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should deny bulk mutations to a standard user', async () => {
    const { service, authContext } = buildServiceContext();

    await expect(
      service.assertBulkMutationAllowed(authContext, 'calendarEvent'),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should deny bulk mutations to a platform administrator', async () => {
    const { service, authContext } = buildServiceContext({
      canAccessFullAdminPanel: true,
    });

    await expect(
      service.assertBulkMutationAllowed(authContext, 'calendarEvent'),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  describe('workspace-context wrapping (regression guards)', () => {
    // These tests exercise the real production constraint that calls to
    // `globalWorkspaceOrmManager.getRepository(...)` MUST be wrapped in
    // `executeInWorkspaceContext(...)`. The context-aware mock throws the
    // same error as production whenever the contract is broken, so any
    // future refactor that drops the wrapper around a workspace query
    // (regression of the calendar-event creation crash) will fail here
    // instead of paging us in prod.
    const buildContextAwareService = ({
      roleLabel = ENTITY_MANAGER_ROLE_LABEL,
      roleUniversalIdentifier = STANDARD_ROLE.entityManager.universalIdentifier,
      canAccessFullAdminPanel = false,
    }: {
      roleLabel?: string;
      roleUniversalIdentifier?: string;
      canAccessFullAdminPanel?: boolean;
    } = {}) => {
      const workspaceId = faker.string.uuid();
      const entityId = faker.string.uuid();
      const userId = faker.string.uuid();
      const userWorkspaceId = faker.string.uuid();
      const workspaceMemberId = faker.string.uuid();
      const calendarChannelId = faker.string.uuid();
      const connectedAccountId = faker.string.uuid();
      const ownerUserId = faker.string.uuid();
      const ownerUserWorkspaceId = faker.string.uuid();
      const ownerWorkspaceMemberId = faker.string.uuid();

      const calendarEventRepository = {
        findOne: jest.fn().mockResolvedValue({
          id: faker.string.uuid(),
          createdBy: { workspaceMemberId },
        }),
      };
      const associationRepository = {
        find: jest.fn().mockResolvedValue([{ calendarChannelId }]),
        findOne: jest.fn().mockResolvedValue({ calendarChannelId }),
      };
      const participantRepository = {
        findOne: jest.fn().mockResolvedValue({
          calendarEventId: faker.string.uuid(),
        }),
      };
      const workspaceMemberRepository = {
        find: jest
          .fn()
          .mockResolvedValue([
            { id: ownerWorkspaceMemberId, userId: ownerUserId },
          ]),
      };

      const { manager } = createContextAwareOrmManagerMock({
        repositoryFactory: async (_workspaceId, objectName) => {
          if (objectName === 'calendarEvent') return calendarEventRepository;
          if (objectName === 'calendarChannelEventAssociation')
            return associationRepository;
          if (objectName === 'calendarEventParticipant')
            return participantRepository;
          if (objectName === 'workspaceMember')
            return workspaceMemberRepository;

          return { findOne: jest.fn(), find: jest.fn() };
        },
      });

      const calendarChannelRepository = {
        find: jest
          .fn()
          .mockResolvedValue([{ id: calendarChannelId, connectedAccountId }]),
      };
      const connectedAccountRepository = {
        find: jest
          .fn()
          .mockResolvedValue([
            { id: connectedAccountId, userWorkspaceId: ownerUserWorkspaceId },
          ]),
      };
      const userWorkspaceRepository = {
        find: jest
          .fn()
          .mockResolvedValue([
            { id: ownerUserWorkspaceId, userId: ownerUserId },
          ]),
      };
      const userRepository = {
        find: jest.fn().mockResolvedValue([{ id: ownerUserId, entityId }]),
      };

      const workspaceMemberInternalEntityService = {
        resolveContext: jest.fn().mockResolvedValue({
          currentEntityId: entityId,
          activeEntityId: entityId,
          entityIds: [entityId],
        }),
        resolveContextsByWorkspaceMemberIds: jest.fn().mockImplementation(
          async ({ workspaceMemberIds }: { workspaceMemberIds: string[] }) =>
            new Map(
              workspaceMemberIds.map((id) => [
                id,
                {
                  currentEntityId: entityId,
                  activeEntityId: entityId,
                  entityIds: [entityId],
                },
              ]),
            ),
        ),
      };

      const internalEntityAuditLoggerService = {
        logPermissionDenied: jest.fn(),
      };
      const internalEntityRoleService = {
        isPlatformAdmin: jest.fn().mockResolvedValue(canAccessFullAdminPanel),
        isEntityManager: jest
          .fn()
          .mockResolvedValue(roleLabel === ENTITY_MANAGER_ROLE_LABEL),
        canManageEntityScopedRecords: jest
          .fn()
          .mockResolvedValue(
            canAccessFullAdminPanel || roleLabel === ENTITY_MANAGER_ROLE_LABEL,
          ),
        isInternalEntitySuperAdmin: jest
          .fn()
          .mockReturnValue(canAccessFullAdminPanel),
      };

      const service = new CalendarEventMutationPermissionService(
        manager as unknown as GlobalWorkspaceOrmManager,
        calendarChannelRepository as any,
        connectedAccountRepository as any,
        userWorkspaceRepository as any,
        userRepository as any,
        workspaceMemberInternalEntityService as unknown as WorkspaceMemberInternalEntityService,
        internalEntityAuditLoggerService as unknown as InternalEntityAuditLoggerService,
        internalEntityRoleService as unknown as InternalEntityRoleService,
      );

      const authContext: WorkspaceAuthContext = {
        type: 'user',
        workspace: { id: workspaceId },
        userWorkspaceId,
        workspaceMemberId,
        workspaceMember: { id: workspaceMemberId },
        user: {
          id: userId,
          entityId,
          canAccessFullAdminPanel,
        },
      } as WorkspaceAuthContext;

      return { service, authContext, calendarChannelId };
    };

    it('wraps every workspace query when validating a calendarEvent create', async () => {
      const { service, authContext } = buildContextAwareService();

      await expect(
        service.validateCreatePayload(authContext, 'calendarEvent', {
          data: { title: 'Test' },
        }),
      ).resolves.toBeDefined();
    });

    it('wraps every workspace query when validating a calendarChannelEventAssociation create', async () => {
      const { service, authContext, calendarChannelId } =
        buildContextAwareService();

      await expect(
        service.validateCreatePayload(
          authContext,
          'calendarChannelEventAssociation',
          { data: { calendarChannelId } },
        ),
      ).resolves.toBeDefined();
    });

    it('wraps every workspace query when validating a calendarEventParticipant create', async () => {
      const { service, authContext } = buildContextAwareService();

      await expect(
        service.validateCreatePayload(authContext, 'calendarEventParticipant', {
          data: { calendarEventId: faker.string.uuid() },
        }),
      ).resolves.toBeDefined();
    });

    it('wraps every workspace query when asserting a single mutation on a calendarEvent', async () => {
      const { service, authContext } = buildContextAwareService();

      await expect(
        service.assertSingleMutationAllowed(
          authContext,
          'calendarEvent',
          faker.string.uuid(),
        ),
      ).resolves.toBeUndefined();
    });

    it('wraps every workspace query when asserting a single mutation on a calendarEventParticipant', async () => {
      const { service, authContext } = buildContextAwareService();

      await expect(
        service.assertSingleMutationAllowed(
          authContext,
          'calendarEventParticipant',
          faker.string.uuid(),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('workspace-repository filter syntax (regression guards)', () => {
    // Catches the "invalid input syntax for type uuid: {in:[...]}" crash:
    // workspace repos returned by `globalWorkspaceOrmManager.getRepository`
    // expose TypeORM's `.find()` API, which expects `In(ids)` rather than the
    // GraphQL-style `{ in: ids }` filter object. Using the wrong form
    // serialises the object as a JSON literal in the SQL query.
    it('queries workspace members with a TypeORM In operator (not a raw { in: [...] } filter)', async () => {
      const {
        service,
        authContext,
        calendarEventRepository,
        associationRepository,
        calendarChannelRepository,
        connectedAccountRepository,
        userWorkspaceRepository,
        userRepository,
        workspaceMemberRepository,
      } = buildServiceContext({
        roleLabel: ENTITY_MANAGER_ROLE_LABEL,
        roleUniversalIdentifier:
          STANDARD_ROLE.entityManager.universalIdentifier,
      });

      calendarEventRepository.findOne.mockResolvedValue({
        id: 'calendar-event-1',
      });
      associationRepository.find.mockResolvedValue([
        { calendarChannelId: 'calendar-channel-1' },
      ]);
      calendarChannelRepository.find.mockResolvedValue([
        { id: 'calendar-channel-1', connectedAccountId: 'connected-account-1' },
      ]);
      connectedAccountRepository.find.mockResolvedValue([
        { id: 'connected-account-1', userWorkspaceId: 'user-workspace-1' },
      ]);
      userWorkspaceRepository.find.mockResolvedValue([
        { id: 'user-workspace-1', userId: 'owner-user-1' },
      ]);
      userRepository.find.mockResolvedValue([
        { id: 'owner-user-1', entityId: faker.string.uuid() },
      ]);
      workspaceMemberRepository.find.mockResolvedValue([
        { id: 'workspace-member-1', userId: 'owner-user-1' },
      ]);

      await service
        .assertSingleMutationAllowed(
          authContext,
          'calendarEvent',
          faker.string.uuid(),
        )
        .catch(() => undefined);

      expect(workspaceMemberRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: expect.any(FindOperator),
          }),
        }),
      );
    });
  });

  describe('validateCreateManyPayload', () => {
    it('should deduplicate calendarChannelIds and validate them in a single batch', async () => {
      const {
        service,
        authContext,
        calendarChannelRepository,
        connectedAccountRepository,
        userWorkspaceRepository,
        workspaceMemberRepository,
        userRepository,
        entityId,
      } = buildServiceContext({
        roleLabel: ENTITY_MANAGER_ROLE_LABEL,
      });

      calendarChannelRepository.find.mockResolvedValue([
        {
          id: 'calendar-channel-1',
          connectedAccountId: 'connected-account-1',
        },
      ]);
      connectedAccountRepository.find.mockResolvedValue([
        {
          id: 'connected-account-1',
          userWorkspaceId: 'owner-user-workspace-1',
        },
      ]);
      userWorkspaceRepository.find.mockResolvedValue([
        { id: 'owner-user-workspace-1', userId: 'owner-user-1' },
      ]);
      workspaceMemberRepository.find.mockResolvedValue([
        { id: 'workspace-member-1', userId: 'owner-user-1' },
      ]);
      userRepository.find.mockResolvedValue([{ id: 'owner-user-1', entityId }]);

      await service.validateCreateManyPayload(
        authContext,
        'calendarChannelEventAssociation',
        {
          data: [
            { calendarChannelId: 'calendar-channel-1' },
            { calendarChannelId: 'calendar-channel-1' },
            {
              calendarChannel: { connect: { id: 'calendar-channel-1' } },
            },
          ],
        },
      );

      expect(calendarChannelRepository.find).toHaveBeenCalledTimes(1);
      expect(calendarChannelRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: expect.any(FindOperator),
          }),
        }),
      );
    });
  });
});
