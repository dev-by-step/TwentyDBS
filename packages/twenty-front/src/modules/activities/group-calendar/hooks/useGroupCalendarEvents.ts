import { useSnackBarOnQueryError } from '@/apollo/hooks/useSnackBarOnQueryError';
import { GROUP_CALENDAR_DEFAULT_PAGE_SIZE } from '@/activities/group-calendar/constants/GroupCalendar';
import { getGroupTimelineCalendarEvents } from '@/activities/group-calendar/graphql/queries/getGroupTimelineCalendarEvents';
import { useGroupCalendarNavigation } from '@/activities/group-calendar/hooks/useGroupCalendarNavigation';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useQuery } from '@apollo/client/react';
import { type TimelineCalendarEventsWithTotal } from '~/generated/graphql';

export const useGroupCalendarEvents = () => {
  const apolloCoreClient = useApolloCoreClient();
  const navigation = useGroupCalendarNavigation();

  const { data, loading, error } = useQuery<{
    getGroupTimelineCalendarEvents: TimelineCalendarEventsWithTotal;
  }>(getGroupTimelineCalendarEvents, {
    client: apolloCoreClient,
    variables: {
      page: 1,
      pageSize: GROUP_CALENDAR_DEFAULT_PAGE_SIZE,
      startDate: navigation.startDate.toISOString(),
      endDate: navigation.endDate.toISOString(),
    },
  });

  useSnackBarOnQueryError(error);

  return {
    ...navigation,
    loading,
    calendarEvents:
      data?.getGroupTimelineCalendarEvents?.timelineCalendarEvents ?? [],
    totalNumberOfCalendarEvents:
      data?.getGroupTimelineCalendarEvents?.totalNumberOfCalendarEvents ?? 0,
  };
};
