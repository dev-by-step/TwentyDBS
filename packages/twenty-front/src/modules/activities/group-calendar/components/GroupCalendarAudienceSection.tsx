import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';

import {
  type AudienceMode,
  INTERNAL_ENTITY_OBJECT_NAME_SINGULAR,
} from '@/activities/group-calendar/constants/CalendarEventAudience';
import { useCurrentUserEntityIds } from '@/activities/group-calendar/hooks/useCurrentUserEntityIds';
import { useEntityMembersCoverage } from '@/activities/group-calendar/hooks/useEntityMembersCoverage';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { themeCssVariables } from 'twenty-ui/theme-constants';

type InternalEntityRecord = {
  __typename: string;
  id: string;
  name: string;
  color?: string | null;
};

type WorkspaceMemberAudienceRecord = {
  __typename: string;
  id: string;
  name: {
    firstName: string;
    lastName: string;
  };
};

const StyledField = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledRadioGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledRadioOption = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledChipsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledChip = styled.button<{
  selected: boolean;
  chipColor?: string | null;
}>`
  background: ${({ selected, chipColor }) =>
    selected
      ? (chipColor ?? themeCssVariables.background.tertiary)
      : themeCssVariables.background.secondary};
  border: 1px solid
    ${({ selected, chipColor }) =>
      selected
        ? (chipColor ?? themeCssVariables.border.color.strong)
        : themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${({ selected }) =>
    selected
      ? themeCssVariables.font.color.inverted
      : themeCssVariables.font.color.primary};
  cursor: pointer;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledMemberChip = styled.button<{
  selected: boolean;
  covered: boolean;
}>`
  background: ${({ selected }) =>
    selected
      ? themeCssVariables.background.tertiary
      : themeCssVariables.background.secondary};
  border: 1px solid
    ${({ selected, covered }) =>
      selected
        ? themeCssVariables.border.color.strong
        : covered
          ? themeCssVariables.border.color.light
          : themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${({ selected, covered }) =>
    selected
      ? themeCssVariables.font.color.inverted
      : covered
        ? themeCssVariables.font.color.tertiary
        : themeCssVariables.font.color.primary};
  cursor: ${({ covered }) => (covered ? 'not-allowed' : 'pointer')};
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
  opacity: ${({ covered }) => (covered ? 0.6 : 1)};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledSubLabel = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
  margin-top: ${themeCssVariables.spacing[1]};
`;

const StyledHelperText = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const buildWorkspaceMemberDisplayName = (
  member: WorkspaceMemberAudienceRecord,
): string =>
  `${member.name.firstName ?? ''} ${member.name.lastName ?? ''}`.trim() ||
  t`Unnamed member`;

type GroupCalendarAudienceSectionProps = {
  audienceMode: AudienceMode;
  selectedAudienceEntityIds: string[];
  selectedAudienceMemberIds: string[];
  isPersonAudienceFeatureAvailable: boolean;
  onAudienceModeChange: (mode: AudienceMode) => void;
  onToggleAudienceEntity: (entityId: string) => void;
  onToggleAudienceMember: (workspaceMemberId: string) => void;
};

export const GroupCalendarAudienceSection = ({
  audienceMode,
  selectedAudienceEntityIds,
  selectedAudienceMemberIds,
  isPersonAudienceFeatureAvailable,
  onAudienceModeChange,
  onToggleAudienceEntity,
  onToggleAudienceMember,
}: GroupCalendarAudienceSectionProps) => {
  const { records: internalEntities = [] } =
    useFindManyRecords<InternalEntityRecord>({
      objectNameSingular: INTERNAL_ENTITY_OBJECT_NAME_SINGULAR,
      recordGqlFields: { id: true, name: true, color: true },
    });

  const { records: workspaceMembers = [] } =
    useFindManyRecords<WorkspaceMemberAudienceRecord>({
      objectNameSingular: CoreObjectNameSingular.WorkspaceMember,
      recordGqlFields: {
        id: true,
        name: true,
      },
      skip: !isPersonAudienceFeatureAvailable,
    });

  const {
    isMemberCoveredBySelectedEntities,
    entityIdsByMemberId,
  } = useEntityMembersCoverage({
    skip: !isPersonAudienceFeatureAvailable,
  });
  const currentUserEntityIds = useCurrentUserEntityIds();

  const isMemberInOwnerEntity = (workspaceMemberId: string): boolean => {
    const memberEntityIds = entityIdsByMemberId.get(workspaceMemberId);

    if (memberEntityIds === undefined || memberEntityIds.size === 0) {
      return false;
    }

    for (const entityId of memberEntityIds) {
      if (currentUserEntityIds.has(entityId)) {
        return true;
      }
    }

    return false;
  };

  return (
    <StyledField as="div">
      {t`Audience`}
      <StyledRadioGroup>
        <StyledRadioOption>
          <input
            type="radio"
            name="audience"
            checked={audienceMode === 'group'}
            onChange={() => onAudienceModeChange('group')}
          />
          {t`Visible to the entire workspace`}
        </StyledRadioOption>
        <StyledRadioOption>
          <input
            type="radio"
            name="audience"
            checked={audienceMode === 'specific'}
            onChange={() => onAudienceModeChange('specific')}
          />
          {t`Limit to my entity + grant access to specific people/entities`}
        </StyledRadioOption>
      </StyledRadioGroup>
      {audienceMode === 'specific' && (
        <>
          <StyledHelperText>
            {t`Members of your own entity already see this event. Use the picker below to also grant visibility to people or entities that would otherwise only see "Busy".`}
          </StyledHelperText>
          <StyledSubLabel>{t`Grant access to entities`}</StyledSubLabel>
          <StyledChipsContainer>
            {internalEntities.map((entity) => {
              const isOwnerEntity = currentUserEntityIds.has(entity.id);
              const selected =
                selectedAudienceEntityIds.includes(entity.id) || isOwnerEntity;

              return (
                <StyledChip
                  key={entity.id}
                  type="button"
                  selected={selected}
                  chipColor={entity.color}
                  disabled={isOwnerEntity}
                  title={
                    isOwnerEntity
                      ? t`Your entity — always sees this event.`
                      : undefined
                  }
                  onClick={() =>
                    isOwnerEntity ? undefined : onToggleAudienceEntity(entity.id)
                  }
                >
                  {isOwnerEntity ? `${entity.name} ✓` : entity.name}
                </StyledChip>
              );
            })}
          </StyledChipsContainer>
          {isPersonAudienceFeatureAvailable && (
            <>
              <StyledSubLabel>{t`Grant access to specific people`}</StyledSubLabel>
              <StyledChipsContainer>
                {workspaceMembers.length === 0 ? (
                  <StyledHelperText>
                    {t`No workspace members available.`}
                  </StyledHelperText>
                ) : (
                  workspaceMembers.map((member) => {
                    const isInOwnerEntity = isMemberInOwnerEntity(member.id);
                    const coveredByGrantedEntity =
                      isMemberCoveredBySelectedEntities(
                        member.id,
                        selectedAudienceEntityIds,
                      );
                    const covered = isInOwnerEntity || coveredByGrantedEntity;
                    const selected = selectedAudienceMemberIds.includes(
                      member.id,
                    );

                    return (
                      <StyledMemberChip
                        key={member.id}
                        type="button"
                        selected={selected}
                        covered={covered}
                        disabled={covered}
                        title={
                          isInOwnerEntity
                            ? t`Already in your entity — sees this event by default.`
                            : coveredByGrantedEntity
                              ? t`Already granted access via the selected entities.`
                              : undefined
                        }
                        onClick={() =>
                          covered ? undefined : onToggleAudienceMember(member.id)
                        }
                      >
                        {buildWorkspaceMemberDisplayName(member)}
                      </StyledMemberChip>
                    );
                  })
                )}
              </StyledChipsContainer>
            </>
          )}
          <StyledHelperText>
            {t`Everyone else will see this slot as "Busy" with the responsible entity's name.`}
          </StyledHelperText>
        </>
      )}
    </StyledField>
  );
};
