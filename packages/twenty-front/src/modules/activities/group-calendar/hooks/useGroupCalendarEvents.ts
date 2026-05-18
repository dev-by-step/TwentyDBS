import { useSnackBarOnQueryError } from '@/apollo/hooks/useSnackBarOnQueryError';
import { GROUP_CALENDAR_DEFAULT_PAGE_SIZE } from '@/activities/group-calendar/constants/GroupCalendar';
import { getGroupTimelineCalendarEvents } from '@/activities/group-calendar/graphql/queries/getGroupTimelineCalendarEvents';
import { useGroupCalendarNavigation } from '@/activities/group-calendar/hooks/useGroupCalendarNavigation';
import { ENTITY_FILTER_VIEW_MODE } from '@/entity-filter/constants/entityFilterViewMode';
import { useEntityFilter } from '@/entity-filter/hooks/useEntityFilter';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useQuery } from '@apollo/client/react';
import { type TimelineCalendarEventsWithTotal } from '~/generated/graphql';

export const useGroupCalendarEvents = () => {
  const apolloCoreClient = useApolloCoreClient();
  const navigation = useGroupCalendarNavigation();
  const { activeViewMode } = useEntityFilter();
  const includeMaskedEvents = activeViewMode === ENTITY_FILTER_VIEW_MODE.GROUP;

  const { data, loading, error, refetch } = useQuery<{
    getGroupTimelineCalendarEvents: TimelineCalendarEventsWithTotal;
  }>(getGroupTimelineCalendarEvents, {
    client: apolloCoreClient,
    variables: {
      page: 1,
      pageSize: GROUP_CALENDAR_DEFAULT_PAGE_SIZE,
      startDate: navigation.startDate.toISOString(),
      endDate: navigation.endDate.toISOString(),
      includeMaskedEvents,
    },
  });

  useSnackBarOnQueryError(error);

  return {
    ...navigation,
    loading,
    refetch,
    calendarEvents:
      data?.getGroupTimelineCalendarEvents?.timelineCalendarEvents ?? [],
    totalNumberOfCalendarEvents:
      data?.getGroupTimelineCalendarEvents?.totalNumberOfCalendarEvents ?? 0,
  };
};
