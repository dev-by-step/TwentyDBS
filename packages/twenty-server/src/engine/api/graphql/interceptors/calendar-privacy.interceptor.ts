import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';

import { type Observable, from, mergeMap } from 'rxjs';

import { type TimelineCalendarEventsWithTotalDTO } from 'src/engine/core-modules/calendar/dtos/timeline-calendar-events-with-total.dto';
import { CalendarPrivacyService } from 'src/modules/calendar/common/services/calendar-privacy.service';
import { getRequest } from 'src/utils/extract-request';

@Injectable()
export class CalendarPrivacyInterceptor implements NestInterceptor {
  constructor(
    private readonly calendarPrivacyService: CalendarPrivacyService,
  ) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      mergeMap((response) =>
        from(this.applyCalendarPrivacy(context, response)),
      ),
    );
  }

  private async applyCalendarPrivacy(
    context: ExecutionContext,
    response: unknown,
  ) {
    if (!this.isTimelineCalendarEventsWithTotalDTO(response)) {
      return response;
    }

    const request = getRequest(context);
    const workspaceId = request?.workspace?.id;
    const currentUserEntityId = request?.user?.entityId;
    const currentUserId = request?.user?.id;
    const currentWorkspaceMemberId = request?.workspaceMemberId;

    if (
      !workspaceId ||
      response.timelineCalendarEvents.length === 0
    ) {
      return response;
    }

    const calendarEventMaskMap =
      await this.calendarPrivacyService.getCalendarEventMaskMap({
        calendarEventIds: response.timelineCalendarEvents.map(
          (timelineCalendarEvent) => timelineCalendarEvent.id,
        ),
        workspaceId,
        currentUserEntityId,
        currentUserId,
        currentWorkspaceMemberId,
      });

    this.calendarPrivacyService.applyInternalEntityPrivacyToTimelineCalendarEvents(
      response.timelineCalendarEvents,
      calendarEventMaskMap,
    );

    return response;
  }

  private isTimelineCalendarEventsWithTotalDTO(
    response: unknown,
  ): response is TimelineCalendarEventsWithTotalDTO {
    return (
      typeof response === 'object' &&
      response !== null &&
      'timelineCalendarEvents' in response &&
      Array.isArray(response.timelineCalendarEvents)
    );
  }
}
