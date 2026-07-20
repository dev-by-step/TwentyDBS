import { Trans, useLingui } from '@lingui/react/macro';
import { MainButton } from 'twenty-ui/input';
import { ModalContent } from 'twenty-ui/layout';

import { SubTitle } from '@/auth/components/SubTitle';
import { Title } from '@/auth/components/Title';
import { SuperadminEntitiesSection } from '@/onboarding/components/SuperadminEntitiesSection';
import { SuperadminModuleOrderSection } from '@/onboarding/components/SuperadminModuleOrderSection';
import { SuperadminModulesSection } from '@/onboarding/components/SuperadminModulesSection';
import {
  StyledActionRow,
  StyledContent,
  StyledHint,
  StyledPrimaryAction,
} from '@/onboarding/components/SuperadminWorkspaceSetup.styles';
import { useSuperadminWorkspaceSetupForm } from '@/onboarding/hooks/useSuperadminWorkspaceSetupForm';

export const SuperadminWorkspaceSetup = () => {
  const { t } = useLingui();
  const {
    isInitialized,
    entityDrafts,
    moduleOptions,
    selectedModuleIds,
    selectedModuleOptions,
    canSubmit,
    updateEntityDraft,
    toggleModuleSelection,
    moveSelectedModule,
    handleSubmit,
  } = useSuperadminWorkspaceSetupForm();

  if (!isInitialized) {
    return (
      <ModalContent isVerticallyCentered isHorizontallyCentered>
        <Title>
          <Trans>Set up your workspace</Trans>
        </Title>
        <SubTitle>
          <Trans>Loading your internal entities and workspace modules.</Trans>
        </SubTitle>
      </ModalContent>
    );
  }

  return (
    <ModalContent isVerticallyCentered isHorizontallyCentered>
      <Title>
        <Trans>Set up your workspace</Trans>
      </Title>
      <SubTitle>
        <Trans>
          Select the entity or entities you belong to and the startup modules to
          expose in the workplace.
        </Trans>
      </SubTitle>
      <StyledContent>
        <SuperadminEntitiesSection
          entityDrafts={entityDrafts}
          onUpdateEntityDraft={updateEntityDraft}
        />

        <SuperadminModulesSection
          moduleOptions={moduleOptions}
          selectedModuleIds={selectedModuleIds}
          onToggleModuleSelection={toggleModuleSelection}
        />

        {selectedModuleOptions.length > 0 && (
          <SuperadminModuleOrderSection
            selectedModuleOptions={selectedModuleOptions}
            onMoveSelectedModule={moveSelectedModule}
          />
        )}
      </StyledContent>
      <StyledActionRow>
        <StyledHint>
          <Trans>
            Once this step is saved, onboarding continues with team invites.
          </Trans>
        </StyledHint>
        <StyledPrimaryAction>
          <MainButton
            title={t`Continue`}
            onClick={handleSubmit}
            disabled={!canSubmit}
            fullWidth
          />
        </StyledPrimaryAction>
      </StyledActionRow>
    </ModalContent>
  );
};
