import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

import { type GroupCalendarDisplayMode } from '@/activities/group-calendar/types/GroupCalendarDisplayMode';

export const groupCalendarDisplayModeState =
  createAtomState<GroupCalendarDisplayMode>({
    key: 'groupCalendarDisplayModeState',
    defaultValue: 'LIST',
    useLocalStorage: true,
  });
