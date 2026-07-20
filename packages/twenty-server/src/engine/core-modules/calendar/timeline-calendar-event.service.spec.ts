import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';

import { CalendarChannelVisibility } from 'twenty-shared/types';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace.repository';
import { CalendarPrivacyService } from 'src/modules/calendar/common/services/calendar-privacy.service';
import { type CalendarEventWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-event.workspace-entity';
import { WorkspaceMemberInternalEntityService } from 'src/modules/internal-entity/services/workspace-member-internal-entity.service';

import { TimelineCalendarEventService } from './timeline-calendar-event.service';

type MockWorkspaceRepository = Partial<
  WorkspaceRepository<CalendarEventWorkspaceEntity>
> & {
  count?: jest.Mock;
  find: jest.Mock;
  findAndCount: jest.Mock;
};

describe('TimelineCalendarEventService', () => {
  let service: TimelineCalendarEventService;
  let mockCalendarEventRepository: MockWorkspaceRepository;
  let mockCalendarChannelCoreRepository: { find: jest.Mock };
  let mockConnectedAccountRepository: { find: jest.Mock };
  let mockUserRepository: { find: jest.Mock };
  let mockUserWorkspaceRepository: { findOne: jest.Mock; find: jest.Mock };
  let mockInternalEntityRepository: { find: jest.Mock };
  let mockWorkspaceMemberRepository: { findOne: jest.Mock; find: jest.Mock };
  let mockCalendarPrivacyService: {
    getCalendarEventMaskMap: jest.Mock;
  };
  let mockWorkspaceMemberInternalEntityService: {
    resolveContextsByWorkspaceMemberIds: jest.Mock;
  };

  const mockCalendarEvent: Partial<CalendarEventWorkspaceEntity> = {
    id: '1',
    title: 'Test Event',
    description: 'Test Description',
    startsAt: '2024-01-01T00:00:00.000Z',
    endsAt: '2024-01-01T01:00:00.000Z',
    calendarEventParticipants: [],
    calendarChannelEventAssociations: [],
  };

  beforeEach(async () => {
    mockCalendarEventRepository = {
      count: jest.fn().mockResolvedValue(1),
      find: jest.fn(),
      findAndCount: jest.fn(),
    };

    mockConnectedAccountRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    mockUserRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    mockCalendarChannelCoreRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    mockUserWorkspaceRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
    };

    mockInternalEntityRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    mockWorkspaceMemberRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
    };

    mockCalendarPrivacyService = {
      getCalendarEventMaskMap: jest
        .fn()
        .mockResolvedValue(new Map([['1', false]])),
    };

    mockWorkspaceMemberInternalEntityService = {
      resolveContextsByWorkspaceMemberIds: jest
        .fn()
        .mockResolvedValue(new Map()),
    };

    const mockGlobalWorkspaceOrmManager = {
      getRepository: jest
        .fn()
        .mockImplementation((_workspaceId, entityName) => {
          if (entityName === 'workspaceMember') {
            return Promise.resolve(mockWorkspaceMemberRepository);
          }

          if (entityName === 'internalEntity') {
            return Promise.resolve(mockInternalEntityRepository);
          }

          return Promise.resolve(mockCalendarEventRepository);
        }),
      executeInWorkspaceContext: jest
        .fn()
        .mockImplementation((fn: () => any, _authContext?: any) => fn()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimelineCalendarEventService,
        {
          provide: GlobalWorkspaceOrmManager,
          useValue: mockGlobalWorkspaceOrmManager,
        },
        {
          provide: getRepositoryToken(CalendarChannelEntity),
          useValue: mockCalendarChannelCoreRepository,
        },
        {
          provide: getRepositoryToken(ConnectedAccountEntity),
          useValue: mockConnectedAccountRepository,
        },
        {
          provide: getRepositoryToken(UserEntity),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(UserWorkspaceEntity),
          useValue: mockUserWorkspaceRepository,
        },
        {
          provide: CalendarPrivacyService,
          useValue: mockCalendarPrivacyService,
        },
        {
          provide: WorkspaceMemberInternalEntityService,
          useValue: mockWorkspaceMemberInternalEntityService,
        },
      ],
    }).compile();

    service = module.get<TimelineCalendarEventService>(
      TimelineCalendarEventService,
    );
  });

  it('should return non-obfuscated calendar events if visibility is SHARE_EVERYTHING', async () => {
    const currentWorkspaceMemberId = 'current-workspace-member-id';
    const personIds = ['person-1'];

    mockCalendarEventRepository.count = jest.fn().mockResolvedValue(1);
    mockCalendarEventRepository.find
      .mockResolvedValueOnce([{ id: '1' }])
      .mockResolvedValueOnce([
        {
          ...mockCalendarEvent,
          calendarChannelEventAssociations: [
            { calendarChannelId: 'channel-1' },
          ],
        },
      ]);
    mockCalendarChannelCoreRepository.find.mockResolvedValue([
      {
        id: 'channel-1',
        visibility: CalendarChannelVisibility.SHARE_EVERYTHING,
        connectedAccountId: 'connected-account-1',
      },
    ]);
    // Ownership doesn't matter for SHARE_EVERYTHING
    mockWorkspaceMemberRepository.findOne.mockResolvedValue(null);

    const result = await service.getCalendarEventsFromPersonIds({
      currentWorkspaceMemberId,
      personIds,
      workspaceId: 'test-workspace-id',
      page: 1,
      pageSize: 10,
    });

    expect(result.timelineCalendarEvents[0].title).toBe('Test Event');
    expect(result.timelineCalendarEvents[0].description).toBe(
      'Test Description',
    );
  });

  it('should return obfuscated calendar events if cross-entity privacy masks it', async () => {
    const currentWorkspaceMemberId = 'current-workspace-member-id';
    const personIds = ['person-1'];

    mockCalendarEventRepository.count = jest.fn().mockResolvedValue(1);
    mockCalendarEventRepository.find
      .mockResolvedValueOnce([{ id: '1' }])
      .mockResolvedValueOnce([
        {
          ...mockCalendarEvent,
          calendarChannelEventAssociations: [
            { calendarChannelId: 'channel-1' },
          ],
        },
      ]);
    mockCalendarChannelCoreRepository.find.mockResolvedValue([
      {
        id: 'channel-1',
        visibility: CalendarChannelVisibility.METADATA,
        connectedAccountId: 'connected-account-1',
      },
    ]);
    // Current user resolves but doesn't own the account
    mockWorkspaceMemberRepository.findOne.mockResolvedValue({
      userId: 'current-user-id',
    });
    mockUserWorkspaceRepository.findOne.mockResolvedValue({
      id: 'current-uw-id',
    });
    mockConnectedAccountRepository.find.mockResolvedValue([]);
    mockCalendarPrivacyService.getCalendarEventMaskMap.mockResolvedValue(
      new Map([['1', true]]),
    );

    const result = await service.getCalendarEventsFromPersonIds({
      currentWorkspaceMemberId,
      personIds,
      workspaceId: 'test-workspace-id',
      page: 1,
      pageSize: 10,
    });

    expect(result.timelineCalendarEvents[0].title).toBe(
      FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
    );
    expect(result.timelineCalendarEvents[0].description).toBeNull();
  });

  it('should return non-obfuscated calendar events if privacy grants access', async () => {
    const currentWorkspaceMemberId = 'current-workspace-member-id';
    const personIds = ['person-1'];

    mockCalendarEventRepository.count = jest.fn().mockResolvedValue(1);
    mockCalendarEventRepository.find
      .mockResolvedValueOnce([{ id: '1' }])
      .mockResolvedValueOnce([
        {
          ...mockCalendarEvent,
          calendarChannelEventAssociations: [
            { calendarChannelId: 'channel-1' },
          ],
        },
      ]);
    mockCalendarChannelCoreRepository.find.mockResolvedValue([
      {
        id: 'channel-1',
        visibility: CalendarChannelVisibility.METADATA,
        connectedAccountId: 'connected-account-1',
      },
    ]);
    // Current user resolves and owns the account
    mockWorkspaceMemberRepository.findOne.mockResolvedValue({
      userId: 'current-user-id',
    });
    mockUserWorkspaceRepository.findOne.mockResolvedValue({
      id: 'current-uw-id',
    });
    mockConnectedAccountRepository.find.mockResolvedValue([
      { id: 'connected-account-1' },
    ]);

    const result = await service.getCalendarEventsFromPersonIds({
      currentWorkspaceMemberId,
      personIds,
      workspaceId: 'test-workspace-id',
      page: 1,
      pageSize: 10,
    });

    expect(result.timelineCalendarEvents[0].title).toBe('Test Event');
    expect(result.timelineCalendarEvents[0].description).toBe(
      'Test Description',
    );
  });

  it('should expose metadata-only channel events when the owner entity is accessible', async () => {
    const currentWorkspaceMemberId = 'current-workspace-member-id';
    const personIds = ['person-1'];

    mockCalendarEventRepository.count = jest.fn().mockResolvedValue(1);
    mockCalendarEventRepository.find
      .mockResolvedValueOnce([{ id: '1' }])
      .mockResolvedValueOnce([
        {
          ...mockCalendarEvent,
          calendarChannelEventAssociations: [
            { calendarChannelId: 'channel-1' },
          ],
        },
      ]);
    mockCalendarChannelCoreRepository.find.mockResolvedValue([
      {
        id: 'channel-1',
        visibility: CalendarChannelVisibility.METADATA,
        connectedAccountId: 'connected-account-1',
      },
    ]);
    mockWorkspaceMemberRepository.findOne.mockResolvedValue({
      userId: 'current-user-id',
    });
    mockUserWorkspaceRepository.findOne.mockResolvedValue({
      id: 'current-uw-id',
    });
    mockConnectedAccountRepository.find.mockResolvedValue([]);
    mockCalendarPrivacyService.getCalendarEventMaskMap.mockResolvedValue(
      new Map([['1', false]]),
    );

    const result = await service.getCalendarEventsFromPersonIds({
      currentWorkspaceMemberId,
      personIds,
      workspaceId: 'test-workspace-id',
      page: 1,
      pageSize: 10,
    });

    expect(result.timelineCalendarEvents[0].title).toBe('Test Event');
    expect(result.timelineCalendarEvents[0].visibility).toBe(
      CalendarChannelVisibility.SHARE_EVERYTHING,
    );
  });

  it('should expose the owner entity color even when the event is masked', async () => {
    const currentWorkspaceMemberId = 'current-workspace-member-id';
    const personIds = ['person-1'];

    mockCalendarEventRepository.count = jest.fn().mockResolvedValue(1);
    mockCalendarEventRepository.find
      .mockResolvedValueOnce([{ id: '1' }])
      .mockResolvedValueOnce([
        {
          ...mockCalendarEvent,
          calendarChannelEventAssociations: [
            { calendarChannelId: 'channel-1' },
          ],
        },
      ]);
    mockCalendarChannelCoreRepository.find.mockResolvedValue([
      {
        id: 'channel-1',
        visibility: CalendarChannelVisibility.METADATA,
        connectedAccountId: 'connected-account-1',
        workspaceId: 'test-workspace-id',
      },
    ]);
    mockConnectedAccountRepository.find.mockResolvedValue([
      {
        id: 'connected-account-1',
        userWorkspaceId: 'owner-user-workspace-id',
      },
    ]);
    mockUserWorkspaceRepository.findOne.mockResolvedValue({
      id: 'current-uw-id',
    });
    mockUserWorkspaceRepository.find.mockResolvedValue([
      {
        id: 'owner-user-workspace-id',
        userId: 'owner-user-id',
      },
    ]);
    mockUserRepository.find.mockResolvedValue([
      {
        id: 'owner-user-id',
        entityId: 'entity-1',
      },
    ]);
    mockWorkspaceMemberRepository.findOne.mockResolvedValue({
      userId: 'current-user-id',
    });
    mockWorkspaceMemberRepository.find.mockResolvedValue([
      {
        id: 'owner-workspace-member-id',
        userId: 'owner-user-id',
      },
    ]);
    mockWorkspaceMemberInternalEntityService.resolveContextsByWorkspaceMemberIds.mockResolvedValue(
      new Map([
        [
          'owner-workspace-member-id',
          {
            currentEntityId: 'entity-1',
            activeEntityId: 'entity-1',
            entityIds: ['entity-1'],
          },
        ],
      ]),
    );
    mockInternalEntityRepository.find.mockResolvedValue([
      {
        id: 'entity-1',
        color: '#123456',
        name: 'WeKnow',
      },
    ]);
    mockCalendarPrivacyService.getCalendarEventMaskMap.mockResolvedValue(
      new Map([['1', true]]),
    );

    const result = await service.getCalendarEventsFromPersonIds({
      currentWorkspaceMemberId,
      personIds,
      workspaceId: 'test-workspace-id',
      page: 1,
      pageSize: 10,
    });

    expect(result.timelineCalendarEvents[0].title).toBe(
      FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
    );
    expect(result.timelineCalendarEvents[0].entityColor).toBe('#123456');
    expect(result.timelineCalendarEvents[0].entityName).toBe('WeKnow');
    expect(result.timelineCalendarEvents[0].responsibleEntities).toEqual([
      {
        id: 'entity-1',
        color: '#123456',
        name: 'WeKnow',
      },
    ]);
  });

  it('should keep cross-entity group calendar events visible but masked', async () => {
    const currentWorkspaceMemberId = 'current-workspace-member-id';

    mockCalendarEventRepository.findAndCount.mockResolvedValue([
      [
        {
          ...mockCalendarEvent,
          calendarChannelEventAssociations: [
            { calendarChannelId: 'channel-1' },
          ],
        },
      ],
      1,
    ]);
    mockCalendarChannelCoreRepository.find.mockResolvedValue([
      {
        id: 'channel-1',
        visibility: CalendarChannelVisibility.METADATA,
        connectedAccountId: 'connected-account-1',
      },
    ]);
    mockCalendarPrivacyService.getCalendarEventMaskMap.mockResolvedValue(
      new Map([['1', true]]),
    );

    const result = await service.getGroupCalendarEvents({
      currentWorkspaceMemberId,
      workspaceId: 'test-workspace-id',
      page: 1,
      pageSize: 10,
      startDate: new Date('2024-01-01T00:00:00.000Z'),
      endDate: new Date('2024-01-02T00:00:00.000Z'),
    });

    expect(result.totalNumberOfCalendarEvents).toBe(1);
    expect(result.timelineCalendarEvents).toHaveLength(1);
    expect(result.timelineCalendarEvents[0].title).toBe(
      FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
    );
    expect(result.timelineCalendarEvents[0].description).toBeNull();
    expect(result.timelineCalendarEvents[0].visibility).toBe(
      CalendarChannelVisibility.METADATA,
    );
  });

  // Carte 5 (docs/ROADMAP.md) : startsAt/endsAt et l'entité qui occupe le
  // créneau doivent rester visibles pour permettre la planification, que le
  // spectateur soit en Vue Groupe (pas d'entité active) ou en Ma Société (une
  // entité active demandée). Un ancien comportement excluait entièrement les
  // événements masqués en Ma Société ; ce test verrouille qu'ils restent
  // toujours présents, quelle que soit l'entité active demandée.
  it('should always include masked events, even when a single entity is active (Ma Société)', async () => {
    const currentWorkspaceMemberId = 'current-workspace-member-id';

    mockCalendarEventRepository.findAndCount.mockResolvedValue([
      [
        {
          ...mockCalendarEvent,
          calendarChannelEventAssociations: [{ calendarChannelId: 'channel-1' }],
        },
      ],
      1,
    ]);
    mockCalendarChannelCoreRepository.find.mockResolvedValue([
      {
        id: 'channel-1',
        visibility: CalendarChannelVisibility.METADATA,
        connectedAccountId: 'connected-account-1',
      },
    ]);
    mockCalendarPrivacyService.getCalendarEventMaskMap.mockResolvedValue(
      new Map([['1', true]]),
    );

    const result = await service.getGroupCalendarEvents({
      currentWorkspaceMemberId,
      requestedActiveEntityId: 'some-other-entity-id',
      workspaceId: 'test-workspace-id',
      page: 1,
      pageSize: 10,
      startDate: new Date('2024-01-01T00:00:00.000Z'),
      endDate: new Date('2024-01-02T00:00:00.000Z'),
    });

    expect(result.totalNumberOfCalendarEvents).toBe(1);
    expect(result.timelineCalendarEvents).toHaveLength(1);
    expect(result.timelineCalendarEvents[0].title).toBe(
      FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
    );
    expect(result.timelineCalendarEvents[0].visibility).toBe(
      CalendarChannelVisibility.METADATA,
    );
    expect(
      mockCalendarPrivacyService.getCalendarEventMaskMap,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedActiveEntityId: 'some-other-entity-id',
      }),
    );
  });
});
