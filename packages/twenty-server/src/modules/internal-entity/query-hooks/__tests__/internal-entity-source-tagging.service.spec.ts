import { type ObjectRecord } from 'twenty-shared/types';

import { CommonQueryRunnerExceptionCode } from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';
import { type ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { type GlobalWorkspaceDataSourceService } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.service';
import { buildWorkspaceAuthContext } from 'src/modules/internal-entity/__tests__/factories/workspace-auth-context.factory';
import { buildInternalEntitySeed } from 'src/modules/internal-entity/__tests__/factories/internal-entity-test.factory';
import {
  buildCompanyRecord,
  buildOpportunityRecord,
  buildPersonRecord,
  buildWorkspaceRecord,
} from 'src/modules/internal-entity/__tests__/factories/workspace-record.factory';
import { InternalEntitySourceTaggingService } from 'src/modules/internal-entity/query-hooks/internal-entity-source-tagging.service';
import { type WorkspaceMemberInternalEntityService } from 'src/modules/internal-entity/services/workspace-member-internal-entity.service';

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
  const workspace = buildWorkspaceRecord();
  const internalEntity = buildInternalEntitySeed();

  const dataSource: MockDataSource = {
    query: jest.fn().mockResolvedValue([{ id: internalEntity.id }]),
  };
  const globalWorkspaceDataSourceService = {
    getGlobalWorkspaceDataSource: jest.fn().mockReturnValue(dataSource),
  };
  const objectMetadataService = buildObjectMetadataService();
  const service = new InternalEntitySourceTaggingService(
    globalWorkspaceDataSourceService as unknown as GlobalWorkspaceDataSourceService,
    objectMetadataService as unknown as ObjectMetadataService,
    {
      resolveContext: jest.fn(
        async ({
          fallbackEntityId,
          requestedActiveEntityId,
        }: {
          fallbackEntityId?: string | null;
          requestedActiveEntityId?: string | null;
        }) => ({
          currentEntityId: fallbackEntityId ?? null,
          activeEntityId: requestedActiveEntityId ?? fallbackEntityId ?? null,
          entityIds: fallbackEntityId ? [fallbackEntityId] : [],
        }),
      ),
    } as unknown as WorkspaceMemberInternalEntityService,
  );

  const makeAuthContext = ({
    activeInternalEntityId,
    entityId = internalEntity.id,
  }: {
    activeInternalEntityId?: string | null;
    entityId?: string | null;
  } = {}) =>
    buildWorkspaceAuthContext({
      activeInternalEntityId,
      entityId,
      workspaceId: workspace.id,
    });

  return {
    dataSource,
    globalWorkspaceDataSourceService,
    objectMetadataService,
    service,
    workspaceId: workspace.id,
    internalEntityId: internalEntity.id,
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

  it('should use the active internal entity for opportunity create payloads', async () => {
    const { dataSource, service, makeAuthContext } = buildServiceContext();
    const activeEntityId = buildInternalEntitySeed().id;
    const authContext = makeAuthContext({
      activeInternalEntityId: activeEntityId,
    });

    const payload = await service.tagCreateOnePayload(
      authContext,
      'opportunity',
      {
        data: {
          name: 'Opportunity A',
        },
      },
    );

    expect(payload.data).toMatchObject({
      name: 'Opportunity A',
      internalEntityId: activeEntityId,
    });
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('"internalEntity"'),
      [activeEntityId],
      undefined,
      { shouldBypassPermissionChecks: true },
    );
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
    const person = buildPersonRecord();
    const otherPerson = buildPersonRecord();

    await service.createMembershipsForRecords({
      authContext: makeAuthContext(),
      objectName: 'person',
      records: [{ id: person.id }, { id: otherPerson.id }] as ObjectRecord[],
    });

    const [query, parameters, queryRunner, options] = dataSource.query.mock
      .calls[0] as [string, string[], unknown, unknown];

    expect(query).toContain('INSERT INTO');
    expect(query).toContain('"personEntityMembership"');
    expect(query).toContain('"personId"');
    expect(query).toContain('"internalEntityId"');
    expect(parameters).toHaveLength(6);
    expect(parameters[1]).toBe(person.id);
    expect(parameters[2]).toBe(internalEntityId);
    expect(parameters[4]).toBe(otherPerson.id);
    expect(parameters[5]).toBe(internalEntityId);
    expect(queryRunner).toBeUndefined();
    expect(options).toEqual({ shouldBypassPermissionChecks: true });
  });

  it('should create company membership rows after records are created', async () => {
    const { dataSource, service, internalEntityId, makeAuthContext } =
      buildServiceContext();
    const company = buildCompanyRecord();
    const otherCompany = buildCompanyRecord();

    await service.createMembershipsForRecords({
      authContext: makeAuthContext(),
      objectName: 'company',
      records: [{ id: company.id }, { id: otherCompany.id }] as ObjectRecord[],
    });

    const [query, parameters, queryRunner, options] = dataSource.query.mock
      .calls[0] as [string, string[], unknown, unknown];

    expect(query).toContain('INSERT INTO');
    expect(query).toContain('"companyEntityMembership"');
    expect(query).toContain('"companyId"');
    expect(query).toContain('"internalEntityId"');
    expect(parameters).toHaveLength(6);
    expect(parameters[1]).toBe(company.id);
    expect(parameters[2]).toBe(internalEntityId);
    expect(parameters[4]).toBe(otherCompany.id);
    expect(parameters[5]).toBe(internalEntityId);
    expect(queryRunner).toBeUndefined();
    expect(options).toEqual({ shouldBypassPermissionChecks: true });
  });

  it('should not create membership rows for opportunities', async () => {
    const { dataSource, service, makeAuthContext } = buildServiceContext();
    const opportunity = buildOpportunityRecord();

    await service.createMembershipsForRecords({
      authContext: makeAuthContext(),
      objectName: 'opportunity',
      records: [{ id: opportunity.id }] as ObjectRecord[],
    });

    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
