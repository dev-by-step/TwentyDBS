import { timelineCalendarEventParticipantFragment } from '@/activities/calendar/graphql/queries/fragments/timelineCalendarEventParticipantFragment';
import { gql } from '@apollo/client';

export const timelineCalendarEventFragment = gql`
  fragment TimelineCalendarEventFragment on TimelineCalendarEvent {
    id
    title
    description
    location
    startsAt
    endsAt
    isFullDay
    visibility
    entityColor
    entityName
    ownerEntityId
    responsibleEntities {
      id
      name
      color
    }
    participants {
      ...TimelineCalendarEventParticipantFragment
    }
  }
  ${timelineCalendarEventParticipantFragment}
`;
