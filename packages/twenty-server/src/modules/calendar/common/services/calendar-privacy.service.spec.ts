import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { CALENDAR_EVENT_SHARING_SCOPE } from 'src/modules/calendar/common/constants/calendar-event-sharing-scope.constants';
import { CalendarPrivacyService } from 'src/modules/calendar/common/services/calendar-privacy.service';

describe('CalendarPrivacyService', () => {
  let service: CalendarPrivacyService;

  const mockCalendarEventAssociationRepository = {
    find: jest.fn(),
  };

  const mockCalendarEventRepository = {
    find: jest.fn(),
  };

  const mockWorkspaceMemberRepository = {
    findOne: jest.fn(),
  };

  const mockCalendarChannelRepository = {
    find: jest.fn(),
  };

  const mockConnectedAccountRepository = {
    find: jest.fn(),
  };

  const mockUserWorkspaceRepository = {
    find: jest.fn(),
  };

  const mockUserRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockGlobalWorkspaceOrmManager = {
    getRepository: jest
      .fn()
      .mockImplementation((_workspaceId, repositoryName) => {
        if (repositoryName === 'calendarChannelEventAssociation') {
          return mockCalendarEventAssociationRepository;
        }

        if (repositoryName === 'calendarEvent') {
          return mockCalendarEventRepository;
        }

        if (repositoryName === 'workspaceMember') {
          return mockWorkspaceMemberRepository;
        }
      }),
    executeInWorkspaceContext: jest
      .fn()
      .mockImplementation((fn: () => any, _authContext?: any) => fn()),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarPrivacyService,
        {
          provide: GlobalWorkspaceOrmManager,
          useValue: mockGlobalWorkspaceOrmManager,
        },
        {
          provide: getRepositoryToken(CalendarChannelEntity),
          useValue: mockCalendarChannelRepository,
        },
        {
          provide: getRepositoryToken(ConnectedAccountEntity),
          useValue: mockConnectedAccountRepository,
        },
        {
          provide: getRepositoryToken(UserWorkspaceEntity),
          useValue: mockUserWorkspaceRepository,
        },
        {
          provide: getRepositoryToken(UserEntity),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get(CalendarPrivacyService);
  });

  it('should not mask a calendar event owned by the same internal entity', async () => {
    mockCalendarEventRepository.find.mockResolvedValue([
      { id: 'calendar-event-1', sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY },
    ]);
    mockCalendarEventAssociationRepository.find.mockResolvedValue([
      { calendarEventId: 'calendar-event-1', calendarChannelId: 'channel-1' },
    ]);
    mockCalendarChannelRepository.find.mockResolvedValue([
      { id: 'channel-1', connectedAccountId: 'connected-account-1' },
    ]);
    mockConnectedAccountRepository.find.mockResolvedValue([
      { id: 'connected-account-1', userWorkspaceId: 'user-workspace-1' },
    ]);
    mockUserWorkspaceRepository.find.mockResolvedValue([
      { id: 'user-workspace-1', userId: 'owner-user-1' },
    ]);
    mockUserRepository.find.mockResolvedValue([
      { id: 'owner-user-1', entityId: 'same-entity-id' },
    ]);

    const result = await service.getCalendarEventMaskMap({
      calendarEventIds: ['calendar-event-1'],
      workspaceId: 'workspace-id',
      currentUserEntityId: 'same-entity-id',
    });

    expect(result.get('calendar-event-1')).toBe(false);
  });

  it('should mask a calendar event owned by another internal entity', async () => {
    mockCalendarEventRepository.find.mockResolvedValue([
      { id: 'calendar-event-1', sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY },
    ]);
    mockCalendarEventAssociationRepository.find.mockResolvedValue([
      { calendarEventId: 'calendar-event-1', calendarChannelId: 'channel-1' },
    ]);
    mockCalendarChannelRepository.find.mockResolvedValue([
      { id: 'channel-1', connectedAccountId: 'connected-account-1' },
    ]);
    mockConnectedAccountRepository.find.mockResolvedValue([
      { id: 'connected-account-1', userWorkspaceId: 'user-workspace-1' },
    ]);
    mockUserWorkspaceRepository.find.mockResolvedValue([
      { id: 'user-workspace-1', userId: 'owner-user-1' },
    ]);
    mockUserRepository.find.mockResolvedValue([
      { id: 'owner-user-1', entityId: 'other-entity-id' },
    ]);

    const result = await service.getCalendarEventMaskMap({
      calendarEventIds: ['calendar-event-1'],
      workspaceId: 'workspace-id',
      currentUserEntityId: 'same-entity-id',
    });

    expect(result.get('calendar-event-1')).toBe(true);
  });

  it('should resolve the requester entity from the current user when entityId is absent from the request context', async () => {
    mockCalendarEventRepository.find.mockResolvedValue([
      { id: 'calendar-event-1', sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY },
    ]);
    mockCalendarEventAssociationRepository.find.mockResolvedValue([
      { calendarEventId: 'calendar-event-1', calendarChannelId: 'channel-1' },
    ]);
    mockCalendarChannelRepository.find.mockResolvedValue([
      { id: 'channel-1', connectedAccountId: 'connected-account-1' },
    ]);
    mockConnectedAccountRepository.find.mockResolvedValue([
      { id: 'connected-account-1', userWorkspaceId: 'user-workspace-1' },
    ]);
    mockUserWorkspaceRepository.find.mockResolvedValue([
      { id: 'user-workspace-1', userId: 'owner-user-1' },
    ]);
    mockUserRepository.find
      .mockResolvedValueOnce([
        { id: 'owner-user-1', entityId: 'same-entity-id' },
      ])
      .mockResolvedValueOnce([
        { id: 'owner-user-1', entityId: 'same-entity-id' },
      ]);
    mockUserRepository.findOne.mockResolvedValue({
      entityId: 'same-entity-id',
    });

    const result = await service.getCalendarEventMaskMap({
      calendarEventIds: ['calendar-event-1'],
      workspaceId: 'workspace-id',
      currentUserId: 'owner-user-1',
    });

    expect(result.get('calendar-event-1')).toBe(false);
  });

  it('should resolve the requester entity from the workspace member when the user entity is absent from the request context', async () => {
    mockCalendarEventRepository.find.mockResolvedValue([
      { id: 'calendar-event-1', sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY },
    ]);
    mockCalendarEventAssociationRepository.find.mockResolvedValue([
      { calendarEventId: 'calendar-event-1', calendarChannelId: 'channel-1' },
    ]);
    mockWorkspaceMemberRepository.findOne.mockResolvedValue({
      userId: 'owner-user-1',
    });
    mockCalendarChannelRepository.find.mockResolvedValue([
      { id: 'channel-1', connectedAccountId: 'connected-account-1' },
    ]);
    mockConnectedAccountRepository.find.mockResolvedValue([
      { id: 'connected-account-1', userWorkspaceId: 'user-workspace-1' },
    ]);
    mockUserWorkspaceRepository.find.mockResolvedValue([
      { id: 'user-workspace-1', userId: 'owner-user-1' },
    ]);
    mockUserRepository.findOne.mockResolvedValue({
      entityId: 'same-entity-id',
    });
    mockUserRepository.find.mockResolvedValue([
      { id: 'owner-user-1', entityId: 'same-entity-id' },
    ]);

    const result = await service.getCalendarEventMaskMap({
      calendarEventIds: ['calendar-event-1'],
      workspaceId: 'workspace-id',
      currentWorkspaceMemberId: 'workspace-member-1',
    });

    expect(result.get('calendar-event-1')).toBe(false);
    expect(mockWorkspaceMemberRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'workspace-member-1' },
      select: { userId: true },
    });
  });

  it('should mask a calendar event when the owner entity cannot be resolved', async () => {
    mockCalendarEventRepository.find.mockResolvedValue([
      { id: 'calendar-event-1', sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY },
    ]);
    mockCalendarEventAssociationRepository.find.mockResolvedValue([
      { calendarEventId: 'calendar-event-1', calendarChannelId: 'channel-1' },
    ]);
    mockCalendarChannelRepository.find.mockResolvedValue([
      { id: 'channel-1', connectedAccountId: 'connected-account-1' },
    ]);
    mockConnectedAccountRepository.find.mockResolvedValue([
      { id: 'connected-account-1', userWorkspaceId: 'user-workspace-1' },
    ]);
    mockUserWorkspaceRepository.find.mockResolvedValue([
      { id: 'user-workspace-1', userId: 'owner-user-1' },
    ]);
    mockUserRepository.find.mockResolvedValue([
      { id: 'owner-user-1', entityId: null },
    ]);

    const result = await service.getCalendarEventMaskMap({
      calendarEventIds: ['calendar-event-1'],
      workspaceId: 'workspace-id',
      currentUserEntityId: 'same-entity-id',
    });

    expect(result.get('calendar-event-1')).toBe(true);
  });

  it('should mask all calendar events when requester identity is present but requester entity cannot be resolved', async () => {
    mockCalendarEventRepository.find.mockResolvedValue([
      { id: 'calendar-event-1', sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY },
      { id: 'calendar-event-2', sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY },
    ]);
    mockUserRepository.findOne.mockResolvedValue(null);

    const result = await service.getCalendarEventMaskMap({
      calendarEventIds: ['calendar-event-1', 'calendar-event-2'],
      workspaceId: 'workspace-id',
      currentUserId: 'request-user-1',
    });

    expect(result).toEqual(
      new Map([
        ['calendar-event-1', true],
        ['calendar-event-2', true],
      ]),
    );
  });

  it('should keep calendar events unmasked when requester identity is absent', async () => {
    mockCalendarEventRepository.find.mockResolvedValue([
      { id: 'calendar-event-1', sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY },
      { id: 'calendar-event-2', sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY },
    ]);
    const result = await service.getCalendarEventMaskMap({
      calendarEventIds: ['calendar-event-1', 'calendar-event-2'],
      workspaceId: 'workspace-id',
    });

    expect(result).toEqual(
      new Map([
        ['calendar-event-1', false],
        ['calendar-event-2', false],
      ]),
    );
  });

  it('should not mask a workspace public calendar event outside the entity', async () => {
    mockCalendarEventRepository.find.mockResolvedValue([
      {
        id: 'calendar-event-1',
        sharingScope: CALENDAR_EVENT_SHARING_SCOPE.WORKSPACE_PUBLIC,
      },
    ]);
    mockCalendarEventAssociationRepository.find.mockResolvedValue([
      { calendarEventId: 'calendar-event-1', calendarChannelId: 'channel-1' },
    ]);
    mockCalendarChannelRepository.find.mockResolvedValue([
      { id: 'channel-1', connectedAccountId: 'connected-account-1' },
    ]);
    mockConnectedAccountRepository.find.mockResolvedValue([
      { id: 'connected-account-1', userWorkspaceId: 'user-workspace-1' },
    ]);
    mockUserWorkspaceRepository.find.mockResolvedValue([
      { id: 'user-workspace-1', userId: 'owner-user-1' },
    ]);
    mockUserRepository.find.mockResolvedValue([
      { id: 'owner-user-1', entityId: 'other-entity-id' },
    ]);

    const result = await service.getCalendarEventMaskMap({
      calendarEventIds: ['calendar-event-1'],
      workspaceId: 'workspace-id',
      currentUserEntityId: 'same-entity-id',
    });

    expect(result.get('calendar-event-1')).toBe(false);
  });

  it('should keep a workspace public calendar event visible when requester entity cannot be resolved', async () => {
    mockCalendarEventRepository.find.mockResolvedValue([
      {
        id: 'calendar-event-1',
        sharingScope: CALENDAR_EVENT_SHARING_SCOPE.WORKSPACE_PUBLIC,
      },
      {
        id: 'calendar-event-2',
        sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY,
      },
    ]);
    mockUserRepository.findOne.mockResolvedValue(null);

    const result = await service.getCalendarEventMaskMap({
      calendarEventIds: ['calendar-event-1', 'calendar-event-2'],
      workspaceId: 'workspace-id',
      currentUserId: 'request-user-1',
    });

    expect(result).toEqual(
      new Map([
        ['calendar-event-1', false],
        ['calendar-event-2', true],
      ]),
    );
  });
});
