import { faker } from '@faker-js/faker';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { PermissionsExceptionCode } from 'src/engine/metadata-modules/permissions/permissions.exception';
import { type UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { ENTITY_MANAGER_ROLE_LABEL } from 'src/modules/internal-entity/query-hooks/constants/internal-entity-access.constants';
import { CalendarEventMutationPermissionService } from 'src/modules/calendar/common/query-hooks/calendar-event/services/calendar-event-mutation-permission.service';

const buildServiceContext = ({
  roleLabel,
  roleUniversalIdentifier,
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
  const globalWorkspaceOrmManager = {
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

  const service = new CalendarEventMutationPermissionService(
    globalWorkspaceOrmManager as unknown as GlobalWorkspaceOrmManager,
    userRoleService as unknown as UserRoleService,
    calendarChannelRepository as any,
    connectedAccountRepository as any,
    userWorkspaceRepository as any,
    userRepository as any,
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
  it('should allow the author to mutate their own calendar event', async () => {
    const { service, authContext, calendarEventRepository, workspaceMemberId } =
      buildServiceContext();

    calendarEventRepository.findOne.mockResolvedValue({
      createdBy: {
        workspaceMemberId,
      },
    });

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'calendarEvent',
        faker.string.uuid(),
      ),
    ).resolves.toBeUndefined();
  });

  it('should allow the owner of the connected account to mutate the calendar event', async () => {
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
    ).resolves.toBeUndefined();
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
      userRepository,
      entityId,
    } = buildServiceContext({
      roleLabel: ENTITY_MANAGER_ROLE_LABEL,
      roleUniversalIdentifier:
        STANDARD_ROLE.entityManager.universalIdentifier,
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

  it('should allow creating a calendar link on a connected account owned by the requester', async () => {
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
      service.validateCreatePayload(authContext, 'calendarChannelEventAssociation', {
        data: {
          calendarChannelId: 'calendar-channel-1',
        },
      }),
    ).resolves.toEqual({
      data: {
        calendarChannelId: 'calendar-channel-1',
      },
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

  it('should allow bulk mutations to a superadmin', async () => {
    const { service, authContext } = buildServiceContext({
      canAccessFullAdminPanel: true,
    });

    await expect(
      service.assertBulkMutationAllowed(authContext, 'calendarEvent'),
    ).resolves.toBeUndefined();
  });
});
