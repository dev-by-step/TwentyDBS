import { act, renderHook } from '@testing-library/react';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { type ReactNode } from 'react';

import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { getObjectTypename } from '@/object-record/cache/utils/getObjectTypename';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useDeleteOneRecord } from '@/object-record/hooks/useDeleteOneRecord';
import { useUpdateJunctionRelationFromCell } from '@/object-record/record-field/ui/hooks/useUpdateJunctionRelationFromCell';
import { findTargetFieldInfo } from '@/object-record/record-field/ui/utils/junction/findTargetFieldInfo';
import { getJunctionConfig } from '@/object-record/record-field/ui/utils/junction/getJunctionConfig';
import { getSourceJoinColumnName } from '@/object-record/record-field/ui/utils/junction/getSourceJoinColumnName';
import { searchRecordStoreFamilyState } from '@/object-record/record-picker/multiple-record-picker/states/searchRecordStoreComponentFamilyState';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: jest.fn(),
}));
jest.mock('@/object-record/cache/utils/getObjectTypename', () => ({
  getObjectTypename: jest.fn(),
}));
jest.mock('@/object-record/hooks/useCreateOneRecord', () => ({
  useCreateOneRecord: jest.fn(),
}));
jest.mock('@/object-record/hooks/useDeleteOneRecord', () => ({
  useDeleteOneRecord: jest.fn(),
}));
jest.mock(
  '@/object-record/record-field/ui/utils/junction/findTargetFieldInfo',
  () => ({
    findTargetFieldInfo: jest.fn(),
  }),
);
jest.mock(
  '@/object-record/record-field/ui/utils/junction/getJunctionConfig',
  () => ({
    getJunctionConfig: jest.fn(),
  }),
);
jest.mock(
  '@/object-record/record-field/ui/utils/junction/getSourceJoinColumnName',
  () => ({
    getSourceJoinColumnName: jest.fn(),
  }),
);
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'junction-record-id'),
}));

const mockCreateJunctionRecord = jest.fn();
const mockDeleteJunctionRecord = jest.fn();

const recordId = 'person-record-id';
const targetRecordId = 'internal-entity-record-id';
const fieldName = 'internalEntities';

const createDeferred = <T,>() => {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;

  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
};

const getWrapper = (store: ReturnType<typeof createStore>) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <JotaiProvider store={store}>{children}</JotaiProvider>;
  };

describe('useUpdateJunctionRelationFromCell', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (useObjectMetadataItems as jest.Mock).mockReturnValue({
      objectMetadataItems: [
        { id: 'person-metadata-id', nameSingular: 'person' },
      ],
    });

    (getJunctionConfig as jest.Mock).mockReturnValue({
      junctionObjectMetadata: { nameSingular: 'personInternalEntity' },
      sourceField: { name: 'person' },
      targetFields: [{ id: 'target-field-id' }],
    });

    (findTargetFieldInfo as jest.Mock).mockReturnValue({
      fieldName: 'internalEntity',
      joinColumnName: 'internalEntityId',
    });

    (getSourceJoinColumnName as jest.Mock).mockReturnValue('personId');
    (getObjectTypename as jest.Mock).mockReturnValue('PersonInternalEntity');

    (useCreateOneRecord as jest.Mock).mockReturnValue({
      createOneRecord: mockCreateJunctionRecord,
    });

    (useDeleteOneRecord as jest.Mock).mockReturnValue({
      deleteOneRecord: mockDeleteJunctionRecord,
    });
  });

  it('should update the source record only after the junction mutation succeeds', async () => {
    const store = createStore();
    const deferredCreate = createDeferred<void>();

    mockCreateJunctionRecord.mockReturnValueOnce(deferredCreate.promise);

    store.set(recordStoreFamilyState.atomFamily(recordId), {
      id: recordId,
      __typename: 'Person',
      [fieldName]: [],
    });

    store.set(searchRecordStoreFamilyState.atomFamily(targetRecordId), {
      recordId: targetRecordId,
      label: 'WEKNOW',
      objectLabelSingular: 'Internal Entity',
      objectNameSingular: 'internalEntity',
      tsRank: 1,
      tsRankCD: 1,
      record: {
        id: targetRecordId,
        __typename: 'InternalEntity',
        name: 'WEKNOW',
      },
    });

    const { result } = renderHook(
      () =>
        useUpdateJunctionRelationFromCell({
          fieldMetadataItem: { settings: {} } as any,
          fieldDefinition: {
            metadata: {
              fieldName,
              objectMetadataNameSingular: 'person',
              relationObjectMetadataId: 'junction-metadata-id',
              relationObjectMetadataNameSingular: 'personInternalEntity',
            },
          } as any,
          recordId,
        }),
      { wrapper: getWrapper(store) },
    );

    let updatePromise: Promise<void> | undefined;

    act(() => {
      updatePromise = result.current.updateJunctionRelationFromCell({
        morphItem: {
          recordId: targetRecordId,
          objectMetadataId: 'internal-entity-metadata-id',
          isSelected: true,
        } as any,
      });
    });

    expect(mockCreateJunctionRecord).toHaveBeenCalledWith({
      id: 'junction-record-id',
      personId: recordId,
      internalEntityId: targetRecordId,
    });

    expect(store.get(recordStoreFamilyState.atomFamily(recordId))).toEqual({
      id: recordId,
      __typename: 'Person',
      [fieldName]: [],
    });

    await act(async () => {
      deferredCreate.resolve(undefined);
      await updatePromise;
    });

    expect(
      store.get(recordStoreFamilyState.atomFamily(recordId)),
    ).toMatchObject({
      id: recordId,
      __typename: 'Person',
      [fieldName]: [
        {
          id: 'junction-record-id',
          __typename: 'PersonInternalEntity',
          personId: recordId,
          internalEntityId: targetRecordId,
          internalEntity: {
            id: targetRecordId,
            __typename: 'InternalEntity',
            name: 'WEKNOW',
          },
        },
      ],
    });
  });

  it('should keep the source record unchanged when the junction mutation fails', async () => {
    const store = createStore();
    const mutationError = new Error('create junction failed');

    mockCreateJunctionRecord.mockRejectedValueOnce(mutationError);

    store.set(recordStoreFamilyState.atomFamily(recordId), {
      id: recordId,
      __typename: 'Person',
      [fieldName]: [],
    });

    store.set(searchRecordStoreFamilyState.atomFamily(targetRecordId), {
      recordId: targetRecordId,
      label: 'WEKNOW',
      objectLabelSingular: 'Internal Entity',
      objectNameSingular: 'internalEntity',
      tsRank: 1,
      tsRankCD: 1,
      record: {
        id: targetRecordId,
        __typename: 'InternalEntity',
        name: 'WEKNOW',
      },
    });

    const { result } = renderHook(
      () =>
        useUpdateJunctionRelationFromCell({
          fieldMetadataItem: { settings: {} } as any,
          fieldDefinition: {
            metadata: {
              fieldName,
              objectMetadataNameSingular: 'person',
              relationObjectMetadataId: 'junction-metadata-id',
              relationObjectMetadataNameSingular: 'personInternalEntity',
            },
          } as any,
          recordId,
        }),
      { wrapper: getWrapper(store) },
    );

    await act(async () => {
      await expect(
        result.current.updateJunctionRelationFromCell({
          morphItem: {
            recordId: targetRecordId,
            objectMetadataId: 'internal-entity-metadata-id',
            isSelected: true,
          } as any,
        }),
      ).rejects.toThrow('create junction failed');
    });

    expect(store.get(recordStoreFamilyState.atomFamily(recordId))).toEqual({
      id: recordId,
      __typename: 'Person',
      [fieldName]: [],
    });
  });
});
