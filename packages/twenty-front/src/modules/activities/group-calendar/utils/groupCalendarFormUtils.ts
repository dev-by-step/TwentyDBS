import { format } from 'date-fns';

import {
  type AudienceMode,
  CALENDAR_EVENT_SHARING_SCOPE,
  type CalendarEventSharingScope,
} from '@/activities/group-calendar/constants/CalendarEventAudience';

export type GroupCalendarEventEntityAudienceRow = {
  id: string;
  internalEntityId: string;
};

export type GroupCalendarEventPersonAudienceRow = {
  id: string;
  workspaceMemberId: string;
};

export type GroupCalendarEventFormState = {
  title: string;
  startsAt: string;
  endsAt: string;
  eventEntityIds: string[];
  audienceMode: AudienceMode;
  selectedAudienceEntityIds: string[];
  selectedAudienceMemberIds: string[];
};

export const formatDateTimeInputValue = (date: Date): string =>
  format(date, "yyyy-MM-dd'T'HH:mm");

// Single canonical merge so create and edit produce the same DB shape and we
// never persist duplicate audience rows for an entity that is already an event
// entity.
export const mergeEntityIds = (
  eventEntityIds: readonly string[],
  audienceEntityIds: readonly string[],
): string[] => {
  return [...new Set([...eventEntityIds, ...audienceEntityIds])];
};

export const deriveAudienceModeFromSharingScope = (
  sharingScope: string | null | undefined,
): AudienceMode => {
  return sharingScope === CALENDAR_EVENT_SHARING_SCOPE.WORKSPACE_PUBLIC
    ? 'group'
    : 'specific';
};

export const deriveSharingScopeFromAudienceMode = ({
  audienceMode,
  isAudienceFeatureAvailable,
}: {
  audienceMode: AudienceMode;
  isAudienceFeatureAvailable: boolean;
}): CalendarEventSharingScope => {
  return !isAudienceFeatureAvailable || audienceMode === 'group'
    ? CALENDAR_EVENT_SHARING_SCOPE.WORKSPACE_PUBLIC
    : CALENDAR_EVENT_SHARING_SCOPE.ENTITY_ONLY;
};

export const buildCreateInitialFormState = ({
  selectedDate,
  defaultEventEntityIds,
  defaultStart,
  defaultEnd,
}: {
  selectedDate: Date;
  defaultEventEntityIds: readonly string[];
  defaultStart: Date;
  defaultEnd: Date;
}): GroupCalendarEventFormState => {
  void selectedDate;

  return {
    title: '',
    startsAt: formatDateTimeInputValue(defaultStart),
    endsAt: formatDateTimeInputValue(defaultEnd),
    eventEntityIds: [...defaultEventEntityIds],
    audienceMode: 'specific',
    selectedAudienceEntityIds: [],
    selectedAudienceMemberIds: [],
  };
};

// Hydrate the edit modal form state from the persisted calendar event + its
// junction rows. Splits audience entities by whether the current user can
// manage them: manageable ones become event entities (toggle-able), the rest
// are preserved as audience grants (read-only cross-entity grants).
export const buildEditInitialFormState = ({
  calendarEvent,
  entityAudienceRows,
  personAudienceRows,
  manageableEventEntityIds,
}: {
  calendarEvent: {
    title: string | null;
    startsAt: string;
    endsAt: string;
    sharingScope: string | null;
  };
  entityAudienceRows: readonly GroupCalendarEventEntityAudienceRow[];
  personAudienceRows: readonly GroupCalendarEventPersonAudienceRow[];
  manageableEventEntityIds: ReadonlySet<string>;
}): GroupCalendarEventFormState => {
  const eventEntityIds: string[] = [];
  const audienceEntityIds: string[] = [];

  for (const row of entityAudienceRows) {
    if (manageableEventEntityIds.has(row.internalEntityId)) {
      eventEntityIds.push(row.internalEntityId);
    } else {
      audienceEntityIds.push(row.internalEntityId);
    }
  }

  return {
    title: calendarEvent.title ?? '',
    startsAt: formatDateTimeInputValue(new Date(calendarEvent.startsAt)),
    endsAt: formatDateTimeInputValue(new Date(calendarEvent.endsAt)),
    eventEntityIds,
    audienceMode: deriveAudienceModeFromSharingScope(calendarEvent.sharingScope),
    selectedAudienceEntityIds: audienceEntityIds,
    selectedAudienceMemberIds: personAudienceRows.map(
      (row) => row.workspaceMemberId,
    ),
  };
};
