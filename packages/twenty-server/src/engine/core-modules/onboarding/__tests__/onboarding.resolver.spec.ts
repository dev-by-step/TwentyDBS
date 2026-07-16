import { Test, type TestingModule } from '@nestjs/testing';

import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';

import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { OnboardingResolver } from 'src/engine/core-modules/onboarding/onboarding.resolver';
import { OnboardingService } from 'src/engine/core-modules/onboarding/onboarding.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';

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

    it('advances the workspace past the invite-team step for a superadmin', async () => {
      const user = {
        id: 'user-id',
        email: 'aline@weknow.dev',
        canAccessFullAdminPanel: true,
      } as AuthContextUser;

      const result = await resolver.skipInviteTeamOnboardingStep(
        user,
        workspace,
      );

      expect(onboardingService.advanceFromInviteTeamStep).toHaveBeenCalledWith({
        workspaceId: workspace.id,
      });
      expect(result.success).toBe(true);
    });

    it('rejects a regular user before mutating workspace onboarding', async () => {
      const user = {
        id: 'user-id',
        email: 'member@weknow.dev',
        canAccessFullAdminPanel: false,
      } as AuthContextUser;

      await expect(
        resolver.skipInviteTeamOnboardingStep(user, workspace),
      ).rejects.toThrow(ForbiddenException);

      expect(
        onboardingService.advanceFromInviteTeamStep,
      ).not.toHaveBeenCalled();
    });

    it('keeps the explicit NoPermissionGuard on the resolver mutation', () => {
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
