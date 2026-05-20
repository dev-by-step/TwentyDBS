import { MULTI_ENTITY_OBJECT_NAME } from 'twenty-shared/constants';

export const HIDDEN_OBJECT_METADATA_NAMES = new Set<string>([
  MULTI_ENTITY_OBJECT_NAME.WorkspaceMemberEntityMembership,
  MULTI_ENTITY_OBJECT_NAME.CalendarEventEntityAudience,
  MULTI_ENTITY_OBJECT_NAME.CalendarEventPersonAudience,
]);
