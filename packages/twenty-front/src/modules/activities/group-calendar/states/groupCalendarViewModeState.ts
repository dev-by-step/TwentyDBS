import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

import { type GroupCalendarViewMode } from '@/activities/group-calendar/types/GroupCalendarViewMode';

export const groupCalendarViewModeState =
  createAtomState<GroupCalendarViewMode>({
    key: 'groupCalendarViewModeState',
    defaultValue: 'MONTH',
    useLocalStorage: true,
  });
