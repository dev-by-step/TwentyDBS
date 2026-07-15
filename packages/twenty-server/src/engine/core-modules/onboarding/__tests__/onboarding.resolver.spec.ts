import { Test, type TestingModule } from '@nestjs/testing';

import { GUARDS_METADATA } from '@nestjs/common/constants';

import { OnboardingResolver } from 'src/engine/core-modules/onboarding/onboarding.resolver';
import { OnboardingService } from 'src/engine/core-modules/onboarding/onboarding.service';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

describe('OnboardingResolver', () => {
  let resolver: OnboardingResolver;
  let onboardingService: jest.Mocked<OnboardingService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingResolver,
        {
          provide: OnboardingService,
          useValue: {
            advanceFromInviteTeamStep: jest.fn(),
            setOnboardingConnectAccountPending: jest.fn(),
            setOnboardingBookOnboardingPending: jest.fn(),
            completeSuperadminWorkspaceSetup: jest.fn(),
          },
        },
      ],
    }).compile();

    resolver = module.get<OnboardingResolver>(OnboardingResolver);
    onboardingService = module.get(OnboardingService);
  });

  describe('skipInviteTeamOnboardingStep', () => {
    const workspace = { id: 'workspace-id' } as WorkspaceEntity;

    it('advances the workspace past the invite-team step', async () => {
      const result = await resolver.skipInviteTeamOnboardingStep(workspace);

      expect(onboardingService.advanceFromInviteTeamStep).toHaveBeenCalledWith({
        workspaceId: workspace.id,
      });
      expect(result.success).toBe(true);
    });

    it('is guarded by NoPermissionGuard so non-admins can skip without WORKSPACE_MEMBERS perm', () => {
      const guards: unknown[] =
        Reflect.getMetadata(
          GUARDS_METADATA,
          // eslint-disable-next-line @typescript-eslint/unbound-method
          resolver.skipInviteTeamOnboardingStep,
        ) ?? [];

      expect(guards).toContain(NoPermissionGuard);
    });
  });
});
