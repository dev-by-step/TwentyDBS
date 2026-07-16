import { Test, type TestingModule } from '@nestjs/testing';

import { CalendarChannelExceptionCode } from 'src/engine/metadata-modules/calendar-channel/calendar-channel.exception';
import { CalendarChannelEntityAccessService } from 'src/engine/metadata-modules/calendar-channel/services/calendar-channel-entity-access.service';
import { WorkspaceMemberInternalEntityService } from 'src/modules/internal-entity/services/workspace-member-internal-entity.service';

describe('CalendarChannelEntityAccessService', () => {
  let service: CalendarChannelEntityAccessService;

  const mockWorkspaceMemberInternalEntityService = {
    resolveManageableEntityIds: jest.fn(),
    resolvePrimaryEntityId: jest.fn(),
    resolveManageableEntityAccess: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarChannelEntityAccessService,
        {
          provide: WorkspaceMemberInternalEntityService,
          useValue: mockWorkspaceMemberInternalEntityService,
        },
      ],
    }).compile();

    service = module.get(CalendarChannelEntityAccessService);
  });

  it('should normalize and validate visible entity ids against manageable entities', async () => {
    mockWorkspaceMemberInternalEntityService.resolveManageableEntityAccess.mockResolvedValue(
      {
        manageableEntityIds: ['entity-a', 'entity-b'],
        primaryEntityId: 'entity-a',
      },
    );

    const result = await service.resolveVisibleInternalEntityIds({
      workspaceId: 'workspace-id',
      workspaceMemberId: 'workspace-member-id',
      fallbackEntityId: 'entity-a',
      canAccessFullAdminPanel: false,
      requestedVisibleInternalEntityIds: [' ENTITY-A ', 'entity-a', 'ENTITY-B'],
      shouldDefaultToPrimaryEntity: true,
    });

    expect(result).toEqual(['entity-a', 'entity-b']);
  });

  it('should default to the primary entity when metadata visibility has no explicit entities', async () => {
    mockWorkspaceMemberInternalEntityService.resolveManageableEntityAccess.mockResolvedValue(
      {
        manageableEntityIds: ['entity-a', 'entity-b'],
        primaryEntityId: 'entity-b',
      },
    );

    const result = await service.resolveVisibleInternalEntityIds({
      workspaceId: 'workspace-id',
      workspaceMemberId: 'workspace-member-id',
      fallbackEntityId: 'entity-a',
      canAccessFullAdminPanel: false,
      requestedVisibleInternalEntityIds: [],
      shouldDefaultToPrimaryEntity: true,
    });

    expect(result).toEqual(['entity-b']);
  });

  it('should reject entities that the user cannot manage', async () => {
    mockWorkspaceMemberInternalEntityService.resolveManageableEntityAccess.mockResolvedValue(
      {
        manageableEntityIds: ['entity-a'],
        primaryEntityId: 'entity-a',
      },
    );

    await expect(
      service.resolveVisibleInternalEntityIds({
        workspaceId: 'workspace-id',
        workspaceMemberId: 'workspace-member-id',
        fallbackEntityId: 'entity-a',
        canAccessFullAdminPanel: false,
        requestedVisibleInternalEntityIds: ['entity-b'],
        shouldDefaultToPrimaryEntity: true,
      }),
    ).rejects.toMatchObject({
      code: CalendarChannelExceptionCode.INVALID_CALENDAR_CHANNEL_INPUT,
    });
  });
});
