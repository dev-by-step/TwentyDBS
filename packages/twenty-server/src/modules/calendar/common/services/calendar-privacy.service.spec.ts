import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FindOperator } from 'typeorm';

import { createContextAwareOrmManagerMock } from 'src/engine/twenty-orm/global-workspace-datasource/__test-utils__/create-context-aware-orm-manager-mock';

import { type TimelineCalendarEventDTO } from 'src/engine/core-modules/calendar/dtos/timeline-calendar-event.dto';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { CALENDAR_EVENT_SHARING_SCOPE } from 'src/modules/calendar/common/constants/calendar-event-sharing-scope.constants';
import { CALENDAR_PRIVACY_OCCUPIED_TITLE } from 'src/modules/calendar/common/constants/calendar-privacy.constants';
import { CalendarPrivacyService } from 'src/modules/calendar/common/services/calendar-privacy.service';
import { type CalendarEventWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-event.workspace-entity';
import { WorkspaceMemberInternalEntityService } from 'src/modules/internal-entity/services/workspace-member-internal-entity.service';

describe('CalendarPrivacyService', () => {
  let service: CalendarPrivacyService;

  type ResolveContextResult = {
    currentEntityId: string | null;
    activeEntityId: string | null;
    entityIds: string[];
  };

  const defaultResolveContextImplementation = async ({
    fallbackEntityId,
    workspaceMemberId,
  }: {
    fallbackEntityId?: string | null;
    workspaceMemberId?: string;
  }): Promise<ResolveContextResult> => {
    const resolvedEntityId =
      fallbackEntityId ??
      (workspaceMemberId === 'workspace-member-1' ? 'same-entity-id' : null);

    return {
      currentEntityId: resolvedEntityId,
      activeEntityId: resolvedEntityId,
      entityIds: resolvedEntityId ? [resolvedEntityId] : [],
    };
  };

  const mockCalendarEventAssociationRepository = {
    find: jest.fn(),
  };

  const mockCalendarEventRepository = {
    find: jest.fn(),
  };

  const mockWorkspaceMemberRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
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

  const mockCalendarEventEntityAudienceRepository = {
    find: jest.fn().mockResolvedValue([]),
  };

  const mockCalendarEventPersonAudienceRepository = {
    find: jest.fn().mockResolvedValue([]),
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

        if (repositoryName === 'calendarEventEntityAudience') {
          return mockCalendarEventEntityAudienceRepository;
        }

        if (repositoryName === 'calendarEventPersonAudience') {
          return mockCalendarEventPersonAudienceRepository;
        }
      }),
    executeInWorkspaceContext: jest
      .fn()
      .mockImplementation((fn: () => any, _authContext?: any) => fn()),
  };
  const mockWorkspaceMemberInternalEntityService: {
    resolveContext: jest.MockedFunction<
      typeof defaultResolveContextImplementation
    >;
    resolveContextsByWorkspaceMemberIds: jest.Mock;
  } = {
    resolveContext: jest.fn(defaultResolveContextImplementation),
    resolveContextsByWorkspaceMemberIds: jest.fn(),
  };

  const defaultResolveContextsImplementation = async ({
    workspaceMemberIds,
    fallbackEntityIdByWorkspaceMemberId,
  }: {
    workspaceMemberIds: string[];
    fallbackEntityIdByWorkspaceMemberId?: ReadonlyMap<string, string | null>;
  }): Promise<Map<string, ResolveContextResult>> => {
    const entries = await Promise.all(
      workspaceMemberIds.map(async (workspaceMemberId) => [
        workspaceMemberId,
        await mockWorkspaceMemberInternalEntityService.resolveContext({
          workspaceMemberId,
          fallbackEntityId:
            fallbackEntityIdByWorkspaceMemberId?.get(workspaceMemberId),
        }),
      ]),
    );

    return new Map(entries as [string, ResolveContextResult][]);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockWorkspaceMemberInternalEntityService.resolveContext.mockImplementation(
      defaultResolveContextImplementation,
    );
    mockWorkspaceMemberInternalEntityService.resolveContextsByWorkspaceMemberIds.mockImplementation(
      defaultResolveContextsImplementation,
    );
    mockWorkspaceMemberRepository.find.mockResolvedValue([]);
    mockCalendarEventEntityAudienceRepository.find.mockResolvedValue([]);
    mockCalendarEventPersonAudienceRepository.find.mockResolvedValue([]);

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
        {
          provide: WorkspaceMemberInternalEntityService,
          useValue: mockWorkspaceMemberInternalEntityService,
        },
      ],
    }).compile();

    service = module.get(CalendarPrivacyService);
  });

  it('should not mask a calendar event owned by the same internal entity', async () => {
    mockCalendarEventRepository.find.mockResolvedValue([
      {
        id: 'calendar-event-1',
        sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY,
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
    mockWorkspaceMemberRepository.find.mockResolvedValue([
      { id: 'workspace-member-unresolved', userId: 'owner-user-1' },
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
      {
        id: 'calendar-event-1',
        sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY,
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
    mockWorkspaceMemberRepository.find.mockResolvedValue([
      { id: 'workspace-member-unresolved', userId: 'owner-user-1' },
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

  it('should not mask a calendar event owned by another accessible internal entity', async () => {
    mockWorkspaceMemberInternalEntityService.resolveContext.mockResolvedValue({
      currentEntityId: 'same-entity-id',
      activeEntityId: 'same-entity-id',
      entityIds: ['same-entity-id', 'other-entity-id'],
    });
    mockCalendarEventRepository.find.mockResolvedValue([
      {
        id: 'calendar-event-1',
        sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY,
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
    mockWorkspaceMemberRepository.find.mockResolvedValue([
      { id: 'workspace-member-unresolved', userId: 'owner-user-1' },
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

  it('should not mask a calendar event when the imported calendar is visible to the requester entity', async () => {
    mockCalendarEventRepository.find.mockResolvedValue([
      {
        id: 'calendar-event-1',
        sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY,
      },
    ]);
    mockCalendarEventAssociationRepository.find.mockResolvedValue([
      { calendarEventId: 'calendar-event-1', calendarChannelId: 'channel-1' },
    ]);
    mockCalendarChannelRepository.find.mockResolvedValue([
      {
        id: 'channel-1',
        connectedAccountId: 'connected-account-1',
        visibleInternalEntityIds: [' SAME-ENTITY-ID '],
      },
    ]);
    mockConnectedAccountRepository.find.mockResolvedValue([
      { id: 'connected-account-1', userWorkspaceId: 'user-workspace-1' },
    ]);
    mockUserWorkspaceRepository.find.mockResolvedValue([
      { id: 'user-workspace-1', userId: 'owner-user-1' },
    ]);
    mockWorkspaceMemberRepository.find.mockResolvedValue([
      { id: 'workspace-member-unresolved', userId: 'owner-user-1' },
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

  it('should normalize explicit entity audience ids before comparing with requester entities', async () => {
    mockCalendarEventRepository.find.mockResolvedValue([
      {
        id: 'calendar-event-1',
        sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY,
      },
    ]);
    mockCalendarEventEntityAudienceRepository.find.mockResolvedValue([
      {
        calendarEventId: 'calendar-event-1',
        internalEntityId: ' SAME-ENTITY-ID ',
      },
    ]);

    const result = await service.getCalendarEventMaskMap({
      calendarEventIds: ['calendar-event-1'],
      workspaceId: 'workspace-id',
      currentUserEntityId: 'same-entity-id',
    });

    expect(result.get('calendar-event-1')).toBe(false);
  });

  it('should keep owner-entity visibility when imported calendar visibility targets another entity', async () => {
    mockWorkspaceMemberInternalEntityService.resolveContext.mockResolvedValue({
      currentEntityId: 'same-entity-id',
      activeEntityId: 'same-entity-id',
      entityIds: ['same-entity-id', 'owner-entity-id'],
    });
    mockCalendarEventRepository.find.mockResolvedValue([
      {
        id: 'calendar-event-1',
        sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY,
      },
    ]);
    mockCalendarEventAssociationRepository.find.mockResolvedValue([
      { calendarEventId: 'calendar-event-1', calendarChannelId: 'channel-1' },
    ]);
    mockCalendarChannelRepository.find.mockResolvedValue([
      {
        id: 'channel-1',
        connectedAccountId: 'connected-account-1',
        visibleInternalEntityIds: ['explicit-entity-id'],
      },
    ]);
    mockConnectedAccountRepository.find.mockResolvedValue([
      { id: 'connected-account-1', userWorkspaceId: 'user-workspace-1' },
    ]);
    mockUserWorkspaceRepository.find.mockResolvedValue([
      { id: 'user-workspace-1', userId: 'owner-user-1' },
    ]);
    mockWorkspaceMemberRepository.find.mockResolvedValue([
      { id: 'workspace-member-unresolved', userId: 'owner-user-1' },
    ]);
    mockUserRepository.find.mockResolvedValue([
      { id: 'owner-user-1', entityId: 'owner-entity-id' },
    ]);

    const result = await service.getCalendarEventMaskMap({
      calendarEventIds: ['calendar-event-1'],
      workspaceId: 'workspace-id',
      currentUserEntityId: 'same-entity-id',
    });

    expect(result.get('calendar-event-1')).toBe(false);
  });

  it('should resolve the requester entity from the current user when entityId is absent from the request context', async () => {
    mockCalendarEventRepository.find.mockResolvedValue([
      {
        id: 'calendar-event-1',
        sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY,
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
    mockWorkspaceMemberRepository.find.mockResolvedValue([
      { id: 'workspace-member-1', userId: 'owner-user-1' },
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

  it('should query workspace members with a TypeORM In operator', async () => {
    mockCalendarEventRepository.find.mockResolvedValue([
      {
        id: 'calendar-event-1',
        sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY,
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
      { id: 'owner-user-1', entityId: 'same-entity-id' },
    ]);
    mockWorkspaceMemberRepository.find.mockResolvedValue([
      { id: 'workspace-member-unresolved', userId: 'owner-user-1' },
    ]);

    await service.getCalendarEventMaskMap({
      calendarEventIds: ['calendar-event-1'],
      workspaceId: 'workspace-id',
      currentUserEntityId: 'same-entity-id',
    });

    expect(mockWorkspaceMemberRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: expect.any(FindOperator),
        }),
      }),
    );
  });

  it('should resolve the requester entity from the workspace member when the user entity is absent from the request context', async () => {
    mockCalendarEventRepository.find.mockResolvedValue([
      {
        id: 'calendar-event-1',
        sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY,
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
    mockWorkspaceMemberRepository.find.mockResolvedValue([
      { id: 'workspace-member-1', userId: 'owner-user-1' },
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
  });

  it('should mask a calendar event when the owner entity cannot be resolved', async () => {
    mockCalendarEventRepository.find.mockResolvedValue([
      {
        id: 'calendar-event-1',
        sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY,
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
    mockWorkspaceMemberRepository.find.mockResolvedValue([
      { id: 'workspace-member-unresolved', userId: 'owner-user-1' },
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
      {
        id: 'calendar-event-1',
        sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY,
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
        ['calendar-event-1', true],
        ['calendar-event-2', true],
      ]),
    );
  });

  it('should keep calendar events unmasked when requester identity is absent', async () => {
    mockCalendarEventRepository.find.mockResolvedValue([
      {
        id: 'calendar-event-1',
        sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY,
      },
      {
        id: 'calendar-event-2',
        sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY,
      },
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
    mockWorkspaceMemberRepository.find.mockResolvedValue([
      { id: 'workspace-member-1', userId: 'owner-user-1' },
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

  it('should not mask a calendar event when the requester workspace member is in the person audience', async () => {
    mockCalendarEventRepository.find.mockResolvedValue([
      {
        id: 'calendar-event-1',
        sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY,
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
    mockWorkspaceMemberRepository.find.mockResolvedValue([
      { id: 'workspace-member-1', userId: 'owner-user-1' },
    ]);
    mockUserRepository.find.mockResolvedValue([
      { id: 'owner-user-1', entityId: 'other-entity-id' },
    ]);
    mockCalendarEventPersonAudienceRepository.find.mockResolvedValue([
      {
        calendarEventId: 'calendar-event-1',
        workspaceMemberId: 'workspace-member-guest',
      },
    ]);

    const result = await service.getCalendarEventMaskMap({
      calendarEventIds: ['calendar-event-1'],
      workspaceId: 'workspace-id',
      currentUserEntityId: 'same-entity-id',
      currentWorkspaceMemberId: 'workspace-member-guest',
    });

    expect(result.get('calendar-event-1')).toBe(false);
  });

  it('should mask a cross-entity calendar event when the requester is not in the person audience', async () => {
    mockCalendarEventRepository.find.mockResolvedValue([
      {
        id: 'calendar-event-1',
        sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY,
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
    mockWorkspaceMemberRepository.find.mockResolvedValue([
      { id: 'workspace-member-1', userId: 'owner-user-1' },
    ]);
    mockUserRepository.find.mockResolvedValue([
      { id: 'owner-user-1', entityId: 'other-entity-id' },
    ]);
    mockCalendarEventPersonAudienceRepository.find.mockResolvedValue([
      {
        calendarEventId: 'calendar-event-1',
        workspaceMemberId: 'workspace-member-allowed',
      },
    ]);

    const result = await service.getCalendarEventMaskMap({
      calendarEventIds: ['calendar-event-1'],
      workspaceId: 'workspace-id',
      currentUserEntityId: 'same-entity-id',
      currentWorkspaceMemberId: 'workspace-member-other',
    });

    expect(result.get('calendar-event-1')).toBe(true);
  });

  it('should mask an owner-entity member when an explicit event audience targets other entities', async () => {
    mockCalendarEventRepository.find.mockResolvedValue([
      {
        id: 'calendar-event-1',
        sharingScope: CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY,
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
    mockWorkspaceMemberRepository.find.mockResolvedValue([
      { id: 'workspace-member-1', userId: 'owner-user-1' },
    ]);
    mockUserRepository.find.mockResolvedValue([
      { id: 'owner-user-1', entityId: 'same-entity-id' },
    ]);
    mockCalendarEventEntityAudienceRepository.find.mockResolvedValue([
      {
        calendarEventId: 'calendar-event-1',
        internalEntityId: 'other-entity-id',
      },
    ]);

    const result = await service.getCalendarEventMaskMap({
      calendarEventIds: ['calendar-event-1'],
      workspaceId: 'workspace-id',
      currentUserEntityId: 'same-entity-id',
    });

    expect(result.get('calendar-event-1')).toBe(true);
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

  describe('applyInternalEntityPrivacyToTimelineCalendarEvents', () => {
    const buildTimelineCalendarEvent = (
      overrides: Partial<TimelineCalendarEventDTO> = {},
    ): TimelineCalendarEventDTO =>
      ({
        id: 'calendar-event-1',
        title: 'Sensitive client meeting',
        isCanceled: false,
        isFullDay: false,
        startsAt: new Date('2026-05-17T09:00:00Z'),
        endsAt: new Date('2026-05-17T10:00:00Z'),
        description: 'Strategic discussion',
        location: 'HQ — Floor 4',
        conferenceSolution: 'google-meet',
        conferenceLink: {
          primaryLinkLabel: 'Join',
          primaryLinkUrl: 'https://example.com/join',
          secondaryLinks: null,
        },
        participants: [],
        visibility: 'SHARE_EVERYTHING',
        entityColor: '#FF0000',
        ...overrides,
      }) as TimelineCalendarEventDTO;

    it('redacts every entity-identifying field on masked events', () => {
      const event = buildTimelineCalendarEvent();

      service.applyInternalEntityPrivacyToTimelineCalendarEvents(
        [event],
        new Map([[event.id, true]]),
      );

      expect(event).toMatchObject({
        title: CALENDAR_PRIVACY_OCCUPIED_TITLE,
        description: null,
        location: null,
        conferenceSolution: null,
        conferenceLink: null,
        participants: null,
        entityColor: '#FF0000',
      });
    });

    it('leaves events untouched when not flagged in the mask map', () => {
      const event = buildTimelineCalendarEvent();
      const snapshot = { ...event };

      service.applyInternalEntityPrivacyToTimelineCalendarEvents(
        [event],
        new Map([[event.id, false]]),
      );

      expect(event).toEqual(snapshot);
    });

    it('leaves events untouched when missing from the mask map', () => {
      const event = buildTimelineCalendarEvent();
      const snapshot = { ...event };

      service.applyInternalEntityPrivacyToTimelineCalendarEvents(
        [event],
        new Map(),
      );

      expect(event).toEqual(snapshot);
    });
  });

  describe('applyInternalEntityPrivacyToWorkspaceCalendarEvents', () => {
    const buildWorkspaceCalendarEvent = (
      overrides: Partial<CalendarEventWorkspaceEntity> = {},
    ): CalendarEventWorkspaceEntity =>
      ({
        id: 'calendar-event-1',
        title: 'Sensitive client meeting',
        description: 'Strategic discussion',
        location: 'HQ — Floor 4',
        conferenceSolution: 'google-meet',
        conferenceLink: {
          primaryLinkLabel: 'Join',
          primaryLinkUrl: 'https://example.com/join',
          secondaryLinks: null,
        },
        calendarEventParticipants: [{ id: 'participant-1' }],
        ...overrides,
      }) as unknown as CalendarEventWorkspaceEntity;

    it('redacts every entity-identifying field on masked events', () => {
      const event = buildWorkspaceCalendarEvent();

      service.applyInternalEntityPrivacyToWorkspaceCalendarEvents(
        [event],
        new Map([[event.id, true]]),
      );

      expect(event).toMatchObject({
        title: CALENDAR_PRIVACY_OCCUPIED_TITLE,
        description: null,
        location: null,
        conferenceSolution: null,
        calendarEventParticipants: [],
        conferenceLink: {
          primaryLinkLabel: '',
          primaryLinkUrl: '',
          secondaryLinks: null,
        },
      });
    });

    it('leaves events untouched when not flagged in the mask map', () => {
      const event = buildWorkspaceCalendarEvent();
      const snapshot = { ...event };

      service.applyInternalEntityPrivacyToWorkspaceCalendarEvents(
        [event],
        new Map([[event.id, false]]),
      );

      expect(event).toEqual(snapshot);
    });
  });

  describe('workspace-context wrapping (regression guards)', () => {
    // Same intent as the mutation-permission spec: rebuild the service with a
    // context-aware orm manager that throws when `getRepository` is called
    // outside `executeInWorkspaceContext`. Catches regressions of the
    // "Workspace context not set" runtime crash early.
    const buildContextAwareService = async () => {
      const calendarChannelEventAssociationRepository = {
        find: jest.fn().mockResolvedValue([]),
      };
      const calendarEventRepository = {
        find: jest.fn().mockResolvedValue([
          {
            id: 'calendar-event-1',
            sharingScope: 'ENTITY_ONLY',
          },
        ]),
      };
      const workspaceMemberRepository = {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(null),
      };
      const calendarEventEntityAudienceRepository = {
        find: jest.fn().mockResolvedValue([]),
      };
      const calendarEventPersonAudienceRepository = {
        find: jest.fn().mockResolvedValue([]),
      };

      const { manager } = createContextAwareOrmManagerMock({
        repositoryFactory: async (_workspaceId, repositoryName) => {
          if (repositoryName === 'calendarChannelEventAssociation')
            return calendarChannelEventAssociationRepository;
          if (repositoryName === 'calendarEvent')
            return calendarEventRepository;
          if (repositoryName === 'workspaceMember')
            return workspaceMemberRepository;
          if (repositoryName === 'calendarEventEntityAudience')
            return calendarEventEntityAudienceRepository;
          if (repositoryName === 'calendarEventPersonAudience')
            return calendarEventPersonAudienceRepository;

          return { find: jest.fn().mockResolvedValue([]) };
        },
      });

      const calendarChannelRepository = {
        find: jest.fn().mockResolvedValue([]),
      };
      const connectedAccountRepository = {
        find: jest.fn().mockResolvedValue([]),
      };
      const userWorkspaceRepository = { find: jest.fn().mockResolvedValue([]) };
      const userRepository = {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue({ entityId: 'same-entity-id' }),
      };
      const workspaceMemberInternalEntityService = {
        resolveContext: jest.fn().mockResolvedValue({
          currentEntityId: 'same-entity-id',
          activeEntityId: 'same-entity-id',
          entityIds: ['same-entity-id'],
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CalendarPrivacyService,
          {
            provide: GlobalWorkspaceOrmManager,
            useValue: manager,
          },
          {
            provide: getRepositoryToken(CalendarChannelEntity),
            useValue: calendarChannelRepository,
          },
          {
            provide: getRepositoryToken(ConnectedAccountEntity),
            useValue: connectedAccountRepository,
          },
          {
            provide: getRepositoryToken(UserWorkspaceEntity),
            useValue: userWorkspaceRepository,
          },
          {
            provide: getRepositoryToken(UserEntity),
            useValue: userRepository,
          },
          {
            provide: WorkspaceMemberInternalEntityService,
            useValue: workspaceMemberInternalEntityService,
          },
        ],
      }).compile();

      const service = module.get(CalendarPrivacyService);

      return { service };
    };

    it('keeps every workspace query inside executeInWorkspaceContext when masking events', async () => {
      const { service } = await buildContextAwareService();

      await expect(
        service.getCalendarEventMaskMap({
          calendarEventIds: ['calendar-event-1'],
          workspaceId: 'workspace-id',
          currentUserEntityId: 'same-entity-id',
        }),
      ).resolves.toBeInstanceOf(Map);
    });

    it('keeps every workspace query inside executeInWorkspaceContext when called with no calendar event ids', async () => {
      const { service } = await buildContextAwareService();

      await expect(
        service.getCalendarEventMaskMap({
          calendarEventIds: [],
          workspaceId: 'workspace-id',
        }),
      ).resolves.toBeInstanceOf(Map);
    });
  });
});
