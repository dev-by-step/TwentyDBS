import { Trans, useLingui } from '@lingui/react/macro';
import { H2Title } from 'twenty-ui/display';
import { Checkbox } from 'twenty-ui/input';

import {
  StyledCheckboxLabel,
  StyledCheckboxRow,
  StyledHint,
  StyledModuleList,
  StyledModuleRow,
  StyledSection,
} from '@/onboarding/components/SuperadminWorkspaceSetup.styles';
import { type ModuleOption } from '@/onboarding/utils/superadminWorkspaceSetup';

// IMP-15 : section présentationnelle « modules du workspace ».
type SuperadminModulesSectionProps = {
  moduleOptions: ModuleOption[];
  selectedModuleIds: string[];
  onToggleModuleSelection: (objectMetadataId: string, checked: boolean) => void;
};

export const SuperadminModulesSection = ({
  moduleOptions,
  selectedModuleIds,
  onToggleModuleSelection,
}: SuperadminModulesSectionProps) => {
  const { t } = useLingui();

  return (
    <StyledSection>
      <H2Title
        title={t`Workspace modules`}
        description={t`Pick the startup modules to keep visible in the workplace.`}
      />
      <StyledModuleList>
        {moduleOptions.map((moduleOption) => (
          <StyledModuleRow key={moduleOption.objectMetadataId}>
            <StyledCheckboxRow>
              <Checkbox
                checked={selectedModuleIds.includes(
                  moduleOption.objectMetadataId,
                )}
                onChange={(event) =>
                  onToggleModuleSelection(
                    moduleOption.objectMetadataId,
                    event.target.checked,
                  )
                }
                aria-label={moduleOption.label}
              />
              <StyledCheckboxLabel>{moduleOption.label}</StyledCheckboxLabel>
            </StyledCheckboxRow>
          </StyledModuleRow>
        ))}
      </StyledModuleList>
      <StyledHint>
        <Trans>
          The checked modules become workspace-level navigation items.
        </Trans>
      </StyledHint>
    </StyledSection>
  );
};
