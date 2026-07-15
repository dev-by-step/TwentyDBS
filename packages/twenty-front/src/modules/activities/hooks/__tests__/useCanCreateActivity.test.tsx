import { renderHook } from '@testing-library/react';

import { useCanCreateActivity } from '@/activities/hooks/useCanCreateActivity';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import {
  CoreObjectNameSingular,
  type ObjectPermissions,
} from 'twenty-shared/types';

jest.mock('@/object-metadata/hooks/useObjectMetadataItem');
jest.mock('@/object-record/hooks/useObjectPermissionsForObject');

const mockUseObjectMetadataItem = jest.mocked(useObjectMetadataItem);
const mockUseObjectPermissionsForObject = jest.mocked(
  useObjectPermissionsForObject,
);

const buildPermissions = (
  canUpdateObjectRecords: boolean,
): ObjectPermissions & { objectMetadataId: string } => ({
  objectMetadataId: '',
  canDestroyObjectRecords: canUpdateObjectRecords,
  canReadObjectRecords: true,
  canSoftDeleteObjectRecords: canUpdateObjectRecords,
  canUpdateObjectRecords,
  restrictedFields: {},
  rowLevelPermissionPredicateGroups: [],
  rowLevelPermissionPredicates: [],
});

describe('useCanCreateActivity', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseObjectMetadataItem.mockImplementation(
      ({ objectNameSingular }) =>
        ({
          objectMetadataItem: {
            id: `${objectNameSingular}-metadata-id`,
          },
        }) as ReturnType<typeof useObjectMetadataItem>,
    );
  });

  it('allows note creation when note and note target can be updated', () => {
    mockUseObjectPermissionsForObject.mockReturnValue(buildPermissions(true));

    const { result } = renderHook(() =>
      useCanCreateActivity({
        activityObjectNameSingular: CoreObjectNameSingular.Note,
      }),
    );

    expect(result.current).toBe(true);
    expect(mockUseObjectPermissionsForObject).toHaveBeenCalledWith(
      'note-metadata-id',
    );
    expect(mockUseObjectPermissionsForObject).toHaveBeenCalledWith(
      'noteTarget-metadata-id',
    );
  });

  it('denies note creation when note target cannot be updated', () => {
    mockUseObjectPermissionsForObject.mockImplementation((objectMetadataId) => {
      return buildPermissions(objectMetadataId !== 'noteTarget-metadata-id');
    });

    const { result } = renderHook(() =>
      useCanCreateActivity({
        activityObjectNameSingular: CoreObjectNameSingular.Note,
      }),
    );

    expect(result.current).toBe(false);
  });
});
