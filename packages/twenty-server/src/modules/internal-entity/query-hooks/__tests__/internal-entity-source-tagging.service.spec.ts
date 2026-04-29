import { type ObjectRecord } from 'twenty-shared/types';

import { CommonQueryRunnerExceptionCode } from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { type GlobalWorkspaceDataSourceService } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.service';
import { InternalEntitySourceTaggingService } from 'src/modules/internal-entity/query-hooks/internal-entity-source-tagging.service';

type MockDataSource = {
  query: jest.Mock;
};

const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';
const INTERNAL_ENTITY_ID = '550e8400-e29b-41d4-a716-446655440001';
const PERSON_ID = '550e8400-e29b-41d4-a716-446655440002';
const OTHER_PERSON_ID = '550e8400-e29b-41d4-a716-446655440003';

const buildAuthContext = ({
  entityId = INTERNAL_ENTITY_ID,
}: {
  entityId?: string | null;
} = {}): WorkspaceAuthContext =>
  ({
    type: 'user',
    workspace: {
      id: WORKSPACE_ID,
    },
    user: {
      id: 'user-id',
      entityId,
    },
    userWorkspaceId: 'user-workspace-id',
    workspaceMemberId: 'workspace-member-id',
    workspaceMember: {
      id: 'workspace-member-id',
    },
  }) as WorkspaceAuthContext;

const buildObjectMetadataService = () => {
  const objectMetadataService = {
    findOneWithinWorkspace: jest.fn(
      (_workspaceId: string, options: { where: { nameSingular: string } }) => {
        const nameSingular = options.where.nameSingular;

        return Promise.resolve({
          nameSingular,
          isCustom: false,
        });
      },
    ),
  };

  return objectMetadataService;
};

const buildServiceContext = () => {
  const dataSource: MockDataSource = {
    query: jest.fn().mockResolvedValue([{ id: INTERNAL_ENTITY_ID }]),
  };
  const globalWorkspaceDataSourceService = {
    getGlobalWorkspaceDataSource: jest.fn().mockReturnValue(dataSource),
  };
  const objectMetadataService = buildObjectMetadataService();
  const service = new InternalEntitySourceTaggingService(
    globalWorkspaceDataSourceService as unknown as GlobalWorkspaceDataSourceService,
    objectMetadataService as unknown as ObjectMetadataService,
  );

  return {
    dataSource,
    globalWorkspaceDataSourceService,
    objectMetadataService,
    service,
  };
};

describe('InternalEntitySourceTaggingService', () => {
  it('should inject the user internal entity id on opportunity createOne payloads', async () => {
    const { dataSource, service } = buildServiceContext();

    const payload = await service.tagCreateOnePayload(
      buildAuthContext(),
      'opportunity',
      {
        data: {
          name: 'Opportunity A',
        },
      },
    );

    expect(payload.data).toMatchObject({
      name: 'Opportunity A',
      internalEntityId: INTERNAL_ENTITY_ID,
    });
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('"internalEntity"'),
      [INTERNAL_ENTITY_ID],
      undefined,
      { shouldBypassPermissionChecks: true },
    );
  });

  it('should inject the user internal entity id on every opportunity createMany record', async () => {
    const { service } = buildServiceContext();

    const payload = await service.tagCreateManyPayload(
      buildAuthContext(),
      'opportunity',
      {
        data: [{ name: 'Opportunity A' }, { name: 'Opportunity B' }],
      },
    );

    expect(payload.data).toEqual([
      { name: 'Opportunity A', internalEntityId: INTERNAL_ENTITY_ID },
      { name: 'Opportunity B', internalEntityId: INTERNAL_ENTITY_ID },
    ]);
  });

  it('should validate person create payloads and fail when the user has no internal entity', async () => {
    const { dataSource, service } = buildServiceContext();

    await expect(
      service.tagCreateOnePayload(
        buildAuthContext({ entityId: null }),
        'person',
        {
          data: {
            name: 'Person A',
          },
        },
      ),
    ).rejects.toMatchObject({
      code: CommonQueryRunnerExceptionCode.INVALID_AUTH_CONTEXT,
    });

    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('should create person membership rows after records are created', async () => {
    const { dataSource, service } = buildServiceContext();

    await service.createMembershipsForRecords({
      authContext: buildAuthContext(),
      objectName: 'person',
      records: [{ id: PERSON_ID }, { id: OTHER_PERSON_ID }] as ObjectRecord[],
    });

    const [query, parameters, queryRunner, options] = dataSource.query.mock
      .calls[0] as [string, string[], unknown, unknown];

    expect(query).toContain('INSERT INTO');
    expect(query).toContain('"personEntityMembership"');
    expect(query).toContain('"personId"');
    expect(query).toContain('"internalEntityId"');
    expect(parameters).toHaveLength(6);
    expect(parameters[1]).toBe(PERSON_ID);
    expect(parameters[2]).toBe(INTERNAL_ENTITY_ID);
    expect(parameters[4]).toBe(OTHER_PERSON_ID);
    expect(parameters[5]).toBe(INTERNAL_ENTITY_ID);
    expect(queryRunner).toBeUndefined();
    expect(options).toEqual({ shouldBypassPermissionChecks: true });
  });

  it('should not create membership rows for opportunities', async () => {
    const { dataSource, service } = buildServiceContext();

    await service.createMembershipsForRecords({
      authContext: buildAuthContext(),
      objectName: 'opportunity',
      records: [{ id: PERSON_ID }] as ObjectRecord[],
    });

    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
