import { RecordIndexInternalEntityViewFieldsSyncEffect } from '@/object-record/record-index/components/RecordIndexInternalEntityViewFieldsSyncEffect';
import { useContextStoreObjectMetadataItemOrThrow } from '@/context-store/hooks/useContextStoreObjectMetadataItemOrThrow';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { usePerformViewFieldAPIPersist } from '@/views/hooks/internal/usePerformViewFieldAPIPersist';
import { render, waitFor } from '@testing-library/react';

jest.mock(
  '@/context-store/hooks/useContextStoreObjectMetadataItemOrThrow',
  () => ({
    useContextStoreObjectMetadataItemOrThrow: jest.fn(),
  }),
);
jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: jest.fn(),
}));
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: jest.fn(),
  }),
);
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue',
  () => ({
    useAtomFamilySelectorValue: jest.fn(),
  }),
);
jest.mock('@/views/hooks/internal/usePerformViewFieldAPIPersist', () => ({
  usePerformViewFieldAPIPersist: jest.fn(),
}));

const performViewFieldAPICreate = jest.fn();
const performViewFieldAPIUpdate = jest.fn();

const personObjectMetadataItem = {
  id: 'person-object-id',
  labelIdentifierFieldMetadataId: 'person-name-field-id',
  fields: [
    {
      id: 'person-name-field-id',
      name: 'name',
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
  labelIdentifierFieldMetadataId: 'membership-id-field-id',
  fields: [
    {
      id: 'membership-id-field-id',
      name: 'id',
      isActive: true,
    },
    {
      id: 'membership-person-id-field-id',
      name: 'personId',
      isActive: true,
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

describe('RecordIndexInternalEntityViewFieldsSyncEffect', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (useContextStoreObjectMetadataItemOrThrow as jest.Mock).mockReturnValue({
      objectMetadataItem: personObjectMetadataItem,
    });

    (useObjectMetadataItems as jest.Mock).mockReturnValue({
      objectMetadataItems: [
        personObjectMetadataItem,
        membershipObjectMetadataItem,
      ],
    });

    (useAtomComponentStateValue as jest.Mock).mockReturnValue('view-1');

    (useAtomFamilySelectorValue as jest.Mock).mockReturnValue({
      id: 'view-1',
      type: 'TABLE',
      viewFields: [
        {
          id: 'existing-view-field-id',
          fieldMetadataId: 'person-name-field-id',
          position: 0,
          isActive: true,
          isVisible: true,
        },
      ],
    });

    (usePerformViewFieldAPIPersist as jest.Mock).mockReturnValue({
      performViewFieldAPICreate,
      performViewFieldAPIUpdate,
    });

    performViewFieldAPICreate.mockResolvedValue({
      status: 'successful',
      response: null,
    });
    performViewFieldAPIUpdate.mockResolvedValue({
      status: 'successful',
      response: null,
    });
  });

  it('creates a missing internal entity relation view field on table views', async () => {
    render(<RecordIndexInternalEntityViewFieldsSyncEffect />);

    await waitFor(() => {
      expect(performViewFieldAPICreate).toHaveBeenCalledWith({
        inputs: [
          expect.objectContaining({
            viewId: 'view-1',
            fieldMetadataId: 'person-internal-entities-field-id',
            position: 1,
            size: 260,
            isVisible: true,
          }),
        ],
      });
    });
  });

  it('does not recreate the same view fields while the local view state is still stale', async () => {
    const { rerender } = render(
      <RecordIndexInternalEntityViewFieldsSyncEffect />,
    );

    await waitFor(() => {
      expect(performViewFieldAPICreate).toHaveBeenCalledTimes(1);
    });

    rerender(<RecordIndexInternalEntityViewFieldsSyncEffect />);

    await waitFor(() => {
      expect(performViewFieldAPICreate).toHaveBeenCalledTimes(1);
    });
  });

  it('resizes legacy internal entity relation view fields created with the old default width', async () => {
    (useAtomFamilySelectorValue as jest.Mock).mockReturnValue({
      id: 'view-1',
      type: 'TABLE',
      viewFields: [
        {
          id: 'existing-view-field-id',
          fieldMetadataId: 'person-name-field-id',
          position: 0,
          size: 180,
          isActive: true,
          isVisible: true,
        },
        {
          id: 'legacy-internal-entity-view-field-id',
          fieldMetadataId: 'person-internal-entities-field-id',
          position: 1,
          size: 180,
          isActive: true,
          isVisible: true,
        },
      ],
    });

    render(<RecordIndexInternalEntityViewFieldsSyncEffect />);

    await waitFor(() => {
      expect(performViewFieldAPIUpdate).toHaveBeenCalledWith([
        {
          input: {
            id: 'legacy-internal-entity-view-field-id',
            update: {
              size: 260,
            },
          },
        },
      ]);
    });
  });

  it('shows membership relation columns and hides technical id columns', async () => {
    (useContextStoreObjectMetadataItemOrThrow as jest.Mock).mockReturnValue({
      objectMetadataItem: membershipObjectMetadataItem,
    });

    (useObjectMetadataItems as jest.Mock).mockReturnValue({
      objectMetadataItems: [membershipObjectMetadataItem],
    });

    (useAtomFamilySelectorValue as jest.Mock).mockReturnValue({
      id: 'view-1',
      type: 'TABLE',
      viewFields: [
        {
          id: 'membership-id-view-field-id',
          fieldMetadataId: 'membership-id-field-id',
          position: 0,
          isActive: true,
          isVisible: true,
          size: 180,
        },
        {
          id: 'membership-person-id-view-field-id',
          fieldMetadataId: 'membership-person-id-field-id',
          position: 1,
          isActive: true,
          isVisible: true,
          size: 180,
        },
        {
          id: 'membership-internal-entity-id-view-field-id',
          fieldMetadataId: 'membership-internal-entity-id-field-id',
          position: 2,
          isActive: true,
          isVisible: true,
          size: 180,
        },
      ],
    });

    render(<RecordIndexInternalEntityViewFieldsSyncEffect />);

    await waitFor(() => {
      expect(performViewFieldAPICreate).toHaveBeenCalledWith({
        inputs: expect.arrayContaining([
          expect.objectContaining({
            fieldMetadataId: 'junction-person-field-id',
            size: 260,
            isVisible: true,
          }),
          expect.objectContaining({
            fieldMetadataId: 'junction-internal-entity-field-id',
            size: 260,
            isVisible: true,
          }),
        ]),
      });
    });

    await waitFor(() => {
      expect(performViewFieldAPIUpdate).toHaveBeenCalledWith(
        expect.arrayContaining([
          {
            input: {
              id: 'membership-person-id-view-field-id',
              update: {
                isVisible: false,
              },
            },
          },
          {
            input: {
              id: 'membership-internal-entity-id-view-field-id',
              update: {
                isVisible: false,
              },
            },
          },
        ]),
      );
    });

    const hiddenViewFieldIds = (
      performViewFieldAPIUpdate.mock.calls.at(-1)?.[0] as Array<{
        input: { id: string };
      }>
    ).map((entry) => entry.input.id);

    expect(hiddenViewFieldIds).not.toContain('membership-id-view-field-id');
  });
});
