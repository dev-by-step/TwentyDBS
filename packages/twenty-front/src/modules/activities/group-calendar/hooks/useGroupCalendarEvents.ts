import { useCallback, useMemo, useState } from 'react';

import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns';

import { useSnackBarOnQueryError } from '@/apollo/hooks/useSnackBarOnQueryError';
import { getGroupTimelineCalendarEvents } from '@/activities/group-calendar/graphql/queries/getGroupTimelineCalendarEvents';
import { GROUP_CALENDAR_DEFAULT_PAGE_SIZE } from '@/activities/group-calendar/constants/GroupCalendar';
import { groupCalendarViewModeState } from '@/activities/group-calendar/states/groupCalendarViewModeAtom';
import { type GroupCalendarViewMode } from '@/activities/group-calendar/types/GroupCalendarViewMode';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { useQuery } from '@apollo/client/react';
import { type TimelineCalendarEventsWithTotal } from '~/generated/graphql';

const buildDateRange = (
  groupCalendarViewMode: GroupCalendarViewMode,
  date: Date,
): { startDate: Date; endDate: Date } => {
  switch (groupCalendarViewMode) {
    case 'DAY':
      return { startDate: startOfDay(date), endDate: endOfDay(date) };
    case 'WEEK':
      return {
        startDate: startOfWeek(date, { weekStartsOn: 1 }),
        endDate: endOfWeek(date, { weekStartsOn: 1 }),
      };
    case 'MONTH':
      return { startDate: startOfMonth(date), endDate: endOfMonth(date) };
  }
};

export const useGroupCalendarEvents = () => {
  const apolloCoreClient = useApolloCoreClient();
  const [groupCalendarViewMode, setGroupCalendarViewMode] = useAtomState(groupCalendarViewModeState);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const { startDate, endDate } = useMemo(
    () => buildDateRange(groupCalendarViewMode, selectedDate),
    [groupCalendarViewMode, selectedDate],
  );

  const { data, loading, error } = useQuery<{
    getGroupTimelineCalendarEvents: TimelineCalendarEventsWithTotal;
  }>(getGroupTimelineCalendarEvents, {
    client: apolloCoreClient,
    variables: {
      page: 1,
      pageSize: GROUP_CALENDAR_DEFAULT_PAGE_SIZE,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
  });

  useSnackBarOnQueryError(error);

  const navigatePrev = useCallback(() => {
    setSelectedDate((current) => {
      if (groupCalendarViewMode === 'DAY') return subDays(current, 1);
      if (groupCalendarViewMode === 'WEEK') return subWeeks(current, 1);

      return subMonths(current, 1);
    });
  }, [groupCalendarViewMode]);

  const navigateNext = useCallback(() => {
    setSelectedDate((current) => {
      if (groupCalendarViewMode === 'DAY') return addDays(current, 1);
      if (groupCalendarViewMode === 'WEEK') return addWeeks(current, 1);

      return addMonths(current, 1);
    });
  }, [groupCalendarViewMode]);

  const navigateToday = useCallback(() => {
    setSelectedDate(new Date());
  }, []);

  return {
    viewMode: groupCalendarViewMode,
    setViewMode: setGroupCalendarViewMode,
    selectedDate,
    startDate,
    endDate,
    loading,
    calendarEvents:
      data?.getGroupTimelineCalendarEvents?.timelineCalendarEvents ?? [],
    totalNumberOfCalendarEvents:
      data?.getGroupTimelineCalendarEvents?.totalNumberOfCalendarEvents ?? 0,
    navigatePrev,
    navigateNext,
    navigateToday,
  };
};
