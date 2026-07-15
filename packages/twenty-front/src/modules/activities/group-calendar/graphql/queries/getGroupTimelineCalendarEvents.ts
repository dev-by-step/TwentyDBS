import { gql } from '@apollo/client';

import { timelineCalendarEventWithTotalFragment } from '@/activities/calendar/graphql/queries/fragments/timelineCalendarEventWithTotalFragment';

export const getGroupTimelineCalendarEvents = gql`
  query GetGroupTimelineCalendarEvents(
    $page: Int!
    $pageSize: Int!
    $startDate: DateTime
    $endDate: DateTime
    $includeMaskedEvents: Boolean!
  ) {
    getGroupTimelineCalendarEvents(
      page: $page
      pageSize: $pageSize
      startDate: $startDate
      endDate: $endDate
      includeMaskedEvents: $includeMaskedEvents
    ) {
      ...TimelineCalendarEventsWithTotalFragment
    }
  }
  ${timelineCalendarEventWithTotalFragment}
`;
