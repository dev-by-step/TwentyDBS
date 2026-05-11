import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

import { type GroupCalendarViewMode } from '@/activities/group-calendar/types/GroupCalendarViewMode';

export const buildGroupCalendarDateRange = (
  viewMode: GroupCalendarViewMode,
  date: Date,
): { startDate: Date; endDate: Date } => {
  switch (viewMode) {
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
