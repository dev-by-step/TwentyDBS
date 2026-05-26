import { CalendarSaveEventsService } from 'src/modules/calendar/calendar-event-import-manager/services/calendar-save-events.service';
import { type CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type CalendarEventWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-event.workspace-entity';
import { type FetchedCalendarEvent } from 'src/modules/calendar/common/types/fetched-calendar-event';

const workspaceId = 'workspace-id';
const transactionManager = {};

const createFetchedEvent = (
  overrides: Partial<FetchedCalendarEvent> = {},
): FetchedCalendarEvent => ({
  id: 'external-event-2',
  title: 'Sprint review',
  iCalUid: 'external-ical-2',
  description: 'Imported from another calendar',
  startsAt: '2026-05-20T10:00:00.000Z',
  endsAt: '2026-05-20T11:00:00.000Z',
  location: '',
  isFullDay: false,
  isCanceled: false,
  conferenceLinkLabel: '',
  conferenceLinkUrl: '',
  externalCreatedAt: '2026-05-19T10:00:00.000Z',
  externalUpdatedAt: '2026-05-19T10:00:00.000Z',
  conferenceSolution: '',
  participants: [],
  status: '',
  ...overrides,
});

describe('CalendarSaveEventsService', () => {
  const calendarEventRepository = {
    find: jest.fn(),
    insert: jest.fn(),
    updateMany: jest.fn(),
  };
  const calendarChannelEventAssociationRepository = {
    find: jest.fn(),
    insert: jest.fn(),
  };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn((callback) => callback()),
    getGlobalWorkspaceDataSource: jest.fn(() => ({
      transaction: jest.fn((callback) => callback(transactionManager)),
    })),
    getRepository: jest.fn((_workspaceId, objectName) => {
      if (objectName === 'calendarEvent') {
        return calendarEventRepository;
      }

      if (objectName === 'calendarChannelEventAssociation') {
        return calendarChannelEventAssociationRepository;
      }

      throw new Error(`Unexpected repository ${objectName}`);
    }),
  };
  const calendarEventParticipantService = {
    upsertAndDeleteCalendarEventParticipants: jest.fn(),
  };

  const service = new CalendarSaveEventsService(
    globalWorkspaceOrmManager as any,
    calendarEventParticipantService as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('merges same title and time imports by adding a calendar channel association', async () => {
    const existingEvent = {
      id: 'calendar-event-1',
      title: 'Sprint review',
      iCalUid: 'external-ical-1',
      startsAt: '2026-05-20T10:00:00.000Z',
      endsAt: '2026-05-20T11:00:00.000Z',
      isFullDay: false,
    } as CalendarEventWorkspaceEntity;

    calendarEventRepository.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([existingEvent]);
    calendarChannelEventAssociationRepository.find.mockResolvedValue([]);

    await service.saveCalendarEventsAndEnqueueContactCreationJob(
      [createFetchedEvent()],
      { id: 'calendar-channel-2' } as CalendarChannelEntity,
      {} as ConnectedAccountEntity,
      workspaceId,
    );

    expect(calendarEventRepository.insert).not.toHaveBeenCalled();
    expect(calendarEventRepository.updateMany).not.toHaveBeenCalled();
    expect(
      calendarChannelEventAssociationRepository.insert,
    ).toHaveBeenCalledWith(
      [
        {
          calendarEventId: 'calendar-event-1',
          eventExternalId: 'external-event-2',
          calendarChannelId: 'calendar-channel-2',
          recurringEventExternalId: '',
        },
      ],
      transactionManager,
    );
    expect(
      calendarEventParticipantService.upsertAndDeleteCalendarEventParticipants,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        participantsToCreate: [],
        participantsToUpdate: [],
      }),
    );
  });
});
