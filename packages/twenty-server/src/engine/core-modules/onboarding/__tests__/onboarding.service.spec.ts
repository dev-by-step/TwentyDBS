import { Test, type TestingModule } from '@nestjs/testing';

import { BillingService } from 'src/engine/core-modules/billing/services/billing.service';
import { OnboardingService } from 'src/engine/core-modules/onboarding/onboarding.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserVarsService } from 'src/engine/core-modules/user/user-vars/services/user-vars.service';

describe('OnboardingService', () => {
  let service: OnboardingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        {
          provide: BillingService,
          useValue: { isSubscriptionIncompleteOnboardingStatus: jest.fn() },
        },
        {
          provide: UserVarsService,
          useValue: {
            set: jest.fn(),
            delete: jest.fn(),
            getAll: jest.fn(),
          },
        },
        {
          provide: TwentyConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  describe('advanceFromInviteTeamStep', () => {
    it('clears invite-team pending and arms book-onboarding pending', async () => {
      const workspaceId = 'workspace-id';

      const clearInviteSpy = jest
        .spyOn(service, 'setOnboardingInviteTeamPending')
        .mockResolvedValue();
      const armBookOnboardingSpy = jest
        .spyOn(service, 'setOnboardingBookOnboardingPending')
        .mockResolvedValue();

      await service.advanceFromInviteTeamStep({ workspaceId });

      expect(clearInviteSpy).toHaveBeenCalledWith({
        workspaceId,
        value: false,
      });
      expect(armBookOnboardingSpy).toHaveBeenCalledWith({
        workspaceId,
        value: true,
      });
    });
  });
});
