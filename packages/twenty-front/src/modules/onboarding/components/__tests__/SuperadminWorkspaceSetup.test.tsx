import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { navigationMenuItemsSelector } from '@/navigation-menu-item/common/states/navigationMenuItemsSelector';
import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { SuperadminWorkspaceSetup } from '@/onboarding/components/SuperadminWorkspaceSetup';
import { dynamicActivate } from '~/utils/i18n/dynamicActivate';

// Ce test de rendu est le FILET DE SÉCURITÉ d'IMP-15 : il exerce l'affichage
// des 3 sections et le flux handleSubmit de bout en bout, pour garantir
// qu'extraire l'orchestration dans un hook ne change pas le comportement.

const createInternalEntityMock = jest.fn();
const createMembershipMock = jest.fn();
const deleteMembershipsMock = jest.fn();
const createNavItemsMock = jest.fn();
const updateNavItemsMock = jest.fn();
const deleteNavItemsMock = jest.fn();
const completeSetupMock = jest.fn();
const setCurrentUserMock = jest.fn();
const enqueueErrorSnackBarMock = jest.fn();
const enqueueSuccessSnackBarMock = jest.fn();

const CURRENT_USER = {
  id: 'user-1',
  entityId: null,
  userVars: {},
};
const CURRENT_WORKSPACE_MEMBER = { id: 'workspace-member-1' };
const OBJECT_METADATA_ITEMS = [
  {
    nameSingular: 'workspaceMember',
    id: 'wm-obj',
    labelPlural: 'Workspace Members',
  },
  { nameSingular: 'person', id: 'person-obj', labelPlural: 'People' },
];

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: (state: unknown) => {
    switch (state) {
      case currentUserState:
        return CURRENT_USER;
      case currentWorkspaceMemberState:
        return CURRENT_WORKSPACE_MEMBER;
      case objectMetadataItemsSelector:
        return OBJECT_METADATA_ITEMS;
      case navigationMenuItemsSelector:
        return [];
      default:
        return undefined;
    }
  },
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomState', () => ({
  useSetAtomState: () => setCurrentUserMock,
}));

jest.mock('@apollo/client/react', () => ({
  useMutation: () => [completeSetupMock],
}));

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: () => ({ records: [], loading: false }),
}));

jest.mock('@/object-record/hooks/useCreateOneRecord', () => ({
  useCreateOneRecord: ({
    objectNameSingular,
  }: {
    objectNameSingular: string;
  }) => ({
    createOneRecord:
      objectNameSingular === 'internalEntity'
        ? createInternalEntityMock
        : createMembershipMock,
  }),
}));

jest.mock('@/object-record/hooks/useDeleteManyRecords', () => ({
  useDeleteManyRecords: () => ({ deleteManyRecords: deleteMembershipsMock }),
}));

jest.mock(
  '@/navigation-menu-item/common/hooks/useCreateManyNavigationMenuItems',
  () => ({
    useCreateManyNavigationMenuItems: () => ({
      createManyNavigationMenuItems: createNavItemsMock,
    }),
  }),
);

jest.mock(
  '@/navigation-menu-item/common/hooks/useUpdateManyNavigationMenuItems',
  () => ({
    useUpdateManyNavigationMenuItems: () => ({
      updateManyNavigationMenuItems: updateNavItemsMock,
    }),
  }),
);

jest.mock(
  '@/navigation-menu-item/common/hooks/useDeleteManyNavigationMenuItems',
  () => ({
    useDeleteManyNavigationMenuItems: () => ({
      deleteManyNavigationMenuItems: deleteNavItemsMock,
    }),
  }),
);

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: enqueueErrorSnackBarMock,
    enqueueSuccessSnackBar: enqueueSuccessSnackBarMock,
  }),
}));

dynamicActivate(SOURCE_LOCALE);

const renderComponent = () =>
  render(
    <ThemeProvider colorScheme="light">
      <I18nProvider i18n={i18n}>
        <SuperadminWorkspaceSetup />
      </I18nProvider>
    </ThemeProvider>,
  );

describe('SuperadminWorkspaceSetup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createInternalEntityMock.mockResolvedValue({ id: 'created-entity-id' });
    createMembershipMock.mockResolvedValue({ id: 'created-membership-id' });
    completeSetupMock.mockResolvedValue({ data: {} });
  });

  it('renders the base entities and the resolved workspace modules', () => {
    renderComponent();

    expect(screen.getByText('Set up your workspace')).toBeInTheDocument();
    // Entities section (from BASE_INTERNAL_ENTITY_SETUP)
    expect(screen.getByText('WEKNOW')).toBeInTheDocument();
    expect(screen.getByText('ANGLE_INTELLIGENCE')).toBeInTheDocument();
    // Modules section (workspaceMember relabelled to "Team")
    expect(screen.getByText('Team')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
  });

  it('disables Continue until at least one entity membership is selected', () => {
    renderComponent();

    const continueButton = screen.getByRole('button', { name: 'Continue' });

    expect(continueButton).toBeDisabled();
  });

  it('runs the full submit flow once an entity is selected', async () => {
    renderComponent();

    const membershipCheckboxes = screen.getAllByLabelText(
      'I belong to this entity',
    );

    fireEvent.click(membershipCheckboxes[0]);

    const continueButton = screen.getByRole('button', { name: 'Continue' });

    await waitFor(() => expect(continueButton).toBeEnabled());

    fireEvent.click(continueButton);

    await waitFor(() => expect(completeSetupMock).toHaveBeenCalledTimes(1));

    // The first (unsaved) base entity is created, and its membership is added.
    expect(createInternalEntityMock).toHaveBeenCalled();
    expect(createMembershipMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceMemberId: CURRENT_WORKSPACE_MEMBER.id,
      }),
    );
    expect(setCurrentUserMock).toHaveBeenCalled();
    expect(enqueueSuccessSnackBarMock).toHaveBeenCalled();
    expect(enqueueErrorSnackBarMock).not.toHaveBeenCalled();
  });
});
