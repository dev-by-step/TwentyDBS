import { useLingui } from '@lingui/react/macro';
import { H2Title, IconArrowDown, IconArrowUp } from 'twenty-ui/display';
import { LightIconButton } from 'twenty-ui/input';

import {
  StyledCheckboxLabel,
  StyledModuleOrderActions,
  StyledModuleOrderList,
  StyledModuleOrderRow,
  StyledSection,
} from '@/onboarding/components/SuperadminWorkspaceSetup.styles';
import { type ModuleOption } from '@/onboarding/utils/superadminWorkspaceSetup';

// IMP-15 : section présentationnelle « ordre du menu ». Rendue uniquement
// quand au moins un module est sélectionné (géré par le parent).
type SuperadminModuleOrderSectionProps = {
  selectedModuleOptions: ModuleOption[];
  onMoveSelectedModule: (objectMetadataId: string, direction: -1 | 1) => void;
};

export const SuperadminModuleOrderSection = ({
  selectedModuleOptions,
  onMoveSelectedModule,
}: SuperadminModuleOrderSectionProps) => {
  const { t } = useLingui();

  return (
    <StyledSection>
      <H2Title
        title={t`Menu order`}
        description={t`Adjust the order of the selected modules in the workspace menu.`}
      />
      <StyledModuleOrderList>
        {selectedModuleOptions.map((moduleOption, index) => (
          <StyledModuleOrderRow key={moduleOption.objectMetadataId}>
            <StyledCheckboxLabel>{moduleOption.label}</StyledCheckboxLabel>
            <StyledModuleOrderActions>
              <LightIconButton
                title={t`Move up`}
                Icon={IconArrowUp}
                accent="tertiary"
                disabled={index === 0}
                onClick={() =>
                  onMoveSelectedModule(moduleOption.objectMetadataId, -1)
                }
              />
              <LightIconButton
                title={t`Move down`}
                Icon={IconArrowDown}
                accent="tertiary"
                disabled={index === selectedModuleOptions.length - 1}
                onClick={() =>
                  onMoveSelectedModule(moduleOption.objectMetadataId, 1)
                }
              />
            </StyledModuleOrderActions>
          </StyledModuleOrderRow>
        ))}
      </StyledModuleOrderList>
    </StyledSection>
  );
};
