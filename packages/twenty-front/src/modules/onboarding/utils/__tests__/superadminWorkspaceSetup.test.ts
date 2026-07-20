import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import {
  parseSavedSetupState,
  resolveModuleOptions,
} from '@/onboarding/utils/superadminWorkspaceSetup';

describe('parseSavedSetupState', () => {
  it('returns null for non-object input', () => {
    expect(parseSavedSetupState(null)).toBeNull();
    expect(parseSavedSetupState('nope')).toBeNull();
    expect(parseSavedSetupState(42)).toBeNull();
  });

  it('coerces and filters malformed entity/selection fields', () => {
    const result = parseSavedSetupState({
      entities: [
        {
          id: 'e1',
          name: 'WEKNOW',
          website: 'https://weknow.dev',
          headcount: 12,
          isMember: true,
        },
        // malformed → coerced to safe defaults
        { id: 42, name: null, website: 7, headcount: 'x', isMember: 'yes' },
        'not-an-object',
      ],
      selectedObjectMetadataIds: ['a', 3, 'b', null],
    });

    expect(result).toEqual({
      entities: [
        {
          id: 'e1',
          name: 'WEKNOW',
          website: 'https://weknow.dev',
          headcount: 12,
          isMember: true,
        },
        {
          id: undefined,
          name: undefined,
          website: null,
          headcount: null,
          isMember: false,
        },
      ],
      selectedObjectMetadataIds: ['a', 'b'],
    });
  });

  it('leaves missing arrays undefined', () => {
    expect(parseSavedSetupState({})).toEqual({
      entities: undefined,
      selectedObjectMetadataIds: undefined,
    });
  });
});

describe('resolveModuleOptions', () => {
  const buildItem = (
    nameSingular: string,
    id: string,
    labelPlural: string,
  ): EnrichedObjectMetadataItem =>
    ({ nameSingular, id, labelPlural }) as EnrichedObjectMetadataItem;

  it('orders modules by startup priority and skips missing ones', () => {
    const options = resolveModuleOptions([
      buildItem('company', 'company-id', 'Companies'),
      buildItem('workspaceMember', 'wm-id', 'Workspace Members'),
      buildItem('unknownObject', 'x-id', 'Unknowns'),
    ]);

    expect(options.map((option) => option.nameSingular)).toEqual([
      'workspaceMember',
      'company',
    ]);
  });

  it('relabels workspaceMember to "Team" and keeps labelPlural otherwise', () => {
    const options = resolveModuleOptions([
      buildItem('workspaceMember', 'wm-id', 'Workspace Members'),
      buildItem('person', 'person-id', 'People'),
    ]);

    expect(options).toEqual([
      {
        objectMetadataId: 'wm-id',
        nameSingular: 'workspaceMember',
        label: 'Team',
      },
      {
        objectMetadataId: 'person-id',
        nameSingular: 'person',
        label: 'People',
      },
    ]);
  });
});
