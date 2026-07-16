import { type ObjectRecord } from 'twenty-shared/types';

import { CommonQueryRunnerExceptionCode } from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';
import {
  type UserWorkspaceAuthContext,
  type WorkspaceAuthContext,
} from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { PermissionsExceptionCode } from 'src/engine/metadata-modules/permissions/permissions.exception';
import { type InternalEntityAuditLoggerService } from 'src/modules/internal-entity/services/internal-entity-audit-logger.service';
import { type InternalEntityRoleService } from 'src/modules/internal-entity/services/internal-entity-role.service';
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
  const internalEntityRoleService = {
    canManageEntityScopedRecords: jest.fn().mockResolvedValue(false),
  };
  const internalEntityAuditLoggerService = {
    logSourceTaggingBypass: jest.fn(),
  };
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
    internalEntityAuditLoggerService as unknown as InternalEntityAuditLoggerService,
    internalEntityRoleService as unknown as InternalEntityRoleService,
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

  const asPlatformAdmin = (
    authContext: WorkspaceAuthContext,
  ): WorkspaceAuthContext => {
    internalEntityRoleService.canManageEntityScopedRecords.mockResolvedValue(
      true,
    );

    return {
      ...authContext,
      user: {
        ...(authContext as { user: Record<string, unknown> }).user,
        canAccessFullAdminPanel: true,
      },
    } as WorkspaceAuthContext;
  };

  return {
    dataSource,
    globalWorkspaceDataSourceService,
    objectMetadataService,
    internalEntityRoleService,
    service,
    workspaceId: workspace.id,
    internalEntityId: internalEntity.id,
    makeAuthContext,
    asPlatformAdmin,
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

  it('should preserve an explicit internalEntity relation targeting the user own entity on opportunity createOne payloads', async () => {
    const { dataSource, service, internalEntityId, makeAuthContext } =
      buildServiceContext();

    const payload = await service.tagCreateOnePayload(
      makeAuthContext(),
      'opportunity',
      {
        data: {
          name: 'Opportunity A',
          internalEntity: {
            connect: {
              where: {
                id: internalEntityId,
              },
            },
          },
        },
      },
    );

    expect(payload.data).toEqual({
      name: 'Opportunity A',
      internalEntity: {
        connect: {
          where: {
            id: internalEntityId,
          },
        },
      },
    });
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('should preserve explicit internalEntity assignments targeting the user own entity on opportunity createMany payloads', async () => {
    const { service, internalEntityId, makeAuthContext } =
      buildServiceContext();

    const payload = await service.tagCreateManyPayload(
      makeAuthContext(),
      'opportunity',
      {
        data: [
          {
            name: 'Opportunity A',
            internalEntityId,
          },
          {
            name: 'Opportunity B',
            internalEntity: {
              connect: {
                where: {
                  id: internalEntityId,
                },
              },
            },
          },
        ],
      },
    );

    expect(payload.data).toEqual([
      {
        name: 'Opportunity A',
        internalEntityId,
      },
      {
        name: 'Opportunity B',
        internalEntity: {
          connect: {
            where: {
              id: internalEntityId,
            },
          },
        },
      },
    ]);
  });

  it('should only inject the active internal entity on opportunity createMany records that are missing one', async () => {
    const { service, internalEntityId, makeAuthContext } =
      buildServiceContext();

    const payload = await service.tagCreateManyPayload(
      makeAuthContext(),
      'opportunity',
      {
        data: [
          { name: 'Opportunity A' },
          {
            name: 'Opportunity B',
            internalEntityId,
          },
        ],
      },
    );

    expect(payload.data).toEqual([
      { name: 'Opportunity A', internalEntityId },
      {
        name: 'Opportunity B',
        internalEntityId,
      },
    ]);
  });

  it('should reject an opportunity createOne payload that explicitly targets another entity', async () => {
    const { dataSource, service, makeAuthContext } = buildServiceContext();
    const foreignInternalEntityId = buildInternalEntitySeed().id;

    await expect(
      service.tagCreateOnePayload(makeAuthContext(), 'opportunity', {
        data: {
          name: 'Opportunity A',
          internalEntityId: foreignInternalEntityId,
        },
      }),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('should reject an opportunity createOne payload targeting another entity via a relation connect payload', async () => {
    const { service, makeAuthContext } = buildServiceContext();
    const foreignInternalEntityId = buildInternalEntitySeed().id;

    await expect(
      service.tagCreateOnePayload(makeAuthContext(), 'opportunity', {
        data: {
          name: 'Opportunity A',
          internalEntity: {
            connect: {
              where: {
                id: foreignInternalEntityId,
              },
            },
          },
        },
      }),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should reject an opportunity createMany payload with any record explicitly targeting another entity', async () => {
    const { service, internalEntityId, makeAuthContext } =
      buildServiceContext();
    const foreignInternalEntityId = buildInternalEntitySeed().id;

    await expect(
      service.tagCreateManyPayload(makeAuthContext(), 'opportunity', {
        data: [
          { name: 'Opportunity A', internalEntityId },
          { name: 'Opportunity B', internalEntityId: foreignInternalEntityId },
        ],
      }),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should allow a platform admin to assign an opportunity to any entity on create', async () => {
    const { dataSource, service, makeAuthContext, asPlatformAdmin } =
      buildServiceContext();
    const foreignInternalEntityId = buildInternalEntitySeed().id;

    const payload = await service.tagCreateOnePayload(
      asPlatformAdmin(makeAuthContext()),
      'opportunity',
      {
        data: {
          name: 'Opportunity A',
          internalEntityId: foreignInternalEntityId,
        },
      },
    );

    expect(payload.data).toEqual({
      name: 'Opportunity A',
      internalEntityId: foreignInternalEntityId,
    });
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('should allow an entity manager to assign an opportunity to any entity on create', async () => {
    const {
      service,
      makeAuthContext,
      internalEntityRoleService,
    } = buildServiceContext();
    const foreignInternalEntityId = buildInternalEntitySeed().id;
    const authContext = makeAuthContext() as UserWorkspaceAuthContext;

    internalEntityRoleService.canManageEntityScopedRecords.mockResolvedValue(
      true,
    );

    const payload = await service.tagCreateOnePayload(
      authContext,
      'opportunity',
      {
        data: {
          name: 'Opportunity A',
          internalEntityId: foreignInternalEntityId,
        },
      },
    );

    expect(payload.data).toEqual({
      name: 'Opportunity A',
      internalEntityId: foreignInternalEntityId,
    });
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

  it('should bypass source tagging validation for technical import company creations by a platform admin', async () => {
    const { dataSource, service, makeAuthContext, asPlatformAdmin } =
      buildServiceContext();

    const payload = await service.tagCreateOnePayload(
      {
        ...asPlatformAdmin(makeAuthContext({ entityId: null })),
        shouldBypassInternalEntitySourceTagging: true,
      },
      'company',
      {
        data: {
          id: '003f2bd8-d8a5-4efd-b4af-4fd094214bb3',
          name: '003f2bd8-d8a5-4efd-b4af-4fd094214bb3',
        },
      },
    );

    expect(payload.data).toEqual({
      id: '003f2bd8-d8a5-4efd-b4af-4fd094214bb3',
      name: '003f2bd8-d8a5-4efd-b4af-4fd094214bb3',
    });
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('should ignore the bypass flag for users without an entity management role', async () => {
    const { service, makeAuthContext } = buildServiceContext();

    await expect(
      service.tagCreateOnePayload(
        {
          ...makeAuthContext({ entityId: null }),
          shouldBypassInternalEntitySourceTagging: true,
        },
        'company',
        {
          data: {
            name: 'Company A',
          },
        },
      ),
    ).rejects.toMatchObject({
      code: CommonQueryRunnerExceptionCode.INVALID_AUTH_CONTEXT,
    });
  });

  it('should bypass source tagging for opportunity createOne when a platform admin enables the technical import bypass', async () => {
    const { dataSource, service, makeAuthContext, asPlatformAdmin } =
      buildServiceContext();

    const payload = await service.tagCreateOnePayload(
      {
        ...asPlatformAdmin(makeAuthContext({ entityId: null })),
        shouldBypassInternalEntitySourceTagging: true,
      },
      'opportunity',
      {
        data: {
          name: 'Opportunity A',
        },
      },
    );

    expect(payload.data).toEqual({
      name: 'Opportunity A',
    });
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('should bypass source tagging for opportunity createMany when a platform admin enables the technical import bypass', async () => {
    const { dataSource, service, makeAuthContext, asPlatformAdmin } =
      buildServiceContext();

    const payload = await service.tagCreateManyPayload(
      {
        ...asPlatformAdmin(makeAuthContext({ entityId: null })),
        shouldBypassInternalEntitySourceTagging: true,
      },
      'opportunity',
      {
        data: [{ name: 'Opportunity A' }, { name: 'Opportunity B' }],
      },
    );

    expect(payload.data).toEqual([
      { name: 'Opportunity A' },
      { name: 'Opportunity B' },
    ]);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('should still tag opportunity createOne payloads when a non-privileged user sets the bypass flag', async () => {
    const { dataSource, service, internalEntityId, makeAuthContext } =
      buildServiceContext();

    const payload = await service.tagCreateOnePayload(
      {
        ...makeAuthContext(),
        shouldBypassInternalEntitySourceTagging: true,
      },
      'opportunity',
      {
        data: {
          name: 'Opportunity A',
        },
      },
    );

    expect(payload.data).toEqual({
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

  it('should skip auto-membership creation when a platform admin enables the technical import bypass', async () => {
    const { dataSource, service, makeAuthContext, asPlatformAdmin } =
      buildServiceContext();
    const company = buildCompanyRecord();

    await service.createMembershipsForRecords({
      authContext: {
        ...asPlatformAdmin(makeAuthContext()),
        shouldBypassInternalEntitySourceTagging: true,
      },
      objectName: 'company',
      records: [{ id: company.id }] as ObjectRecord[],
    });

    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('should still create membership rows when a non-privileged user sets the bypass flag', async () => {
    const { dataSource, service, internalEntityId, makeAuthContext } =
      buildServiceContext();
    const company = buildCompanyRecord();

    await service.createMembershipsForRecords({
      authContext: {
        ...makeAuthContext(),
        shouldBypassInternalEntitySourceTagging: true,
      },
      objectName: 'company',
      records: [{ id: company.id }] as ObjectRecord[],
    });

    const [query, parameters] = dataSource.query.mock.calls[0] as [
      string,
      string[],
    ];

    expect(query).toContain('INSERT INTO');
    expect(query).toContain('"companyEntityMembership"');
    expect(parameters[1]).toBe(company.id);
    expect(parameters[2]).toBe(internalEntityId);
  });
});
