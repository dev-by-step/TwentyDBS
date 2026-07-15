import { gql } from '@apollo/client';

export const COMPLETE_SUPERADMIN_WORKSPACE_SETUP = gql`
  mutation CompleteSuperadminWorkspaceSetup(
    $input: CompleteSuperadminWorkspaceSetupInput!
  ) {
    completeSuperadminWorkspaceSetup(input: $input) {
      success
    }
  }
`;
