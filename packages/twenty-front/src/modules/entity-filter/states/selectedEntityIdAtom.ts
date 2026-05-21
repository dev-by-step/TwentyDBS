import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const selectedEntityIdState = createAtomState<string | null>({
  key: 'selectedEntityIdState',
  defaultValue: null,
  useLocalStorage: true,
});
