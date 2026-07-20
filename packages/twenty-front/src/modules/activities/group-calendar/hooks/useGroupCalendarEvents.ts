import { useSnackBarOnQueryError } from '@/apollo/hooks/useSnackBarOnQueryError';
import { GROUP_CALENDAR_CONFIG } from '@/activities/group-calendar/constants/GroupCalendar';
import { getGroupTimelineCalendarEvents } from '@/activities/group-calendar/graphql/queries/getGroupTimelineCalendarEvents';
import { useGroupCalendarNavigation } from '@/activities/group-calendar/hooks/useGroupCalendarNavigation';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useQuery } from '@apollo/client/react';
import { type TimelineCalendarEventsWithTotal } from '~/generated/graphql';

// Carte 5 (docs/ROADMAP.md) : un créneau masqué reste TOUJOURS visible en tant
// que « Occupé » (startsAt/endsAt + entité qui l'occupe), qu'on soit en vue Ma
// Société ou Vue Groupe — le serveur ne les exclut donc plus jamais.
export const useGroupCalendarEvents = () => {
  const apolloCoreClient = useApolloCoreClient();
  const navigation = useGroupCalendarNavigation();

  const { data, loading, error, refetch } = useQuery<{
    getGroupTimelineCalendarEvents: TimelineCalendarEventsWithTotal;
  }>(getGroupTimelineCalendarEvents, {
    client: apolloCoreClient,
    variables: {
      page: 1,
      pageSize: GROUP_CALENDAR_CONFIG.defaultPageSize,
      startDate: navigation.startDate.toISOString(),
      endDate: navigation.endDate.toISOString(),
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
