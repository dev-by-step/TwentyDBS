import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useMemo } from 'react';

import {
  type AudienceMode,
  INTERNAL_ENTITY_OBJECT_NAME_SINGULAR,
} from '@/activities/group-calendar/constants/CalendarEventAudience';
import { StyledGroupCalendarSelectableChip } from '@/activities/group-calendar/components/GroupCalendarSelectableChip';
import { GROUP_CALENDAR_CONFIG } from '@/activities/group-calendar/constants/GroupCalendar';
import { useEntityMembersCoverage } from '@/activities/group-calendar/hooks/useEntityMembersCoverage';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { IconCheck } from 'twenty-ui/display';
import { Radio } from 'twenty-ui/input';
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

const StyledChipsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
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

const buildWorkspaceMemberDedupeKey = (
  member: WorkspaceMemberAudienceRecord,
): string => buildWorkspaceMemberDisplayName(member).toLowerCase();

type GroupCalendarAudienceSectionProps = {
  audienceMode: AudienceMode;
  selectedAudienceEntityIds: string[];
  selectedAudienceMemberIds: string[];
  isPersonAudienceFeatureAvailable: boolean;
  eventEntityIds?: string[];
  onAudienceModeChange: (mode: AudienceMode) => void;
  onToggleAudienceEntity: (entityId: string) => void;
  onToggleAudienceMember: (workspaceMemberId: string) => void;
};

export const GroupCalendarAudienceSection = ({
  audienceMode,
  selectedAudienceEntityIds,
  selectedAudienceMemberIds,
  isPersonAudienceFeatureAvailable,
  eventEntityIds = [],
  onAudienceModeChange,
  onToggleAudienceEntity,
  onToggleAudienceMember,
}: GroupCalendarAudienceSectionProps) => {
  const { records: internalEntities = [] } =
    useFindManyRecords<InternalEntityRecord>({
      objectNameSingular: INTERNAL_ENTITY_OBJECT_NAME_SINGULAR,
      recordGqlFields: { id: true, name: true, color: true },
      limit: GROUP_CALENDAR_CONFIG.limits.entityPicker,
    });

  const { records: workspaceMembers = [] } =
    useFindManyRecords<WorkspaceMemberAudienceRecord>({
      objectNameSingular: CoreObjectNameSingular.WorkspaceMember,
      recordGqlFields: {
        id: true,
        name: true,
      },
      limit: GROUP_CALENDAR_CONFIG.limits.workspaceMemberPicker,
      skip: !isPersonAudienceFeatureAvailable,
    });

  const { isMemberCoveredBySelectedEntities, entityIdsByMemberId } =
    useEntityMembersCoverage({
      skip: !isPersonAudienceFeatureAvailable,
      limit: GROUP_CALENDAR_CONFIG.limits.entityMembership,
    });
  const audienceWorkspaceMembers = useMemo(() => {
    const membersByName = new Map<string, WorkspaceMemberAudienceRecord>();

    for (const member of workspaceMembers) {
      const memberEntityIds = entityIdsByMemberId.get(member.id);

      if (memberEntityIds === undefined || memberEntityIds.size === 0) {
        continue;
      }

      const memberKey = buildWorkspaceMemberDedupeKey(member);

      if (!membersByName.has(memberKey)) {
        membersByName.set(memberKey, member);
      }
    }

    return [...membersByName.values()];
  }, [entityIdsByMemberId, workspaceMembers]);

  const isMemberInOwnerEntity = (workspaceMemberId: string): boolean => {
    if (eventEntityIds.length === 0) {
      return false;
    }

    const memberEntityIds = entityIdsByMemberId.get(workspaceMemberId);

    if (memberEntityIds === undefined || memberEntityIds.size === 0) {
      return false;
    }

    return eventEntityIds.some((entityId) => memberEntityIds.has(entityId));
  };

  return (
    <StyledField as="div">
      {t`Who can see this event?`}
      <StyledRadioGroup>
        <Radio.Group
          value={audienceMode}
          onValueChange={(value) => onAudienceModeChange(value as AudienceMode)}
        >
          <Radio
            name="group-calendar-audience"
            value="specific"
            label={t`Only the event entities (and explicit grants)`}
          />
          <Radio
            name="group-calendar-audience"
            value="group"
            label={t`Everyone in the workspace`}
          />
        </Radio.Group>
      </StyledRadioGroup>
      {audienceMode === 'specific' && (
        <>
          <StyledHelperText>
            {t`Members of the event entities always see this event. You can optionally grant access to other entities or people below — everyone else only sees "Busy" with the responsible entity's color.`}
          </StyledHelperText>
          <StyledSubLabel>{t`Also visible to — other entities`}</StyledSubLabel>
          <StyledChipsContainer>
            {internalEntities.length === 0 ? (
              <StyledHelperText>
                {t`No other internal entity available.`}
              </StyledHelperText>
            ) : (
              internalEntities.map((entity) => {
                const isEventEntity = eventEntityIds.includes(entity.id);
                const selected =
                  selectedAudienceEntityIds.includes(entity.id) ||
                  isEventEntity;

                return (
                  <StyledGroupCalendarSelectableChip
                    key={entity.id}
                    type="button"
                    selected={selected}
                    chipColor={entity.color}
                    disabled={isEventEntity}
                    title={
                      isEventEntity
                        ? t`Event entity — already sees this event.`
                        : undefined
                    }
                    onClick={() =>
                      isEventEntity
                        ? undefined
                        : onToggleAudienceEntity(entity.id)
                    }
                  >
                    {entity.name}
                    {isEventEntity && (
                      <IconCheck size={themeCssVariables.icon.size.sm} />
                    )}
                  </StyledGroupCalendarSelectableChip>
                );
              })
            )}
          </StyledChipsContainer>
          {isPersonAudienceFeatureAvailable && (
            <>
              <StyledSubLabel>{t`Also visible to — specific people`}</StyledSubLabel>
              <StyledChipsContainer>
                {audienceWorkspaceMembers.length === 0 ? (
                  <StyledHelperText>
                    {t`No workspace members available.`}
                  </StyledHelperText>
                ) : (
                  audienceWorkspaceMembers.map((member) => {
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
                            ? t`Already in an event entity — sees this event by default.`
                            : coveredByGrantedEntity
                              ? t`Already covered by a granted entity.`
                              : undefined
                        }
                        onClick={() =>
                          covered
                            ? undefined
                            : onToggleAudienceMember(member.id)
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
        </>
      )}
    </StyledField>
  );
};
