export const CALENDAR_EVENT_SHARING_SCOPE = {
  ENTITY_ONLY: 'ENTITY_ONLY',
  WORKSPACE_PUBLIC: 'WORKSPACE_PUBLIC',
} as const;

export type CalendarEventSharingScope =
  (typeof CALENDAR_EVENT_SHARING_SCOPE)[keyof typeof CALENDAR_EVENT_SHARING_SCOPE];

export const MULTI_ENTITY_OBJECT_NAME = {
  CalendarChannelEventAssociation: 'calendarChannelEventAssociation',
  CalendarEventEntityAudience: 'calendarEventEntityAudience',
  CalendarEventPersonAudience: 'calendarEventPersonAudience',
  CompanyEntityMembership: 'companyEntityMembership',
  InternalEntity: 'internalEntity',
  PersonEntityMembership: 'personEntityMembership',
  WorkspaceMemberEntityMembership: 'workspaceMemberEntityMembership',
} as const;

export type MultiEntityObjectName =
  (typeof MULTI_ENTITY_OBJECT_NAME)[keyof typeof MULTI_ENTITY_OBJECT_NAME];
