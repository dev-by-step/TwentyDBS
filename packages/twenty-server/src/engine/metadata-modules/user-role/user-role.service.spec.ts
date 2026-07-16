import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { RoleTargetEntity } from 'src/engine/metadata-modules/role-target/role-target.entity';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

import { RoleTargetService } from '../role-target/services/role-target.service';

import { UserRoleService } from './user-role.service';

describe('UserRoleService', () => {
  let service: UserRoleService;

  const mockRoleTargetRepository = {
    find: jest.fn(),
  };

  const mockUserWorkspaceRepository = {};
  const mockGlobalWorkspaceOrmManager = {};
  const mockRoleTargetService = {};
  const mockWorkspaceCacheService = {};

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRoleService,
        {
          provide: getRepositoryToken(RoleTargetEntity),
          useValue: mockRoleTargetRepository,
        },
        {
          provide: getRepositoryToken(UserWorkspaceEntity),
          useValue: mockUserWorkspaceRepository,
        },
        {
          provide: GlobalWorkspaceOrmManager,
          useValue: mockGlobalWorkspaceOrmManager,
        },
        {
          provide: RoleTargetService,
          useValue: mockRoleTargetService,
        },
        {
          provide: WorkspaceCacheService,
          useValue: mockWorkspaceCacheService,
        },
      ],
    }).compile();

    service = module.get(UserRoleService);
  });

  it('should return roles grouped by user workspace', async () => {
    mockRoleTargetRepository.find.mockResolvedValue([
      {
        userWorkspaceId: 'user-workspace-1',
        role: { id: 'role-1', label: 'Admin' } as RoleEntity,
      },
      {
        userWorkspaceId: 'user-workspace-2',
        role: { id: 'role-2', label: 'Member' } as RoleEntity,
      },
    ]);

    const result = await service.getRolesByUserWorkspaces({
      workspaceId: 'workspace-1',
      userWorkspaceIds: ['user-workspace-1', 'user-workspace-2'],
    });

    expect(result.get('user-workspace-1')).toEqual([
      expect.objectContaining({ id: 'role-1', label: 'Admin' }),
    ]);
    expect(result.get('user-workspace-2')).toEqual([
      expect.objectContaining({ id: 'role-2', label: 'Member' }),
    ]);
  });

  it('should cache roles per user workspace to avoid repeated queries', async () => {
    mockRoleTargetRepository.find.mockResolvedValue([
      {
        userWorkspaceId: 'user-workspace-1',
        role: { id: 'role-1', label: 'Admin' } as RoleEntity,
      },
    ]);

    await service.getRolesByUserWorkspaces({
      workspaceId: 'workspace-1',
      userWorkspaceIds: ['user-workspace-1'],
    });
    await service.getRolesByUserWorkspaces({
      workspaceId: 'workspace-1',
      userWorkspaceIds: ['user-workspace-1'],
    });

    expect(mockRoleTargetRepository.find).toHaveBeenCalledTimes(1);
  });

  it('should query only missing user workspaces when cache is partial', async () => {
    mockRoleTargetRepository.find
      .mockResolvedValueOnce([
        {
          userWorkspaceId: 'user-workspace-1',
          role: { id: 'role-1', label: 'Admin' } as RoleEntity,
        },
      ])
      .mockResolvedValueOnce([
        {
          userWorkspaceId: 'user-workspace-2',
          role: { id: 'role-2', label: 'Member' } as RoleEntity,
        },
      ]);

    await service.getRolesByUserWorkspaces({
      workspaceId: 'workspace-1',
      userWorkspaceIds: ['user-workspace-1'],
    });

    const result = await service.getRolesByUserWorkspaces({
      workspaceId: 'workspace-1',
      userWorkspaceIds: ['user-workspace-1', 'user-workspace-2'],
    });

    expect(mockRoleTargetRepository.find).toHaveBeenCalledTimes(2);
    expect(result.get('user-workspace-2')).toEqual([
      expect.objectContaining({ id: 'role-2', label: 'Member' }),
    ]);
  });
});
