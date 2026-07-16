import { InternalEntityScopeCacheService } from 'src/modules/internal-entity/query-hooks/services/internal-entity-scope-cache.service';

describe('InternalEntityScopeCacheService', () => {
  let service: InternalEntityScopeCacheService;

  beforeEach(() => {
    service = new InternalEntityScopeCacheService();
  });

  it('should store and return cached readable ids', () => {
    const params = {
      workspaceId: 'workspace-1',
      workspaceMemberId: 'member-1',
      entityIds: ['entity-a', 'entity-b'],
      objectName: 'readableCompanyIds',
    };

    service.setReadableIds(params, ['id-1', 'id-2']);

    expect(service.getReadableIds(params)).toEqual(['id-1', 'id-2']);
  });

  it('should return undefined for unknown keys', () => {
    expect(
      service.getReadableIds({
        workspaceId: 'workspace-1',
        workspaceMemberId: 'member-1',
        entityIds: ['entity-a'],
        objectName: 'readableCompanyIds',
      }),
    ).toBeUndefined();
  });

  it('should treat entity id order as irrelevant', () => {
    const params = {
      workspaceId: 'workspace-1',
      workspaceMemberId: 'member-1',
      entityIds: ['entity-a', 'entity-b'],
      objectName: 'readableCompanyIds',
    };

    service.setReadableIds(params, ['id-1']);

    expect(
      service.getReadableIds({
        ...params,
        entityIds: ['entity-b', 'entity-a'],
      }),
    ).toEqual(['id-1']);
  });

  it('should expire cached entries after TTL', () => {
    jest.useFakeTimers();

    const params = {
      workspaceId: 'workspace-1',
      workspaceMemberId: 'member-1',
      entityIds: ['entity-a'],
      objectName: 'readableCompanyIds',
    };

    service.setReadableIds(params, ['id-1']);
    jest.advanceTimersByTime(30_001);

    expect(service.getReadableIds(params)).toBeUndefined();

    jest.useRealTimers();
  });

  it('should invalidate all cache entries for a workspace', () => {
    const workspaceParams = {
      workspaceId: 'workspace-1',
      workspaceMemberId: 'member-1',
      entityIds: ['entity-a'],
      objectName: 'readableCompanyIds',
    };
    const otherWorkspaceParams = {
      workspaceId: 'workspace-2',
      workspaceMemberId: 'member-1',
      entityIds: ['entity-a'],
      objectName: 'readableCompanyIds',
    };

    service.setReadableIds(workspaceParams, ['id-1']);
    service.setReadableIds(otherWorkspaceParams, ['id-2']);

    service.invalidateWorkspaceCache('workspace-1');

    expect(service.getReadableIds(workspaceParams)).toBeUndefined();
    expect(service.getReadableIds(otherWorkspaceParams)).toEqual(['id-2']);
  });
});
