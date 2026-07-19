import { faker } from '@faker-js/faker';

import { CommonQueryRunnerExceptionCode } from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { PermissionsExceptionCode } from 'src/engine/metadata-modules/permissions/permissions.exception';

import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { ENTITY_MANAGER_ROLE_LABEL } from 'src/modules/internal-entity/query-hooks/constants/internal-entity-access.constants';
import { InternalEntityAccessPolicyService } from 'src/modules/internal-entity/query-hooks/services/internal-entity-access-policy.service';
import { InternalEntityScopeCacheService } from 'src/modules/internal-entity/query-hooks/services/internal-entity-scope-cache.service';
import { type WorkspaceMemberInternalEntityService } from 'src/modules/internal-entity/services/workspace-member-internal-entity.service';
import { type InternalEntityAuditLoggerService } from 'src/modules/internal-entity/services/internal-entity-audit-logger.service';
import { type InternalEntityRoleService } from 'src/modules/internal-entity/services/internal-entity-role.service';

const buildServiceContext = ({
  roleLabel,
  roleUniversalIdentifier,
  canAccessFullAdminPanel = false,
  persistedCanAccessFullAdminPanel,
  accessibleEntityIds,
  activeEntityId,
  includeActiveEntityHeader = true,
  objectMetadataByObjectName,
}: {
  roleLabel?: string;
  roleUniversalIdentifier?: string;
  canAccessFullAdminPanel?: boolean;
  persistedCanAccessFullAdminPanel?: boolean;
  accessibleEntityIds?: string[];
  activeEntityId?: string;
  includeActiveEntityHeader?: boolean;
  objectMetadataByObjectName?: Record<
    string,
    { name: string; settings: Record<string, unknown> }[]
  >;
} = {}) => {
  const workspaceId = faker.string.uuid();
  const entityId = faker.string.uuid();
  const userId = faker.string.uuid();
  const userWorkspaceId = faker.string.uuid();
  const workspaceMemberId = faker.string.uuid();

  const opportunityRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const noteRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const taskRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const attachmentRepository = {
    findOne: jest.fn(),
  };
  const noteTargetRepository = {
    findOne: jest.fn(),
  };
  const taskTargetRepository = {
    findOne: jest.fn(),
  };
  const membershipRepository = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
  };

  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(async (fn: () => unknown) => fn()),
    getRepository: jest.fn(async (_workspaceId: string, objectName: string) => {
      switch (objectName) {
        case 'opportunity':
          return opportunityRepository;
        case 'note':
          return noteRepository;
        case 'task':
          return taskRepository;
        case 'attachment':
          return attachmentRepository;
        case 'noteTarget':
          return noteTargetRepository;
        case 'taskTarget':
          return taskTargetRepository;
        case 'companyEntityMembership':
        case 'personEntityMembership':
          return membershipRepository;
        case 'company':
        case 'person':
          return {
            findOne: jest.fn(),
          };
        default:
          return {
            findOne: jest.fn(),
            find: jest.fn(),
          };
      }
    }),
  };

  const userRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: userId,
      canAccessFullAdminPanel:
        persistedCanAccessFullAdminPanel ?? canAccessFullAdminPanel,
    }),
  };

  const objectMetadataService = {
    findOneWithinWorkspace: jest
      .fn()
      .mockImplementation(
        async (
          _workspaceId: string,
          options: { where: { nameSingular: string } },
        ) => ({
          nameSingular: options.where.nameSingular,
          fields: objectMetadataByObjectName?.[options.where.nameSingular] ?? [
            {
              name: 'internalEntities',
              settings: { junctionTargetFieldId: faker.string.uuid() },
            },
            { name: 'internalEntitiesId', settings: {} },
            { name: 'internalEntity', settings: {} },
            { name: 'internalEntityId', settings: {} },
          ],
        }),
      ),
  };

  const internalEntityScopeCacheService = new InternalEntityScopeCacheService();

  const internalEntityRoleService = {
    isPlatformAdmin: jest
      .fn()
      .mockResolvedValue(
        persistedCanAccessFullAdminPanel ?? canAccessFullAdminPanel,
      ),
    isEntityManager: jest
      .fn()
      .mockResolvedValue(roleLabel === ENTITY_MANAGER_ROLE_LABEL),
    canManageEntityScopedRecords: jest
      .fn()
      .mockResolvedValue(
        (persistedCanAccessFullAdminPanel ?? canAccessFullAdminPanel) ||
          roleLabel === ENTITY_MANAGER_ROLE_LABEL,
      ),
    isInternalEntitySuperAdmin: jest
      .fn()
      .mockReturnValue(canAccessFullAdminPanel),
  };

  const service = new InternalEntityAccessPolicyService(
    globalWorkspaceOrmManager as unknown as GlobalWorkspaceOrmManager,
    {
      // Ce mock reproduit la validation du vrai service
      // (`WorkspaceMemberInternalEntityService.resolveActiveEntityId`) : l'entité
      // active demandée par le client n'est retenue QUE si elle fait partie des
      // adhésions du membre, sinon on retombe sur son entité courante. Sans
      // cela, le mock pourrait exprimer un état impossible en production
      // (portée élargie à une entité dont l'appelant n'est pas membre) et
      // masquerait la garantie de sécurité correspondante.
      resolveContext: jest.fn().mockImplementation(async () => {
        const memberEntityIds = accessibleEntityIds ?? [entityId];

        return {
          currentEntityId: entityId,
          activeEntityId:
            activeEntityId !== undefined &&
            memberEntityIds.includes(activeEntityId)
              ? activeEntityId
              : entityId,
          entityIds: memberEntityIds,
        };
      }),
    } as unknown as WorkspaceMemberInternalEntityService,
    objectMetadataService as unknown as import('src/engine/metadata-modules/object-metadata/object-metadata.service').ObjectMetadataService,
    internalEntityScopeCacheService,
    {
      logPermissionDenied: jest.fn(),
    } as unknown as InternalEntityAuditLoggerService,
    internalEntityRoleService as unknown as InternalEntityRoleService,
  );

  const authContext: WorkspaceAuthContext = {
    type: 'user',
    workspace: {
      id: workspaceId,
    },
    userWorkspaceId,
    workspaceMemberId,
    workspaceMember: {
      id: workspaceMemberId,
    },
    user: {
      id: userId,
      entityId,
      canAccessFullAdminPanel,
    },
    activeInternalEntityId: includeActiveEntityHeader
      ? (activeEntityId ?? entityId)
      : undefined,
  } as WorkspaceAuthContext;

  return {
    service,
    authContext,
    opportunityRepository,
    noteRepository,
    taskRepository,
    attachmentRepository,
    noteTargetRepository,
    taskTargetRepository,
    membershipRepository,
    globalWorkspaceOrmManager,
    userRepository,
    internalEntityRoleService,
    userId,
    entityId,
    workspaceMemberId,
  };
};

describe('InternalEntityAccessPolicyService', () => {
  // La Vue Groupe n'est plus « aucun filtre » : elle est scopée à TOUTES les
  // entités du membre, résolues côté serveur. Une requête qui omet l'en-tête
  // d'entité active ne peut donc plus lire l'intégralité du workspace.
  it('should scope opportunity findMany queries to all member entities in group view', async () => {
    const { service, authContext, entityId } = buildServiceContext({
      includeActiveEntityHeader: false,
    });

    const filter = {
      stage: {
        eq: 'NEW',
      },
    };

    const payload = await service.scopeFindManyPayload(
      authContext,
      'opportunity',
      {
        filter,
      },
    );

    expect(payload.filter).toEqual({
      and: [filter, { internalEntityId: { in: [entityId] } }],
    });
  });

  // Garantie de sécurité : l'en-tête `ACTIVE_INTERNAL_ENTITY_ID_HEADER_NAME` est
  // fourni par le client, il ne doit donc jamais pouvoir ÉLARGIR la portée à une
  // entité dont l'appelant n'est pas membre — seulement la restreindre.
  it('should ignore an active entity header pointing to a non-member entity', async () => {
    const foreignEntityId = '99999999-9999-4999-8999-999999999999';
    const { service, authContext, entityId } = buildServiceContext({
      activeEntityId: foreignEntityId,
    });

    const payload = await service.scopeFindManyPayload(
      authContext,
      'opportunity',
      {},
    );

    expect(payload.filter).toEqual({
      internalEntityId: { in: [entityId] },
    });
    expect(JSON.stringify(payload.filter)).not.toContain(foreignEntityId);
  });

  it('should scope opportunity findMany queries to the current entity', async () => {
    const { service, authContext, entityId } = buildServiceContext();

    const payload = await service.scopeFindManyPayload(
      authContext,
      'opportunity',
      {
        filter: {
          stage: {
            eq: 'NEW',
          },
        },
      },
    );

    expect(payload.filter).toEqual({
      and: [
        {
          stage: {
            eq: 'NEW',
          },
        },
        {
          internalEntityId: {
            in: [entityId],
          },
        },
      ],
    });
  });

  it('should keep entity-scoped reads unscoped when internal entity metadata bootstrap is incomplete', async () => {
    const { service, authContext } = buildServiceContext({
      objectMetadataByObjectName: {
        company: [{ name: 'internalEntities', settings: {} }],
      },
    });

    const filter = {
      stage: {
        eq: 'NEW',
      },
    };

    const payload = await service.scopeFindManyPayload(
      authContext,
      'opportunity',
      {
        filter,
      },
    );

    expect(payload.filter).toEqual(filter);
  });

  it('should keep entity-scoped reads unscoped when the relation field itself is missing', async () => {
    const { service, authContext } = buildServiceContext({
      objectMetadataByObjectName: {
        company: [],
      },
    });

    const payload = await service.scopeFindManyPayload(authContext, 'person', {
      filter: {
        name: {
          ilike: '%a%',
        },
      },
    });

    expect(payload.filter).toEqual({
      name: {
        ilike: '%a%',
      },
    });
  });

  it('should scope entity-scoped reads once the junction relation field is fully configured', async () => {
    const activeEntityId = faker.string.uuid();
    const { service, authContext } = buildServiceContext({
      activeEntityId,
      // L'entité active doit faire partie des adhésions du membre, sinon elle
      // est ignorée (l'en-tête client ne peut pas élargir la portée).
      accessibleEntityIds: [activeEntityId],
      objectMetadataByObjectName: {
        company: [
          {
            name: 'internalEntities',
            settings: { junctionTargetFieldId: faker.string.uuid() },
          },
        ],
      },
    });

    const payload = await service.scopeFindManyPayload(authContext, 'person', {
      filter: {
        name: {
          ilike: '%a%',
        },
      },
    });

    expect(payload.filter).toEqual({
      and: [
        { name: { ilike: '%a%' } },
        { internalEntitiesId: { in: [activeEntityId] } },
      ],
    });
  });

  it('should strip invalid entity scope keys from incoming filters when metadata bootstrap is incomplete', async () => {
    const { service, authContext } = buildServiceContext({
      objectMetadataByObjectName: {
        company: [{ name: 'internalEntities', settings: {} }],
      },
    });

    const payload = await service.scopeFindManyPayload(
      authContext,
      'opportunity',
      {
        filter: {
          and: [
            { internalEntityId: { in: [faker.string.uuid()] } },
            { stage: { eq: 'NEW' } },
          ],
        },
      },
    );

    expect(payload.filter).toEqual({
      and: [{ stage: { eq: 'NEW' } }],
    });
  });

  it('should keep platform administrators scoped to their current entity for CRM data', async () => {
    const { service, authContext, entityId } = buildServiceContext({
      canAccessFullAdminPanel: true,
    });

    const payload = await service.scopeFindManyPayload(
      authContext,
      'opportunity',
      {
        filter: {
          stage: {
            eq: 'NEW',
          },
        },
      },
    );

    expect(payload.filter).toEqual({
      and: [
        {
          stage: {
            eq: 'NEW',
          },
        },
        {
          internalEntityId: {
            in: [entityId],
          },
        },
      ],
    });
  });

  it('should keep platform administrators unscoped for internal entity reads', async () => {
    const { service, authContext } = buildServiceContext({
      canAccessFullAdminPanel: true,
    });

    const payload = await service.scopeFindManyPayload(
      authContext,
      'internalEntity',
      {
        filter: {
          name: {
            ilike: '%weknow%',
          },
        },
      },
    );

    expect(payload.filter).toEqual({
      name: {
        ilike: '%weknow%',
      },
    });
  });

  it('should keep persisted platform administrators unscoped for internal entity reads when auth context is stale', async () => {
    const { service, authContext, internalEntityRoleService } =
      buildServiceContext({
        canAccessFullAdminPanel: false,
        persistedCanAccessFullAdminPanel: true,
      });

    const payload = await service.scopeFindManyPayload(
      authContext,
      'internalEntity',
      {
        filter: {
          name: {
            ilike: '%angle%',
          },
        },
      },
    );

    expect(internalEntityRoleService.isPlatformAdmin).toHaveBeenCalledWith(
      authContext,
    );
    expect(payload.filter).toEqual({
      name: {
        ilike: '%angle%',
      },
    });
  });

  it('should keep platform administrators unscoped for workspace member entity membership reads', async () => {
    const { service, authContext, workspaceMemberId } = buildServiceContext({
      canAccessFullAdminPanel: true,
    });

    const payload = await service.scopeFindManyPayload(
      authContext,
      'workspaceMemberEntityMembership',
      {
        filter: {
          workspaceMemberId: {
            eq: workspaceMemberId,
          },
        },
      },
    );

    expect(payload.filter).toEqual({
      workspaceMemberId: {
        eq: workspaceMemberId,
      },
    });
  });

  it('should deny internal entity creation to a standard user', async () => {
    const { service, authContext } = buildServiceContext();

    await expect(
      service.validateCreatePayload(authContext, 'internalEntity', {
        data: {
          name: 'Apple',
        },
      }),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should allow internal entity creation to a platform administrator', async () => {
    const { service, authContext } = buildServiceContext({
      canAccessFullAdminPanel: true,
    });

    await expect(
      service.validateCreatePayload(authContext, 'internalEntity', {
        data: {
          name: 'New Entity',
        },
      }),
    ).resolves.toEqual({
      data: {
        name: 'New Entity',
        workspaceId: authContext.workspace.id,
      },
    });
  });

  it('should deny internal entity creation to a workspace admin without superadmin access', async () => {
    const { service, authContext } = buildServiceContext({
      roleUniversalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
    });

    await expect(
      service.validateCreatePayload(authContext, 'internalEntity', {
        data: {
          name: 'New Entity',
        },
      }),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should normalize internal entity create payloads for a superadmin', async () => {
    const { service, authContext } = buildServiceContext({
      canAccessFullAdminPanel: true,
    });

    await expect(
      service.validateCreatePayload(authContext, 'internalEntity', {
        data: {
          name: '  New Entity  ',
        },
      }),
    ).resolves.toEqual({
      data: {
        name: 'New Entity',
        workspaceId: authContext.workspace.id,
      },
    });
  });

  it('should reject blank internal entity names', async () => {
    const { service, authContext } = buildServiceContext({
      canAccessFullAdminPanel: true,
    });

    await expect(
      service.validateCreatePayload(authContext, 'internalEntity', {
        data: {
          name: '   ',
        },
      }),
    ).rejects.toMatchObject({
      code: CommonQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
    });
  });

  it('should allow an author to update their own opportunity inside the entity', async () => {
    const {
      service,
      authContext,
      opportunityRepository,
      entityId,
      workspaceMemberId,
    } = buildServiceContext();

    opportunityRepository.findOne.mockResolvedValue({
      id: faker.string.uuid(),
      internalEntityId: entityId,
      createdBy: {
        workspaceMemberId,
      },
    });

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'opportunity',
        faker.string.uuid(),
        'updateOne',
      ),
    ).resolves.toBeUndefined();
  });

  it('should deny an entity manager from updating an internal entity', async () => {
    const { service, authContext } = buildServiceContext({
      roleLabel: ENTITY_MANAGER_ROLE_LABEL,
      roleUniversalIdentifier: STANDARD_ROLE.entityManager.universalIdentifier,
    });

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'internalEntity',
        faker.string.uuid(),
        'updateOne',
      ),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should deny a standard user from updating another user opportunity', async () => {
    const { service, authContext, opportunityRepository, entityId } =
      buildServiceContext();

    opportunityRepository.findOne.mockResolvedValue({
      id: faker.string.uuid(),
      internalEntityId: entityId,
      createdBy: {
        workspaceMemberId: faker.string.uuid(),
      },
    });

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'opportunity',
        faker.string.uuid(),
        'updateOne',
      ),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should allow an entity manager to scope a bulk opportunity mutation to their entity', async () => {
    const { service, authContext, entityId, membershipRepository } =
      buildServiceContext({
        roleLabel: ENTITY_MANAGER_ROLE_LABEL,
      });

    membershipRepository.find.mockResolvedValue([]);

    const payload = await service.scopeBulkMutationPayload(
      authContext,
      'opportunity',
      {
        filter: {
          stage: {
            eq: 'NEW',
          },
        },
      },
    );

    expect(payload.filter).toEqual({
      and: [
        {
          stage: {
            eq: 'NEW',
          },
        },
        {
          internalEntityId: {
            in: [entityId],
          },
        },
      ],
    });
  });

  it('should allow an entity manager to update another user opportunity inside the same entity', async () => {
    const { service, authContext, opportunityRepository, entityId } =
      buildServiceContext({
        roleLabel: ENTITY_MANAGER_ROLE_LABEL,
      });

    opportunityRepository.findOne.mockResolvedValue({
      id: faker.string.uuid(),
      internalEntityId: entityId,
      createdBy: {
        workspaceMemberId: faker.string.uuid(),
      },
    });

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'opportunity',
        faker.string.uuid(),
        'updateOne',
      ),
    ).resolves.toBeUndefined();
  });

  it('should allow a platform administrator to update another user opportunity inside the same entity', async () => {
    const { service, authContext, opportunityRepository, entityId } =
      buildServiceContext({
        canAccessFullAdminPanel: true,
      });

    opportunityRepository.findOne.mockResolvedValue({
      id: faker.string.uuid(),
      internalEntityId: entityId,
      createdBy: {
        workspaceMemberId: faker.string.uuid(),
      },
    });

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'opportunity',
        faker.string.uuid(),
        'updateOne',
      ),
    ).resolves.toBeUndefined();
  });

  it('should allow a platform administrator to update another entity opportunity', async () => {
    const { service, authContext, opportunityRepository } = buildServiceContext(
      {
        canAccessFullAdminPanel: true,
      },
    );

    opportunityRepository.findOne.mockResolvedValue({
      id: faker.string.uuid(),
      internalEntityId: faker.string.uuid(),
      createdBy: {
        workspaceMemberId: faker.string.uuid(),
      },
    });

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'opportunity',
        faker.string.uuid(),
        'updateOne',
      ),
    ).resolves.toBeUndefined();
  });

  it('should recognize the entity manager role by universal identifier', async () => {
    const { service, authContext, opportunityRepository, entityId } =
      buildServiceContext({
        roleLabel: ENTITY_MANAGER_ROLE_LABEL,
        roleUniversalIdentifier:
          STANDARD_ROLE.entityManager.universalIdentifier,
      });

    opportunityRepository.findOne.mockResolvedValue({
      id: faker.string.uuid(),
      internalEntityId: entityId,
      createdBy: {
        workspaceMemberId: faker.string.uuid(),
      },
    });

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'opportunity',
        faker.string.uuid(),
        'updateOne',
      ),
    ).resolves.toBeUndefined();
  });

  it('should scope opportunity groupBy queries to the current entity', async () => {
    const { service, authContext, entityId } = buildServiceContext();

    const payload = await service.scopeGroupByPayload(
      authContext,
      'opportunity',
      {
        filter: {
          stage: {
            eq: 'NEW',
          },
        },
        groupBy: [{ stage: true }],
      },
    );

    expect(payload.filter).toEqual({
      and: [
        {
          stage: {
            eq: 'NEW',
          },
        },
        {
          internalEntityId: {
            in: [entityId],
          },
        },
      ],
    });
  });

  it('should deny duplicate detection on entity-scoped objects to a standard user', async () => {
    const { service, authContext } = buildServiceContext();

    await expect(
      service.validateFindDuplicatesPayload(authContext, 'person', {
        ids: [faker.string.uuid()],
      }),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should allow an entity manager to detect duplicates on records that include the active entity among multiple memberships', async () => {
    const {
      service,
      authContext,
      membershipRepository,
      entityId,
      globalWorkspaceOrmManager,
    } = buildServiceContext({
      roleLabel: ENTITY_MANAGER_ROLE_LABEL,
    });
    const otherEntityId = faker.string.uuid();
    const ids = [faker.string.uuid(), faker.string.uuid()];

    membershipRepository.find.mockResolvedValue([
      {
        personId: ids[0],
        internalEntityId: entityId,
      },
      {
        personId: ids[0],
        internalEntityId: otherEntityId,
      },
    ]);

    await expect(
      service.validateFindDuplicatesPayload(authContext, 'person', {
        ids,
      }),
    ).resolves.toEqual({
      ids,
    });
    expect(
      globalWorkspaceOrmManager.executeInWorkspaceContext,
    ).toHaveBeenCalledWith(expect.any(Function), authContext);
  });

  it('should allow an entity manager to merge opportunities from the same entity', async () => {
    const {
      service,
      authContext,
      opportunityRepository,
      entityId,
      globalWorkspaceOrmManager,
    } = buildServiceContext({
      roleLabel: ENTITY_MANAGER_ROLE_LABEL,
    });

    opportunityRepository.findOne
      .mockResolvedValueOnce({
        id: faker.string.uuid(),
        internalEntityId: entityId,
        createdBy: {
          workspaceMemberId: faker.string.uuid(),
        },
      })
      .mockResolvedValueOnce({
        id: faker.string.uuid(),
        internalEntityId: entityId,
        createdBy: {
          workspaceMemberId: faker.string.uuid(),
        },
      });

    const ids = [faker.string.uuid(), faker.string.uuid()];

    await expect(
      service.validateMergeManyPayload(authContext, 'opportunity', {
        ids,
        conflictPriorityIndex: 0,
      }),
    ).resolves.toEqual({
      ids,
      conflictPriorityIndex: 0,
    });
    expect(
      globalWorkspaceOrmManager.executeInWorkspaceContext,
    ).toHaveBeenCalledWith(expect.any(Function), authContext);
  });

  it('should allow an entity manager to merge records that include the active entity among multiple memberships', async () => {
    const { service, authContext, membershipRepository, entityId } =
      buildServiceContext({
        roleLabel: ENTITY_MANAGER_ROLE_LABEL,
      });
    const otherEntityId = faker.string.uuid();
    const ids = [faker.string.uuid(), faker.string.uuid()];

    membershipRepository.find.mockResolvedValue([
      {
        personId: ids[0],
        internalEntityId: entityId,
      },
      {
        personId: ids[0],
        internalEntityId: otherEntityId,
      },
    ]);

    await expect(
      service.validateMergeManyPayload(authContext, 'person', {
        ids,
        conflictPriorityIndex: 0,
      }),
    ).resolves.toEqual({
      ids,
      conflictPriorityIndex: 0,
    });
  });

  it('should deny an entity manager from merging opportunities from another entity', async () => {
    const { service, authContext, opportunityRepository } = buildServiceContext(
      {
        roleLabel: ENTITY_MANAGER_ROLE_LABEL,
      },
    );

    opportunityRepository.findOne.mockResolvedValue({
      id: faker.string.uuid(),
      internalEntityId: faker.string.uuid(),
      createdBy: {
        workspaceMemberId: faker.string.uuid(),
      },
    });

    await expect(
      service.validateMergeManyPayload(authContext, 'opportunity', {
        ids: [faker.string.uuid()],
        conflictPriorityIndex: 0,
      }),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should deny entity membership deletion to a standard user', async () => {
    const { service, authContext, membershipRepository, entityId } =
      buildServiceContext();

    membershipRepository.findOne.mockResolvedValue({
      id: faker.string.uuid(),
      internalEntityId: entityId,
    });

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'personEntityMembership',
        faker.string.uuid(),
        'deleteOne',
      ),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should deny entity membership deletion to an entity manager of the same entity', async () => {
    const { service, authContext, membershipRepository, entityId } =
      buildServiceContext({
        roleLabel: ENTITY_MANAGER_ROLE_LABEL,
      });

    membershipRepository.findOne.mockResolvedValue({
      id: faker.string.uuid(),
      internalEntityId: entityId,
    });

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'personEntityMembership',
        faker.string.uuid(),
        'deleteOne',
      ),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should allow a platform administrator to create a membership for another entity', async () => {
    const { service, authContext } = buildServiceContext({
      canAccessFullAdminPanel: true,
    });

    await expect(
      service.validateCreatePayload(authContext, 'personEntityMembership', {
        data: {
          personId: faker.string.uuid(),
          internalEntityId: faker.string.uuid(),
        },
      }),
    ).resolves.toEqual({
      data: {
        personId: expect.any(String),
        internalEntityId: expect.any(String),
      },
    });
  });

  it('should deny an entity manager from creating membership when target entity is sent via relation payload', async () => {
    const { service, authContext, entityId } = buildServiceContext({
      roleLabel: ENTITY_MANAGER_ROLE_LABEL,
    });

    await expect(
      service.validateCreatePayload(authContext, 'personEntityMembership', {
        data: {
          personId: faker.string.uuid(),
          internalEntity: {
            connect: {
              id: entityId,
            },
          },
        },
      }),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should deny membership creation when relation payload targets another entity', async () => {
    const { service, authContext } = buildServiceContext({
      roleLabel: ENTITY_MANAGER_ROLE_LABEL,
    });

    await expect(
      service.validateCreatePayload(authContext, 'personEntityMembership', {
        data: {
          person: {
            id: faker.string.uuid(),
          },
          internalEntity: {
            id: faker.string.uuid(),
          },
        },
      }),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should deny workspace member entity membership creation to a standard user', async () => {
    const { service, authContext } = buildServiceContext();

    await expect(
      service.validateCreatePayload(
        authContext,
        'workspaceMemberEntityMembership',
        {
          data: {
            workspaceMemberId: faker.string.uuid(),
            internalEntityId: faker.string.uuid(),
          },
        },
      ),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should deny workspace member entity membership creation to an entity manager', async () => {
    const { service, authContext } = buildServiceContext({
      roleLabel: ENTITY_MANAGER_ROLE_LABEL,
    });

    await expect(
      service.validateCreatePayload(
        authContext,
        'workspaceMemberEntityMembership',
        {
          data: {
            workspaceMemberId: faker.string.uuid(),
            internalEntityId: faker.string.uuid(),
          },
        },
      ),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should allow a platform administrator to create a workspace member entity membership', async () => {
    const { service, authContext } = buildServiceContext({
      canAccessFullAdminPanel: true,
    });

    await expect(
      service.validateCreatePayload(
        authContext,
        'workspaceMemberEntityMembership',
        {
          data: {
            workspaceMemberId: faker.string.uuid(),
            internalEntityId: faker.string.uuid(),
          },
        },
      ),
    ).resolves.toEqual({
      data: {
        workspaceMemberId: expect.any(String),
        internalEntityId: expect.any(String),
      },
    });
  });

  it('should deny workspace member entity membership mutation to a standard user', async () => {
    const { service, authContext } = buildServiceContext();

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'workspaceMemberEntityMembership',
        faker.string.uuid(),
        'deleteOne',
      ),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should deny workspace member entity membership mutation to an entity manager', async () => {
    const { service, authContext } = buildServiceContext({
      roleLabel: ENTITY_MANAGER_ROLE_LABEL,
    });

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'workspaceMemberEntityMembership',
        faker.string.uuid(),
        'deleteOne',
      ),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should allow a platform administrator to mutate a workspace member entity membership', async () => {
    const { service, authContext } = buildServiceContext({
      canAccessFullAdminPanel: true,
    });

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'workspaceMemberEntityMembership',
        faker.string.uuid(),
        'deleteOne',
      ),
    ).resolves.toBeUndefined();
  });

  it('should scope note queries to the current workspace member', async () => {
    const { service, authContext, workspaceMemberId } = buildServiceContext();

    const payload = await service.scopeFindManyPayload(authContext, 'note', {
      filter: {
        title: {
          ilike: '%atlas%',
        },
      },
    });

    expect(payload.filter).toEqual({
      and: [
        {
          title: {
            ilike: '%atlas%',
          },
        },
        {
          createdBy: {
            workspaceMemberId: {
              eq: workspaceMemberId,
            },
          },
        },
      ],
    });
  });

  it('should scope task queries to creator or assignee', async () => {
    const { service, authContext, workspaceMemberId } = buildServiceContext();

    const payload = await service.scopeFindManyPayload(authContext, 'task', {
      filter: {
        status: {
          eq: 'TODO',
        },
      },
    });

    expect(payload.filter).toEqual({
      and: [
        {
          status: {
            eq: 'TODO',
          },
        },
        {
          or: [
            {
              createdBy: {
                workspaceMemberId: {
                  eq: workspaceMemberId,
                },
              },
            },
            {
              assigneeId: {
                eq: workspaceMemberId,
              },
            },
          ],
        },
      ],
    });
  });

  it('should scope task target queries with readable task ids', async () => {
    const { service, authContext, taskRepository, workspaceMemberId } =
      buildServiceContext();
    const ownedTaskId = faker.string.uuid();
    const assignedTaskId = faker.string.uuid();

    taskRepository.find.mockResolvedValue([
      { id: ownedTaskId },
      { id: assignedTaskId },
    ]);

    const payload = await service.scopeFindManyPayload(
      authContext,
      'taskTarget',
      {},
    );

    expect(payload.filter).toEqual({
      taskId: {
        in: [ownedTaskId, assignedTaskId],
      },
    });
    expect(taskRepository.find).toHaveBeenCalledWith({
      where: [
        {
          createdBy: {
            workspaceMemberId,
          },
        },
        { assigneeId: workspaceMemberId },
      ],
    });
  });

  it('should scope task target queries to no records when no readable task exists', async () => {
    const { service, authContext, taskRepository } = buildServiceContext();

    taskRepository.find.mockResolvedValue([]);

    const payload = await service.scopeFindManyPayload(
      authContext,
      'taskTarget',
      {},
    );

    expect(payload.filter).toEqual({
      id: {
        eq: '00000000-0000-0000-0000-000000000000',
      },
    });
  });

  it('should scope note target queries with readable note ids', async () => {
    const { service, authContext, noteRepository, workspaceMemberId } =
      buildServiceContext();
    const noteId = faker.string.uuid();

    noteRepository.find.mockResolvedValue([{ id: noteId }, { id: noteId }]);

    const payload = await service.scopeFindManyPayload(
      authContext,
      'noteTarget',
      {},
    );

    expect(payload.filter).toEqual({
      noteId: {
        in: [noteId],
      },
    });
    expect(noteRepository.find).toHaveBeenCalledWith({
      where: {
        createdBy: {
          workspaceMemberId,
        },
      },
    });
  });

  it('should scope note target queries to no records when no readable note exists', async () => {
    const { service, authContext, noteRepository } = buildServiceContext();

    noteRepository.find.mockResolvedValue([]);

    const payload = await service.scopeFindManyPayload(
      authContext,
      'noteTarget',
      {},
    );

    expect(payload.filter).toEqual({
      id: {
        eq: '00000000-0000-0000-0000-000000000000',
      },
    });
  });

  it('should scope attachments to the creator workspace member', async () => {
    const { service, authContext, workspaceMemberId } = buildServiceContext();

    const payload = await service.scopeFindManyPayload(
      authContext,
      'attachment',
      {
        filter: {
          name: {
            ilike: '%deck%',
          },
        },
      },
    );

    expect(payload.filter).toEqual({
      and: [
        {
          name: {
            ilike: '%deck%',
          },
        },
        {
          createdBy: {
            workspaceMemberId: {
              eq: workspaceMemberId,
            },
          },
        },
      ],
    });
  });

  it('should allow a task assignee to update the task', async () => {
    const { service, authContext, taskRepository, workspaceMemberId } =
      buildServiceContext();

    taskRepository.findOne.mockResolvedValue({
      id: faker.string.uuid(),
      createdBy: {
        workspaceMemberId: faker.string.uuid(),
      },
      assigneeId: workspaceMemberId,
    });

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'task',
        faker.string.uuid(),
        'updateOne',
      ),
    ).resolves.toBeUndefined();
  });

  it('should deny a task assignee from deleting someone else task', async () => {
    const { service, authContext, taskRepository, workspaceMemberId } =
      buildServiceContext();

    taskRepository.findOne.mockResolvedValue({
      id: faker.string.uuid(),
      createdBy: {
        workspaceMemberId: faker.string.uuid(),
      },
      assigneeId: workspaceMemberId,
    });

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'task',
        faker.string.uuid(),
        'deleteOne',
      ),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should allow deleting a task target after its parent task is soft-deleted', async () => {
    const {
      service,
      authContext,
      taskRepository,
      taskTargetRepository,
      workspaceMemberId,
    } = buildServiceContext();
    const taskId = faker.string.uuid();
    const taskTargetId = faker.string.uuid();

    taskTargetRepository.findOne.mockResolvedValue({
      id: taskTargetId,
      taskId,
    });
    taskRepository.findOne.mockResolvedValue({
      id: taskId,
      createdBy: { workspaceMemberId },
      deletedAt: new Date(),
    });

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'taskTarget',
        taskTargetId,
        'deleteOne',
      ),
    ).resolves.toBeUndefined();
    expect(taskTargetRepository.findOne).toHaveBeenCalledWith({
      where: { id: taskTargetId },
      withDeleted: true,
    });
    expect(taskRepository.findOne).toHaveBeenCalledWith({
      where: { id: taskId },
      withDeleted: true,
    });
  });

  it('should allow restoring a note target with its soft-deleted parent note', async () => {
    const {
      service,
      authContext,
      noteRepository,
      noteTargetRepository,
      workspaceMemberId,
    } = buildServiceContext();
    const noteId = faker.string.uuid();
    const noteTargetId = faker.string.uuid();

    noteTargetRepository.findOne.mockResolvedValue({
      id: noteTargetId,
      noteId,
      deletedAt: new Date(),
    });
    noteRepository.findOne.mockResolvedValue({
      id: noteId,
      createdBy: { workspaceMemberId },
      deletedAt: new Date(),
    });

    await expect(
      service.assertSingleMutationAllowed(
        authContext,
        'noteTarget',
        noteTargetId,
        'restoreOne',
      ),
    ).resolves.toBeUndefined();
    expect(noteTargetRepository.findOne).toHaveBeenCalledWith({
      where: { id: noteTargetId },
      withDeleted: true,
    });
    expect(noteRepository.findOne).toHaveBeenCalledWith({
      where: { id: noteId },
      withDeleted: true,
    });
  });

  it('should deny attaching a note target for a note owned by another workspace member', async () => {
    const { service, authContext, noteRepository } = buildServiceContext();

    noteRepository.findOne.mockResolvedValue({
      id: faker.string.uuid(),
      createdBy: {
        workspaceMemberId: faker.string.uuid(),
      },
    });

    await expect(
      service.validateCreatePayload(authContext, 'noteTarget', {
        data: {
          noteId: faker.string.uuid(),
          targetCompanyId: faker.string.uuid(),
        },
      }),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('should validate task target creation inside the workspace context', async () => {
    const {
      service,
      authContext,
      taskRepository,
      workspaceMemberId,
      globalWorkspaceOrmManager,
    } = buildServiceContext();
    const taskId = faker.string.uuid();
    const targetOpportunityId = faker.string.uuid();

    taskRepository.findOne.mockResolvedValue({
      id: taskId,
      createdBy: {
        workspaceMemberId,
      },
    });

    await expect(
      service.validateCreatePayload(authContext, 'taskTarget', {
        data: {
          taskId,
          targetOpportunityId,
        },
      }),
    ).resolves.toEqual({
      data: {
        taskId,
        targetOpportunityId,
      },
    });
    expect(
      globalWorkspaceOrmManager.executeInWorkspaceContext,
    ).toHaveBeenCalledWith(expect.any(Function), authContext);
  });

  it('should scope timeline activities to accessible personal and entity records', async () => {
    const {
      service,
      authContext,
      workspaceMemberId,
      entityId,
      noteRepository,
      taskRepository,
      membershipRepository,
      opportunityRepository,
    } = buildServiceContext();
    const noteId = faker.string.uuid();
    const taskId = faker.string.uuid();
    const companyId = faker.string.uuid();
    const personId = faker.string.uuid();
    const opportunityId = faker.string.uuid();

    noteRepository.find.mockResolvedValue([{ id: noteId }]);
    taskRepository.find.mockResolvedValue([{ id: taskId }]);
    membershipRepository.find
      .mockResolvedValueOnce([{ companyId, internalEntityId: entityId }])
      .mockResolvedValueOnce([{ personId, internalEntityId: entityId }]);
    opportunityRepository.find.mockResolvedValue([{ id: opportunityId }]);

    const payload = await service.scopeFindManyPayload(
      authContext,
      'timelineActivity',
      {
        filter: {
          name: {
            ilike: '%linked%',
          },
        },
      },
    );

    expect(payload.filter).toEqual({
      and: [
        {
          name: {
            ilike: '%linked%',
          },
        },
        {
          or: [
            { workspaceMemberId: { eq: workspaceMemberId } },
            { targetNoteId: { in: [noteId] } },
            { targetTaskId: { in: [taskId] } },
            { targetCompanyId: { in: [companyId] } },
            { targetPersonId: { in: [personId] } },
            { targetOpportunityId: { in: [opportunityId] } },
          ],
        },
      ],
    });
    expect(noteRepository.find).toHaveBeenCalledWith({
      where: {
        createdBy: {
          workspaceMemberId,
        },
      },
    });
    expect(taskRepository.find).toHaveBeenCalledWith({
      where: [
        {
          createdBy: {
            workspaceMemberId,
          },
        },
        { assigneeId: workspaceMemberId },
      ],
    });
    expect(membershipRepository.find).toHaveBeenCalledTimes(2);
    expect(membershipRepository.find).toHaveBeenCalledWith({
      where: { internalEntityId: expect.any(Object) },
    });
    expect(opportunityRepository.find).toHaveBeenCalledWith({
      where: { internalEntityId: expect.any(Object) },
    });
  });

  it('should cache readable ids for timeline activity scope and reuse them on subsequent calls', async () => {
    const {
      service,
      authContext,
      noteRepository,
      taskRepository,
      membershipRepository,
      opportunityRepository,
      entityId,
      workspaceMemberId,
    } = buildServiceContext();
    const noteId = faker.string.uuid();
    const taskId = faker.string.uuid();
    const companyId = faker.string.uuid();
    const personId = faker.string.uuid();
    const opportunityId = faker.string.uuid();

    noteRepository.find.mockResolvedValue([{ id: noteId }]);
    taskRepository.find.mockResolvedValue([{ id: taskId }]);
    membershipRepository.find
      .mockResolvedValueOnce([{ companyId, internalEntityId: entityId }])
      .mockResolvedValueOnce([{ personId, internalEntityId: entityId }]);
    opportunityRepository.find.mockResolvedValue([{ id: opportunityId }]);

    await service.scopeFindManyPayload(authContext, 'timelineActivity', {
      filter: {},
    });

    jest.clearAllMocks();

    const cachedPayload = await service.scopeFindManyPayload(
      authContext,
      'timelineActivity',
      {
        filter: {},
      },
    );

    expect(cachedPayload.filter).toEqual({
      or: [
        { workspaceMemberId: { eq: workspaceMemberId } },
        { targetNoteId: { in: [noteId] } },
        { targetTaskId: { in: [taskId] } },
        { targetCompanyId: { in: [companyId] } },
        { targetPersonId: { in: [personId] } },
        { targetOpportunityId: { in: [opportunityId] } },
      ],
    });
    expect(noteRepository.find).not.toHaveBeenCalled();
    expect(taskRepository.find).not.toHaveBeenCalled();
    expect(membershipRepository.find).not.toHaveBeenCalled();
    expect(opportunityRepository.find).not.toHaveBeenCalled();
  });

  it('should scope CRM reads to the active entity for multi-entity members in entity view', async () => {
    const primaryEntityId = faker.string.uuid();
    const secondaryEntityId = faker.string.uuid();
    const { service, authContext } = buildServiceContext({
      accessibleEntityIds: [primaryEntityId, secondaryEntityId],
      activeEntityId: secondaryEntityId,
    });

    const payload = await service.scopeFindManyPayload(
      authContext,
      'opportunity',
      {
        filter: {
          stage: {
            eq: 'NEW',
          },
        },
      },
    );

    expect(payload.filter).toEqual({
      and: [
        {
          stage: {
            eq: 'NEW',
          },
        },
        {
          internalEntityId: {
            in: [secondaryEntityId],
          },
        },
      ],
    });
  });

  it('should scope CRM bulk mutations to the active entity for multi-entity members', async () => {
    const secondaryEntityId = faker.string.uuid();
    const { service, authContext } = buildServiceContext({
      roleLabel: ENTITY_MANAGER_ROLE_LABEL,
      accessibleEntityIds: [faker.string.uuid(), secondaryEntityId],
      activeEntityId: secondaryEntityId,
    });

    const payload = await service.scopeBulkMutationPayload(
      authContext,
      'opportunity',
      {
        filter: {
          stage: {
            eq: 'NEW',
          },
        },
      },
    );

    expect(payload.filter).toEqual({
      and: [
        {
          stage: {
            eq: 'NEW',
          },
        },
        {
          internalEntityId: {
            in: [secondaryEntityId],
          },
        },
      ],
    });
  });

  it('should deny manual timeline activity creation to a standard user', async () => {
    const { service, authContext } = buildServiceContext();

    await expect(
      service.validateCreatePayload(authContext, 'timelineActivity', {
        data: {
          name: 'linked-note.created',
        },
      }),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });
});
