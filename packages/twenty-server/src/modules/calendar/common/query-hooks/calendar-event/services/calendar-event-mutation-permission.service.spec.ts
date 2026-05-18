import { faker } from '@faker-js/faker';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { PermissionsExceptionCode } from 'src/engine/metadata-modules/permissions/permissions.exception';
import { type UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
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

  const userRoleService = {
    getRolesByUserWorkspaces: jest.fn().mockResolvedValue(
      new Map([
        [
          userWorkspaceId,
          roleLabel
            ? [
                {
                  label: roleLabel,
                  universalIdentifier:
                    roleUniversalIdentifier ?? faker.string.uuid(),
                },
              ]
            : [],
        ],
      ]),
    ),
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
    userRoleService as unknown as UserRoleService,
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
});
