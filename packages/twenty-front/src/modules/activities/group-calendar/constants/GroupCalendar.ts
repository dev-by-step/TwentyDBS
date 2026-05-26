export const GROUP_CALENDAR_CONFIG = {
  defaultPageSize: 100,
  modalIds: {
    createEvent: 'group-calendar-create-event-modal',
    editEvent: 'group-calendar-edit-event-modal',
    deleteEvent: 'group-calendar-delete-event-confirmation',
  },
  limits: {
    entityPicker: 200,
    workspaceMemberPicker: 200,
    entityMembership: 1000,
    eventAudience: 500,
  },
} as const;
