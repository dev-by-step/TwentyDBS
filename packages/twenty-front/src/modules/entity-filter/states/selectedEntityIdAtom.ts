import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const selectedEntityIdAtom = createAtomState<string | null>({
  key: 'selectedEntityIdAtom',
  defaultValue: null,
  useLocalStorage: true,
});
