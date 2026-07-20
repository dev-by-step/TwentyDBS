import { Trans, useLingui } from '@lingui/react/macro';
import { H2Title } from 'twenty-ui/display';
import { Checkbox } from 'twenty-ui/input';

import {
  StyledCheckboxLabel,
  StyledCheckboxRow,
  StyledEntityCard,
  StyledEntityHeader,
  StyledEntityName,
  StyledSection,
  StyledTwoColumns,
} from '@/onboarding/components/SuperadminWorkspaceSetup.styles';
import { type EntityDraft } from '@/onboarding/utils/superadminWorkspaceSetup';
import { TextInput } from '@/ui/input/components/TextInput';

// IMP-15 : section présentationnelle « entités internes » extraite de
// SuperadminWorkspaceSetup. Pure : reçoit les drafts et un callback de mise à
// jour, aucun état ni logique métier.
type SuperadminEntitiesSectionProps = {
  entityDrafts: EntityDraft[];
  onUpdateEntityDraft: (
    entityName: string,
    patch: Partial<EntityDraft>,
  ) => void;
};

export const SuperadminEntitiesSection = ({
  entityDrafts,
  onUpdateEntityDraft,
}: SuperadminEntitiesSectionProps) => {
  const { t } = useLingui();

  return (
    <StyledSection>
      <H2Title
        title={t`Internal entities`}
        description={t`Review the four base entities, fill in their details, and select the ones you actually belong to.`}
      />
      {entityDrafts.map((entityDraft) => (
        <StyledEntityCard key={entityDraft.name}>
          <StyledEntityHeader>
            <StyledEntityName>{entityDraft.name}</StyledEntityName>
          </StyledEntityHeader>
          <StyledCheckboxRow>
            <Checkbox
              checked={entityDraft.isMember}
              onChange={(event) =>
                onUpdateEntityDraft(entityDraft.name, {
                  isMember: event.target.checked,
                })
              }
              aria-label={t`I belong to this entity`}
            />
            <StyledCheckboxLabel>
              <Trans>I belong to this entity</Trans>
            </StyledCheckboxLabel>
          </StyledCheckboxRow>
          <StyledTwoColumns>
            <TextInput
              label={t`Website`}
              value={entityDraft.website}
              onChange={(nextValue) =>
                onUpdateEntityDraft(entityDraft.name, {
                  website: nextValue,
                })
              }
              placeholder={t`https://example.com`}
              fullWidth
            />
          </StyledTwoColumns>
          <TextInput
            label={t`Team size`}
            value={entityDraft.headcount}
            type="number"
            onChange={(nextValue) =>
              onUpdateEntityDraft(entityDraft.name, {
                headcount: nextValue,
              })
            }
            placeholder={t`25`}
            fullWidth
          />
        </StyledEntityCard>
      ))}
    </StyledSection>
  );
};
