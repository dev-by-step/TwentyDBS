import { gql } from '@apollo/client';

export const SKIP_INVITE_TEAM_ONBOARDING_STEP = gql`
  mutation SkipInviteTeamOnboardingStep {
    skipInviteTeamOnboardingStep {
      success
    }
  }
`;
