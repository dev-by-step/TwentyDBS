import { Test, type TestingModule } from '@nestjs/testing';
import { FindOperator } from 'typeorm';

import { ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { WorkspaceMemberInternalEntityService } from 'src/modules/internal-entity/services/workspace-member-internal-entity.service';

describe('WorkspaceMemberInternalEntityService', () => {
  let service: WorkspaceMemberInternalEntityService;

  const mockMembershipRepository = {
    find: jest.fn(),
  };

  const mockInternalEntityRepository = {
    find: jest.fn(),
  };

  const mockObjectMetadataService = {
    findOneWithinWorkspace: jest.fn(),
  };

  const mockGlobalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn().mockImplementation(async (fn) => fn()),
    getRepository: jest.fn().mockImplementation((_workspaceId, objectName) => {
      if (objectName === 'internalEntity') {
        return Promise.resolve(mockInternalEntityRepository);
      }

      return Promise.resolve(mockMembershipRepository);
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceMemberInternalEntityService,
        {
          provide: GlobalWorkspaceOrmManager,
          useValue: mockGlobalWorkspaceOrmManager,
        },
        {
          provide: ObjectMetadataService,
          useValue: mockObjectMetadataService,
        },
      ],
    }).compile();

    service = module.get(WorkspaceMemberInternalEntityService);
  });

  it('should resolve multiple memberships and requested active entity', async () => {
    mockObjectMetadataService.findOneWithinWorkspace.mockResolvedValue({
      id: 'object-metadata-id',
    });
    mockMembershipRepository.find.mockResolvedValue([
      {
        workspaceMemberId: 'workspace-member-1',
        internalEntityId: 'entity-a',
      },
      {
        workspaceMemberId: 'workspace-member-1',
        internalEntityId: 'entity-b',
      },
    ]);

    const result = await service.resolveContext({
      workspaceId: 'workspace-id',
      workspaceMemberId: 'workspace-member-1',
      fallbackEntityId: 'entity-a',
      requestedActiveEntityId: 'entity-b',
    });

    expect(result).toEqual({
      currentEntityId: 'entity-a',
      activeEntityId: 'entity-b',
      entityIds: ['entity-a', 'entity-b'],
    });
  });

  it('should query memberships with a TypeORM In operator', async () => {
    mockObjectMetadataService.findOneWithinWorkspace.mockResolvedValue({
      id: 'object-metadata-id',
    });
    mockMembershipRepository.find.mockResolvedValue([]);

    await service.resolveContextsByWorkspaceMemberIds({
      workspaceId: 'workspace-id',
      workspaceMemberIds: ['workspace-member-1', 'workspace-member-2'],
    });

    expect(mockMembershipRepository.find).toHaveBeenCalledWith({
      where: {
        workspaceMemberId: expect.any(FindOperator),
      },
    });
  });

  it('should fall back to the user entity when the membership object is absent', async () => {
    mockObjectMetadataService.findOneWithinWorkspace.mockResolvedValue(null);

    const result = await service.resolveContext({
      workspaceId: 'workspace-id',
      workspaceMemberId: 'workspace-member-1',
      fallbackEntityId: 'entity-a',
    });

    expect(result).toEqual({
      currentEntityId: 'entity-a',
      activeEntityId: 'entity-a',
      entityIds: ['entity-a'],
    });
  });

  it('should resolve all internal entities for full admin users', async () => {
    mockObjectMetadataService.findOneWithinWorkspace.mockImplementation(
      async (
        _workspaceId: string,
        options: { where: { nameSingular: string } },
      ) =>
        options.where.nameSingular === 'internalEntity'
          ? { id: 'internal-entity-object-metadata-id' }
          : { id: 'membership-object-metadata-id' },
    );
    mockInternalEntityRepository.find.mockResolvedValue([
      { id: 'entity-a' },
      { id: 'entity-b' },
    ]);

    const result = await service.resolveManageableEntityIds({
      workspaceId: 'workspace-id',
      workspaceMemberId: 'workspace-member-1',
      fallbackEntityId: 'entity-a',
      canAccessFullAdminPanel: true,
    });

    expect(result).toEqual(['entity-a', 'entity-b']);
  });

  it('should resolve manageable access with all entities and primary entity for full admin users', async () => {
    mockObjectMetadataService.findOneWithinWorkspace.mockImplementation(
      async (
        _workspaceId: string,
        options: { where: { nameSingular: string } },
      ) =>
        options.where.nameSingular === 'internalEntity'
          ? { id: 'internal-entity-object-metadata-id' }
          : { id: 'membership-object-metadata-id' },
    );
    mockInternalEntityRepository.find.mockResolvedValue([
      { id: 'entity-a' },
      { id: 'entity-b' },
    ]);
    mockMembershipRepository.find.mockResolvedValue([
      {
        workspaceMemberId: 'workspace-member-1',
        internalEntityId: 'entity-b',
      },
    ]);

    const result = await service.resolveManageableEntityAccess({
      workspaceId: 'workspace-id',
      workspaceMemberId: 'workspace-member-1',
      fallbackEntityId: 'entity-b',
      canAccessFullAdminPanel: true,
    });

    expect(result).toEqual({
      manageableEntityIds: ['entity-a', 'entity-b'],
      primaryEntityId: 'entity-b',
    });
  });

  it('should resolve membership entities for non-admin users', async () => {
    mockObjectMetadataService.findOneWithinWorkspace.mockResolvedValue({
      id: 'object-metadata-id',
    });
    mockMembershipRepository.find.mockResolvedValue([
      {
        workspaceMemberId: 'workspace-member-1',
        internalEntityId: 'entity-a',
      },
    ]);

    const result = await service.resolveManageableEntityIds({
      workspaceId: 'workspace-id',
      workspaceMemberId: 'workspace-member-1',
      fallbackEntityId: 'entity-b',
      canAccessFullAdminPanel: false,
    });

    expect(result).toEqual(['entity-a']);
  });
});
