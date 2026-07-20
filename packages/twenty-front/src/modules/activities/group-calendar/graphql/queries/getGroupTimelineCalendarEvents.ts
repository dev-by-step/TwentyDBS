import { gql } from '@apollo/client';

import { timelineCalendarEventWithTotalFragment } from '@/activities/calendar/graphql/queries/fragments/timelineCalendarEventWithTotalFragment';

export const getGroupTimelineCalendarEvents = gql`
  query GetGroupTimelineCalendarEvents(
    $page: Int!
    $pageSize: Int!
    $startDate: DateTime
    $endDate: DateTime
  ) {
    getGroupTimelineCalendarEvents(
      page: $page
      pageSize: $pageSize
      startDate: $startDate
      endDate: $endDate
    ) {
      ...TimelineCalendarEventsWithTotalFragment
    }
  }
  ${timelineCalendarEventWithTotalFragment}
`;
