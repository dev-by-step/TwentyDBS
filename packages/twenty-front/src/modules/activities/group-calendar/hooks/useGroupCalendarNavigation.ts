import { useCallback, useMemo, useState } from 'react';

import {
  addDays,
  addMonths,
  addWeeks,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns';

import { groupCalendarViewModeState } from '@/activities/group-calendar/states/groupCalendarViewModeState';
import { buildGroupCalendarDateRange } from '@/activities/group-calendar/utils/buildGroupCalendarDateRange';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';

export const useGroupCalendarNavigation = () => {
  const [groupCalendarViewMode, setGroupCalendarViewMode] = useAtomState(
    groupCalendarViewModeState,
  );
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const { startDate, endDate } = useMemo(
    () => buildGroupCalendarDateRange(groupCalendarViewMode, selectedDate),
    [groupCalendarViewMode, selectedDate],
  );

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

  const navigateToday = useCallback(() => setSelectedDate(new Date()), []);

  return {
    viewMode: groupCalendarViewMode,
    setViewMode: setGroupCalendarViewMode,
    selectedDate,
    startDate,
    endDate,
    navigatePrev,
    navigateNext,
    navigateToday,
  };
};
