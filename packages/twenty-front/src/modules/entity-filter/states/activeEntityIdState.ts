import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const activeEntityIdState = createAtomState<string | null>({
  key: 'activeEntityIdState',
  defaultValue: null,
  useLocalStorage: true,
  localStorageOptions: { getOnInit: true },
});
