import { type ObjectRecord } from 'twenty-shared/types';

import { faker } from '@faker-js/faker';

import { CommonQueryRunnerExceptionCode } from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { type GlobalWorkspaceDataSourceService } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.service';
import { InternalEntitySourceTaggingService } from 'src/modules/internal-entity/query-hooks/internal-entity-source-tagging.service';

type MockDataSource = {
  query: jest.Mock;
};

const buildObjectMetadataService = () => ({
  findOneWithinWorkspace: jest.fn(
    (_workspaceId: string, options: { where: { nameSingular: string } }) => {
      const nameSingular = options.where.nameSingular;

      return Promise.resolve({
        nameSingular,
        isCustom: false,
      });
    },
  ),
});

const buildServiceContext = () => {
  const workspaceId = faker.string.uuid();
  const internalEntityId = faker.string.uuid();

  const dataSource: MockDataSource = {
    query: jest.fn().mockResolvedValue([{ id: internalEntityId }]),
  };
  const globalWorkspaceDataSourceService = {
    getGlobalWorkspaceDataSource: jest.fn().mockReturnValue(dataSource),
  };
  const objectMetadataService = buildObjectMetadataService();
  const service = new InternalEntitySourceTaggingService(
    globalWorkspaceDataSourceService as unknown as GlobalWorkspaceDataSourceService,
    objectMetadataService as unknown as ObjectMetadataService,
  );

  const makeAuthContext = ({
    entityId = internalEntityId,
  }: {
    entityId?: string | null;
  } = {}): WorkspaceAuthContext =>
    ({
      type: 'user',
      workspace: {
        id: workspaceId,
      },
      user: {
        id: faker.string.uuid(),
        entityId,
      },
      userWorkspaceId: faker.string.uuid(),
      workspaceMemberId: faker.string.uuid(),
      workspaceMember: {
        id: faker.string.uuid(),
      },
    }) as WorkspaceAuthContext;

  return {
    dataSource,
    globalWorkspaceDataSourceService,
    objectMetadataService,
    service,
    workspaceId,
    internalEntityId,
    makeAuthContext,
  };
};

describe('InternalEntitySourceTaggingService', () => {
  it('should inject the user internal entity id on opportunity createOne payloads', async () => {
    const { dataSource, service, internalEntityId, makeAuthContext } =
      buildServiceContext();

    const payload = await service.tagCreateOnePayload(
      makeAuthContext(),
      'opportunity',
      {
        data: {
          name: 'Opportunity A',
        },
      },
    );

    expect(payload.data).toMatchObject({
      name: 'Opportunity A',
      internalEntityId,
    });
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('"internalEntity"'),
      [internalEntityId],
      undefined,
      { shouldBypassPermissionChecks: true },
    );
  });

  it('should inject the user internal entity id on every opportunity createMany record', async () => {
    const { service, internalEntityId, makeAuthContext } =
      buildServiceContext();

    const payload = await service.tagCreateManyPayload(
      makeAuthContext(),
      'opportunity',
      {
        data: [{ name: 'Opportunity A' }, { name: 'Opportunity B' }],
      },
    );

    expect(payload.data).toEqual([
      { name: 'Opportunity A', internalEntityId },
      { name: 'Opportunity B', internalEntityId },
    ]);
  });

  it('should validate person create payloads and fail when the user has no internal entity', async () => {
    const { dataSource, service, makeAuthContext } = buildServiceContext();

    await expect(
      service.tagCreateOnePayload(
        makeAuthContext({ entityId: null }),
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
    const { dataSource, service, internalEntityId, makeAuthContext } =
      buildServiceContext();
    const personId = faker.string.uuid();
    const otherPersonId = faker.string.uuid();

    await service.createMembershipsForRecords({
      authContext: makeAuthContext(),
      objectName: 'person',
      records: [{ id: personId }, { id: otherPersonId }] as ObjectRecord[],
    });

    const [query, parameters, queryRunner, options] = dataSource.query.mock
      .calls[0] as [string, string[], unknown, unknown];

    expect(query).toContain('INSERT INTO');
    expect(query).toContain('"personEntityMembership"');
    expect(query).toContain('"personId"');
    expect(query).toContain('"internalEntityId"');
    expect(parameters).toHaveLength(6);
    expect(parameters[1]).toBe(personId);
    expect(parameters[2]).toBe(internalEntityId);
    expect(parameters[4]).toBe(otherPersonId);
    expect(parameters[5]).toBe(internalEntityId);
    expect(queryRunner).toBeUndefined();
    expect(options).toEqual({ shouldBypassPermissionChecks: true });
  });

  it('should create company membership rows after records are created', async () => {
    const { dataSource, service, internalEntityId, makeAuthContext } =
      buildServiceContext();
    const companyId = faker.string.uuid();
    const otherCompanyId = faker.string.uuid();

    await service.createMembershipsForRecords({
      authContext: makeAuthContext(),
      objectName: 'company',
      records: [{ id: companyId }, { id: otherCompanyId }] as ObjectRecord[],
    });

    const [query, parameters, queryRunner, options] = dataSource.query.mock
      .calls[0] as [string, string[], unknown, unknown];

    expect(query).toContain('INSERT INTO');
    expect(query).toContain('"companyEntityMembership"');
    expect(query).toContain('"companyId"');
    expect(query).toContain('"internalEntityId"');
    expect(parameters).toHaveLength(6);
    expect(parameters[1]).toBe(companyId);
    expect(parameters[2]).toBe(internalEntityId);
    expect(parameters[4]).toBe(otherCompanyId);
    expect(parameters[5]).toBe(internalEntityId);
    expect(queryRunner).toBeUndefined();
    expect(options).toEqual({ shouldBypassPermissionChecks: true });
  });

  it('should not create membership rows for opportunities', async () => {
    const { dataSource, service, makeAuthContext } = buildServiceContext();
    const opportunityId = faker.string.uuid();

    await service.createMembershipsForRecords({
      authContext: makeAuthContext(),
      objectName: 'opportunity',
      records: [{ id: opportunityId }] as ObjectRecord[],
    });

    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
