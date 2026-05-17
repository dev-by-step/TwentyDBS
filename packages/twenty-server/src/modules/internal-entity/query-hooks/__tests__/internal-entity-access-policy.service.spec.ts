import { faker } from '@faker-js/faker';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { PermissionsExceptionCode } from 'src/engine/metadata-modules/permissions/permissions.exception';
import { type UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { ENTITY_MANAGER_ROLE_LABEL } from 'src/modules/internal-entity/query-hooks/constants/internal-entity-access.constants';
import { InternalEntityAccessPolicyService } from 'src/modules/internal-entity/query-hooks/services/internal-entity-access-policy.service';
import { type WorkspaceMemberInternalEntityService } from 'src/modules/internal-entity/services/workspace-member-internal-entity.service';

const buildServiceContext = ({
  roleLabel,
  roleUniversalIdentifier,
  canAccessFullAdminPanel = false,
  accessibleEntityIds,
  activeEntityId,
}: {
  roleLabel?: string;
  roleUniversalIdentifier?: string;
  canAccessFullAdminPanel?: boolean;
  accessibleEntityIds?: string[];
  activeEntityId?: string;
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
    find: jest.fn(),
  };

  const globalWorkspaceOrmManager = {
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

  const userRoleService = {
    getRolesByUserWorkspaces: jest.fn().mockResolvedValue(
      new Map([
        [
          userWorkspaceId,
          roleLabel
            ? [
                {
                  label: roleLabel,
                  universalIdentifier:
                    roleUniversalIdentifier ?? faker.string.uuid(),
                },
              ]
            : [],
        ],
      ]),
    ),
  };

  const service = new InternalEntityAccessPolicyService(
    globalWorkspaceOrmManager as unknown as GlobalWorkspaceOrmManager,
    userRoleService as unknown as UserRoleService,
    {
      resolveContext: jest.fn().mockResolvedValue({
        currentEntityId: entityId,
        activeEntityId: activeEntityId ?? entityId,
        entityIds: accessibleEntityIds ?? [entityId],
      }),
    } as unknown as WorkspaceMemberInternalEntityService,
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
    userRoleService,
    entityId,
    workspaceMemberId,
  };
};

describe('InternalEntityAccessPolicyService', () => {
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
      },
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
    const { service, authContext, entityId } = buildServiceContext({
      roleLabel: ENTITY_MANAGER_ROLE_LABEL,
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

  it('should deny a platform administrator from updating another entity opportunity', async () => {
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
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
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

  it('should allow an entity manager to merge opportunities from the same entity', async () => {
    const { service, authContext, opportunityRepository, entityId } =
      buildServiceContext({
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

  it('should allow entity membership deletion to an entity manager of the same entity', async () => {
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
    ).resolves.toBeUndefined();
  });

  it('should deny a platform administrator from creating a membership for another entity', async () => {
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
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
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

  it('should scope attachments to the author workspace member', async () => {
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
          or: [
            {
              authorId: {
                eq: workspaceMemberId,
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

    noteRepository.find.mockResolvedValue([{ id: 'note-1' }]);
    taskRepository.find.mockResolvedValue([{ id: 'task-1' }]);
    membershipRepository.find
      .mockResolvedValueOnce([{ companyId: 'company-1' }])
      .mockResolvedValueOnce([{ personId: 'person-1' }]);
    opportunityRepository.find.mockResolvedValue([{ id: 'opportunity-1' }]);

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
            { targetNoteId: { in: ['note-1'] } },
            { targetTaskId: { in: ['task-1'] } },
            { targetCompanyId: { in: ['company-1'] } },
            { targetPersonId: { in: ['person-1'] } },
            { targetOpportunityId: { in: ['opportunity-1'] } },
          ],
        },
      ],
    });

    expect(opportunityRepository.find).toHaveBeenCalledWith({
      where: {
        internalEntityId: {
          in: [entityId],
        },
      },
    });
  });

  it('should scope CRM reads to every accessible entity for multi-entity members', async () => {
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
            in: [primaryEntityId, secondaryEntityId],
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
