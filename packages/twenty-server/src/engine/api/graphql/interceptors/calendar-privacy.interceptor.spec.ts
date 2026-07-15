import { type CallHandler, type ExecutionContext } from '@nestjs/common';

import { of, lastValueFrom } from 'rxjs';

import { CalendarPrivacyInterceptor } from 'src/engine/api/graphql/interceptors/calendar-privacy.interceptor';
import { CALENDAR_PRIVACY_OCCUPIED_TITLE } from 'src/modules/calendar/common/constants/calendar-privacy.constants';
import { CalendarPrivacyService } from 'src/modules/calendar/common/services/calendar-privacy.service';
import { getRequest } from 'src/utils/extract-request';

jest.mock('src/utils/extract-request', () => ({
  getRequest: jest.fn(),
}));

describe('CalendarPrivacyInterceptor', () => {
  const mockCalendarPrivacyService = {
    getCalendarEventMaskMap: jest.fn(),
    applyInternalEntityPrivacyToTimelineCalendarEvents: jest.fn(),
  } as unknown as jest.Mocked<CalendarPrivacyService>;

  const interceptor = new CalendarPrivacyInterceptor(
    mockCalendarPrivacyService,
  );

  const mockExecutionContext = {} as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();

    (getRequest as jest.Mock).mockReturnValue({
      workspace: { id: 'workspace-id' },
      workspaceMemberId: 'workspace-member-id',
      user: { id: 'request-user-id', entityId: 'request-user-entity-id' },
    });
  });

  it('should keep the response unchanged when the event belongs to the same entity', async () => {
    mockCalendarPrivacyService.getCalendarEventMaskMap.mockResolvedValue(
      new Map([['calendar-event-1', false]]),
    );
    mockCalendarPrivacyService.applyInternalEntityPrivacyToTimelineCalendarEvents.mockImplementation(
      () => undefined,
    );

    const response = {
      totalNumberOfCalendarEvents: 1,
      timelineCalendarEvents: [
        {
          id: 'calendar-event-1',
          title: 'Pipeline review',
          description: 'Weekly pipeline review',
          startsAt: new Date('2026-05-11T10:00:00.000Z'),
          endsAt: new Date('2026-05-11T11:00:00.000Z'),
          isCanceled: false,
          isFullDay: false,
          location: 'Room 1',
          conferenceSolution: 'meet',
          conferenceLink: {
            primaryLinkLabel: 'Meet',
            primaryLinkUrl: 'https://example.com',
            secondaryLinks: null,
          },
          participants: [{ displayName: 'Alice' }],
          visibility: 'SHARE_EVERYTHING',
        },
      ],
    };

    const result = await lastValueFrom(
      interceptor.intercept(mockExecutionContext, {
        handle: () => of(response),
      } as CallHandler),
    );

    expect(result).toBe(response);
    expect(
      mockCalendarPrivacyService.getCalendarEventMaskMap,
    ).toHaveBeenCalledWith({
      calendarEventIds: ['calendar-event-1'],
      workspaceId: 'workspace-id',
      currentUserEntityId: 'request-user-entity-id',
      currentUserId: 'request-user-id',
      currentWorkspaceMemberId: 'workspace-member-id',
    });
    expect(
      mockCalendarPrivacyService.applyInternalEntityPrivacyToTimelineCalendarEvents,
    ).toHaveBeenCalledWith(
      response.timelineCalendarEvents,
      new Map([['calendar-event-1', false]]),
    );
    expect(response.timelineCalendarEvents[0].title).toBe('Pipeline review');
    expect(response.timelineCalendarEvents[0].startsAt).toEqual(
      new Date('2026-05-11T10:00:00.000Z'),
    );
    expect(response.timelineCalendarEvents[0].endsAt).toEqual(
      new Date('2026-05-11T11:00:00.000Z'),
    );
  });

  it('should mask the response when the event belongs to another entity', async () => {
    mockCalendarPrivacyService.getCalendarEventMaskMap.mockResolvedValue(
      new Map([['calendar-event-1', true]]),
    );
    mockCalendarPrivacyService.applyInternalEntityPrivacyToTimelineCalendarEvents.mockImplementation(
      (events, eventMaskMap) => {
        for (const event of events) {
          if (!eventMaskMap.get(event.id)) {
            continue;
          }

          event.title = CALENDAR_PRIVACY_OCCUPIED_TITLE;
          event.description = null;
          event.location = null;
          event.conferenceSolution = null;
          event.conferenceLink = null;
          event.participants = null;
        }
      },
    );

    const response = {
      totalNumberOfCalendarEvents: 1,
      timelineCalendarEvents: [
        {
          id: 'calendar-event-1',
          title: 'Board meeting',
          description: 'Confidential',
          startsAt: new Date('2026-05-11T10:00:00.000Z'),
          endsAt: new Date('2026-05-11T11:00:00.000Z'),
          isCanceled: false,
          isFullDay: false,
          location: 'Room 1',
          conferenceSolution: 'meet',
          conferenceLink: {
            primaryLinkLabel: 'Meet',
            primaryLinkUrl: 'https://example.com',
            secondaryLinks: null,
          },
          participants: [{ displayName: 'Alice' }],
          visibility: 'SHARE_EVERYTHING',
        },
      ],
    };

    await lastValueFrom(
      interceptor.intercept(mockExecutionContext, {
        handle: () => of(response),
      } as CallHandler),
    );

    expect(response.timelineCalendarEvents[0].title).toBe(
      CALENDAR_PRIVACY_OCCUPIED_TITLE,
    );
    expect(response.timelineCalendarEvents[0].description).toBeNull();
    expect(response.timelineCalendarEvents[0].location).toBeNull();
    expect(response.timelineCalendarEvents[0].conferenceSolution).toBeNull();
    expect(response.timelineCalendarEvents[0].conferenceLink).toBeNull();
    expect(response.timelineCalendarEvents[0].participants).toBeNull();
    expect(response.timelineCalendarEvents[0].startsAt).toEqual(
      new Date('2026-05-11T10:00:00.000Z'),
    );
    expect(response.timelineCalendarEvents[0].endsAt).toEqual(
      new Date('2026-05-11T11:00:00.000Z'),
    );
  });
});
