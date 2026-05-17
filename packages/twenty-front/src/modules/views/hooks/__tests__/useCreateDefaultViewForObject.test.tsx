import { renderHook } from '@testing-library/react';

import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useCreateDefaultViewForObject } from '@/views/hooks/useCreateDefaultViewForObject';
import { usePerformViewAPIPersist } from '@/views/hooks/internal/usePerformViewAPIPersist';
import { usePerformViewFieldAPIPersist } from '@/views/hooks/internal/usePerformViewFieldAPIPersist';
import { act } from 'react';

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: jest.fn(),
}));
jest.mock('@/views/hooks/internal/usePerformViewAPIPersist', () => ({
  usePerformViewAPIPersist: jest.fn(),
}));
jest.mock('@/views/hooks/internal/usePerformViewFieldAPIPersist', () => ({
  usePerformViewFieldAPIPersist: jest.fn(),
}));

const performViewAPICreate = jest.fn();
const performViewFieldAPICreate = jest.fn();

const personObjectMetadataItem = {
  id: 'person-object-id',
  icon: 'IconUser',
  labelPlural: 'People',
  labelIdentifierFieldMetadataId: 'person-name-field-id',
  fields: [
    {
      id: 'person-name-field-id',
      name: 'name',
      isActive: true,
    },
    {
      id: 'person-job-title-field-id',
      name: 'jobTitle',
      isActive: true,
    },
    {
      id: 'person-internal-entities-field-id',
      name: 'internalEntities',
      isActive: true,
      relation: {
        targetObjectMetadata: {
          id: 'person-entity-membership-object-id',
          nameSingular: 'personEntityMembership',
        },
      },
      settings: {
        junctionTargetFieldId: 'junction-internal-entity-field-id',
      },
    },
  ],
};

const membershipObjectMetadataItem = {
  id: 'person-entity-membership-object-id',
  nameSingular: 'personEntityMembership',
  labelPlural: 'Person Entity Memberships',
  labelIdentifierFieldMetadataId: 'membership-id-field-id',
  fields: [
    {
      id: 'membership-id-field-id',
      name: 'id',
      isActive: true,
      isSystem: true,
    },
    {
      id: 'membership-person-id-field-id',
      name: 'personId',
      isActive: true,
      isSystem: false,
    },
    {
      id: 'junction-person-field-id',
      name: 'person',
      isActive: true,
      relation: {
        targetObjectMetadata: {
          id: 'person-object-id',
          nameSingular: 'person',
        },
      },
      settings: {
        joinColumnName: 'personId',
      },
    },
    {
      id: 'membership-internal-entity-id-field-id',
      name: 'internalEntityId',
      isActive: true,
      isSystem: false,
    },
    {
      id: 'junction-internal-entity-field-id',
      name: 'internalEntity',
      isActive: true,
      relation: {
        targetObjectMetadata: {
          id: 'internal-entity-object-id',
          nameSingular: 'internalEntity',
        },
      },
      settings: {
        joinColumnName: 'internalEntityId',
      },
    },
  ],
};

describe('useCreateDefaultViewForObject', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (useObjectMetadataItems as jest.Mock).mockReturnValue({
      objectMetadataItems: [
        personObjectMetadataItem,
        membershipObjectMetadataItem,
      ],
    });

    (usePerformViewAPIPersist as jest.Mock).mockReturnValue({
      performViewAPICreate,
    });

    (usePerformViewFieldAPIPersist as jest.Mock).mockReturnValue({
      performViewFieldAPICreate,
    });

    performViewAPICreate.mockResolvedValue({
      status: 'successful',
      data: {
        id: 'view-id',
      },
    });

    performViewFieldAPICreate.mockResolvedValue({
      status: 'successful',
      response: null,
    });
  });

  it('creates internal entity relation columns with a wider default width', async () => {
    const { result } = renderHook(() => useCreateDefaultViewForObject());

    await act(async () => {
      await result.current.createDefaultViewForObject(
        personObjectMetadataItem as never,
      );
    });

    expect(performViewFieldAPICreate).toHaveBeenCalledWith({
      inputs: expect.arrayContaining([
        expect.objectContaining({
          fieldMetadataId: 'person-name-field-id',
          size: 180,
        }),
        expect.objectContaining({
          fieldMetadataId: 'person-internal-entities-field-id',
          size: 260,
        }),
      ]),
    });
  });

  it('hides membership id columns and prioritizes relation columns for membership objects', async () => {
    const { result } = renderHook(() => useCreateDefaultViewForObject());

    await act(async () => {
      await result.current.createDefaultViewForObject(
        membershipObjectMetadataItem as never,
      );
    });

    expect(performViewFieldAPICreate).toHaveBeenCalledWith({
      inputs: expect.arrayContaining([
        expect.objectContaining({
          fieldMetadataId: 'junction-person-field-id',
          position: 0,
          size: 260,
        }),
        expect.objectContaining({
          fieldMetadataId: 'junction-internal-entity-field-id',
          position: 1,
          size: 260,
        }),
        expect.objectContaining({
          fieldMetadataId: 'membership-id-field-id',
        }),
      ]),
    });

    const createdFieldMetadataIds =
      performViewFieldAPICreate.mock.calls.at(-1)?.[0].inputs.map(
        (input: { fieldMetadataId: string }) => input.fieldMetadataId,
      ) ?? [];

    expect(createdFieldMetadataIds.indexOf('junction-person-field-id')).toBeLessThan(
      createdFieldMetadataIds.indexOf('membership-id-field-id'),
    );
    expect(
      createdFieldMetadataIds.indexOf('junction-internal-entity-field-id'),
    ).toBeLessThan(createdFieldMetadataIds.indexOf('membership-id-field-id'));
    expect(createdFieldMetadataIds).not.toContain('membership-person-id-field-id');
    expect(createdFieldMetadataIds).not.toContain(
      'membership-internal-entity-id-field-id',
    );
  });
});
