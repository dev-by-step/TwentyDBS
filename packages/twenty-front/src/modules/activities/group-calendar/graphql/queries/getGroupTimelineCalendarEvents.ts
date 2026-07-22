import { gql } from '@apollo/client';

import { timelineCalendarEventWithTotalFragment } from '@/activities/calendar/graphql/queries/fragments/timelineCalendarEventWithTotalFragment';

export const getGroupTimelineCalendarEvents = gql`
  query GetGroupTimelineCalendarEvents(
    $page: Int!
    $pageSize: Int!
    $startDate: DateTime
    $endDate: DateTime
    $entityFilterId: UUID
  ) {
    getGroupTimelineCalendarEvents(
      page: $page
      pageSize: $pageSize
      startDate: $startDate
      endDate: $endDate
      entityFilterId: $entityFilterId
    ) {
      ...TimelineCalendarEventsWithTotalFragment
    }
  }
  ${timelineCalendarEventWithTotalFragment}
`;
