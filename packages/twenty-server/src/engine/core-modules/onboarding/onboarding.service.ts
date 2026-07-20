import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { type QueryRunner } from 'typeorm';

import { isBootstrapAdminEmail } from 'src/engine/core-modules/auth/constants/bootstrap-admin-email.constant';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { BillingService } from 'src/engine/core-modules/billing/services/billing.service';
import { OnboardingStatus } from 'src/engine/core-modules/onboarding/enums/onboarding-status.enum';
import { type CompleteSuperadminWorkspaceSetupInput } from 'src/engine/core-modules/onboarding/dtos/complete-superadmin-workspace-setup.input';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserVarsService } from 'src/engine/core-modules/user/user-vars/services/user-vars.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

export enum OnboardingStepKeys {
  ONBOARDING_CONNECT_ACCOUNT_PENDING = 'ONBOARDING_CONNECT_ACCOUNT_PENDING',
  ONBOARDING_INVITE_TEAM_PENDING = 'ONBOARDING_INVITE_TEAM_PENDING',
  ONBOARDING_CREATE_PROFILE_PENDING = 'ONBOARDING_CREATE_PROFILE_PENDING',
  ONBOARDING_BOOK_ONBOARDING_PENDING = 'ONBOARDING_BOOK_ONBOARDING_PENDING',
  ONBOARDING_SUPERADMIN_WORKSPACE_SETUP_PENDING = 'ONBOARDING_SUPERADMIN_WORKSPACE_SETUP_PENDING',
  ONBOARDING_SUPERADMIN_WORKSPACE_SETUP_STATE = 'ONBOARDING_SUPERADMIN_WORKSPACE_SETUP_STATE',
}

export type SuperadminWorkspaceSetupEntityState = {
  id?: string;
  name: string;
  website: string | null;
  headcount: number | null;
  isMember: boolean;
};

export type SuperadminWorkspaceSetupState = {
  entities: SuperadminWorkspaceSetupEntityState[];
  selectedObjectMetadataIds: string[];
};

export type OnboardingKeyValueTypeMap = {
  [OnboardingStepKeys.ONBOARDING_CONNECT_ACCOUNT_PENDING]: boolean;
  [OnboardingStepKeys.ONBOARDING_INVITE_TEAM_PENDING]: boolean;
  [OnboardingStepKeys.ONBOARDING_CREATE_PROFILE_PENDING]: boolean;
  [OnboardingStepKeys.ONBOARDING_BOOK_ONBOARDING_PENDING]: boolean;
  [OnboardingStepKeys.ONBOARDING_SUPERADMIN_WORKSPACE_SETUP_PENDING]: boolean;
  [OnboardingStepKeys.ONBOARDING_SUPERADMIN_WORKSPACE_SETUP_STATE]: SuperadminWorkspaceSetupState;
};

@Injectable()
export class OnboardingService {
  constructor(
    private readonly billingService: BillingService,
    private readonly userVarsService: UserVarsService<OnboardingKeyValueTypeMap>,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  private isWorkspaceActivationPending(workspace: WorkspaceEntity) {
    return (
      workspace.activationStatus === WorkspaceActivationStatus.PENDING_CREATION
    );
  }

  private isSuperadminWorkspaceSetupRequired(
    user: Pick<UserEntity, 'email' | 'canAccessFullAdminPanel'>,
    userVars: Map<string, unknown>,
  ) {
    const isSuperadmin =
      user.canAccessFullAdminPanel === true ||
      isBootstrapAdminEmail(user.email);

    if (!isSuperadmin) {
      return false;
    }

    return !userVars.has(
      OnboardingStepKeys.ONBOARDING_SUPERADMIN_WORKSPACE_SETUP_STATE,
    );
  }

  async getOnboardingStatus(user: UserEntity, workspace: WorkspaceEntity) {
    if (
      await this.billingService.isSubscriptionIncompleteOnboardingStatus(
        workspace.id,
      )
    ) {
      return OnboardingStatus.PLAN_REQUIRED;
    }

    if (this.isWorkspaceActivationPending(workspace)) {
      return OnboardingStatus.WORKSPACE_ACTIVATION;
    }

    const userVars = await this.userVarsService.getAll({
      userId: user.id,
      workspaceId: workspace.id,
    });

    const isProfileCreationPending =
      userVars.get(OnboardingStepKeys.ONBOARDING_CREATE_PROFILE_PENDING) ===
      true;

    const isConnectAccountPending =
      userVars.get(OnboardingStepKeys.ONBOARDING_CONNECT_ACCOUNT_PENDING) ===
      true;

    const isInviteTeamPending =
      userVars.get(OnboardingStepKeys.ONBOARDING_INVITE_TEAM_PENDING) === true;

    const isBookOnboardingPending =
      userVars.get(OnboardingStepKeys.ONBOARDING_BOOK_ONBOARDING_PENDING) ===
      true;
    const isSuperadminWorkspaceSetupRequired =
      this.isSuperadminWorkspaceSetupRequired(user, userVars);

    if (isProfileCreationPending) {
      return OnboardingStatus.PROFILE_CREATION;
    }

    if (isConnectAccountPending) {
      return OnboardingStatus.SYNC_EMAIL;
    }

    if (isInviteTeamPending) {
      return OnboardingStatus.INVITE_TEAM;
    }

    if (isSuperadminWorkspaceSetupRequired) {
      return OnboardingStatus.INVITE_TEAM;
    }

    if (isBookOnboardingPending) {
      const calendarBookingPageId = this.twentyConfigService.get(
        'CALENDAR_BOOKING_PAGE_ID',
      );
      const isBookingConfigured =
        isDefined(calendarBookingPageId) &&
        isNonEmptyString(calendarBookingPageId);

      if (!isBookingConfigured) {
        // FIX-14 : nettoyage user-level du drapeau book-onboarding.
        await this.userVarsService.delete({
          userId: user.id,
          workspaceId: workspace.id,
          key: OnboardingStepKeys.ONBOARDING_BOOK_ONBOARDING_PENDING,
        });

        return OnboardingStatus.COMPLETED;
      }

      return OnboardingStatus.BOOK_ONBOARDING;
    }

    return OnboardingStatus.COMPLETED;
  }

  async setOnboardingConnectAccountPending(
    {
      userId,
      workspaceId,
      value,
    }: {
      userId: string;
      workspaceId: string;
      value: boolean;
    },
    queryRunner?: QueryRunner,
  ) {
    if (!value) {
      await this.userVarsService.delete(
        {
          userId,
          workspaceId,
          key: OnboardingStepKeys.ONBOARDING_CONNECT_ACCOUNT_PENDING,
        },
        queryRunner,
      );

      return;
    }

    await this.userVarsService.set(
      {
        userId,
        workspaceId: workspaceId,
        key: OnboardingStepKeys.ONBOARDING_CONNECT_ACCOUNT_PENDING,
        value: true,
      },
      queryRunner,
    );
  }

  // FIX-14 : ce drapeau est désormais au niveau UTILISATEUR (userId +
  // workspaceId). Avant, il était workspace-level (userId nul) : un seul
  // utilisateur qui passait l'étape « inviter l'équipe » l'affectait pour
  // TOUS les membres du workspace.
  async setOnboardingInviteTeamPending(
    {
      userId,
      workspaceId,
      value,
    }: {
      userId: string;
      workspaceId: string;
      value: boolean;
    },
    queryRunner?: QueryRunner,
  ) {
    if (!value) {
      await this.userVarsService.delete(
        {
          userId,
          workspaceId,
          key: OnboardingStepKeys.ONBOARDING_INVITE_TEAM_PENDING,
        },
        queryRunner,
      );

      return;
    }

    await this.userVarsService.set(
      {
        userId,
        workspaceId,
        key: OnboardingStepKeys.ONBOARDING_INVITE_TEAM_PENDING,
        value: true,
      },
      queryRunner,
    );
  }

  async advanceFromInviteTeamStep({
    userId,
    workspaceId,
  }: {
    userId: string;
    workspaceId: string;
  }) {
    await this.setOnboardingInviteTeamPending({
      userId,
      workspaceId,
      value: false,
    });

    await this.setOnboardingBookOnboardingPending({
      userId,
      workspaceId,
      value: true,
    });
  }

  async setOnboardingCreateProfilePending(
    {
      userId,
      workspaceId,
      value,
    }: {
      userId: string;
      workspaceId: string;
      value: boolean;
    },
    queryRunner?: QueryRunner,
  ) {
    if (!value) {
      await this.userVarsService.delete(
        {
          userId,
          workspaceId,
          key: OnboardingStepKeys.ONBOARDING_CREATE_PROFILE_PENDING,
        },
        queryRunner,
      );

      return;
    }

    await this.userVarsService.set(
      {
        userId,
        workspaceId,
        key: OnboardingStepKeys.ONBOARDING_CREATE_PROFILE_PENDING,
        value: true,
      },
      queryRunner,
    );
  }

  async completeOnboardingProfileStepIfNameProvided({
    userId,
    workspaceId,
    firstName,
    lastName,
  }: {
    userId?: string;
    workspaceId: string;
    firstName?: string;
    lastName?: string;
  }) {
    if (!isDefined(userId)) {
      return;
    }

    const hasProvidedNamePart =
      (isDefined(firstName) && firstName !== '') ||
      (isDefined(lastName) && lastName !== '');
    if (!hasProvidedNamePart) {
      return;
    }

    await this.setOnboardingCreateProfilePending({
      userId,
      workspaceId,
      value: false,
    });
  }

  // FIX-14 : drapeau au niveau UTILISATEUR (voir setOnboardingInviteTeamPending).
  async setOnboardingBookOnboardingPending({
    userId,
    workspaceId,
    value,
  }: {
    userId: string;
    workspaceId: string;
    value: boolean;
  }) {
    const calendarBookingPageId = this.twentyConfigService.get(
      'CALENDAR_BOOKING_PAGE_ID',
    );

    const isBookingConfigured =
      isDefined(calendarBookingPageId) &&
      isNonEmptyString(calendarBookingPageId);

    if (!value || !isBookingConfigured) {
      await this.userVarsService.delete({
        userId,
        workspaceId,
        key: OnboardingStepKeys.ONBOARDING_BOOK_ONBOARDING_PENDING,
      });

      return;
    }

    await this.userVarsService.set({
      userId,
      workspaceId,
      key: OnboardingStepKeys.ONBOARDING_BOOK_ONBOARDING_PENDING,
      value: true,
    });
  }

  async setOnboardingSuperadminWorkspaceSetupPending(
    {
      workspaceId,
      value,
    }: {
      workspaceId: string;
      value: boolean;
    },
    queryRunner?: QueryRunner,
  ) {
    if (!value) {
      await this.userVarsService.delete(
        {
          workspaceId,
          key: OnboardingStepKeys.ONBOARDING_SUPERADMIN_WORKSPACE_SETUP_PENDING,
        },
        queryRunner,
      );

      return;
    }

    await this.userVarsService.set(
      {
        workspaceId,
        key: OnboardingStepKeys.ONBOARDING_SUPERADMIN_WORKSPACE_SETUP_PENDING,
        value: true,
      },
      queryRunner,
    );
  }

  async completeSuperadminWorkspaceSetup({
    user,
    workspace,
    input,
  }: {
    user: AuthContextUser;
    workspace: WorkspaceEntity;
    input: CompleteSuperadminWorkspaceSetupInput;
  }) {
    const isSuperadmin =
      user.canAccessFullAdminPanel === true ||
      isBootstrapAdminEmail(user.email);

    if (!isSuperadmin) {
      throw new ForbiddenException(
        'Only the superadmin can complete workspace setup onboarding',
      );
    }

    const entities = input.entities.map((entity) => {
      const trimmedName = entity.name.trim();

      if (trimmedName.length === 0) {
        throw new BadRequestException('Entity name cannot be empty');
      }

      return {
        id: entity.id?.trim() || undefined,
        name: trimmedName,
        website: entity.website?.trim() || null,
        headcount: entity.headcount ?? null,
        isMember: entity.isMember,
      } satisfies SuperadminWorkspaceSetupEntityState;
    });

    if (entities.length === 0) {
      throw new BadRequestException(
        'At least one internal entity must be configured',
      );
    }

    if (!entities.some((entity) => entity.isMember)) {
      throw new BadRequestException(
        'You must belong to at least one internal entity',
      );
    }

    const selectedObjectMetadataIds = [
      ...new Set(
        input.selectedObjectMetadataIds
          .map((objectMetadataId) => objectMetadataId.trim())
          .filter((objectMetadataId) => objectMetadataId.length > 0),
      ),
    ];

    await this.userVarsService.set({
      workspaceId: workspace.id,
      key: OnboardingStepKeys.ONBOARDING_SUPERADMIN_WORKSPACE_SETUP_STATE,
      value: {
        entities,
        selectedObjectMetadataIds,
      },
    });

    await this.setOnboardingSuperadminWorkspaceSetupPending({
      workspaceId: workspace.id,
      value: false,
    });

    // Once the superadmin has personalised the workspace, arm the invite-team
    // step so they immediately land on the team-invitation screen. FIX-14 :
    // le drapeau est désormais propre à cet utilisateur (le superadmin), il ne
    // force plus l'écran d'invitation à tous les membres du workspace.
    await this.setOnboardingInviteTeamPending({
      userId: user.id,
      workspaceId: workspace.id,
      value: true,
    });
  }
}
