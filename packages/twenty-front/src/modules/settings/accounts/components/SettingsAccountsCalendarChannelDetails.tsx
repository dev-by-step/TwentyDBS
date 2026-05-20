import { type CalendarChannel } from '@/accounts/types/CalendarChannel';
import { useManageableEventEntities } from '@/activities/group-calendar/hooks/useManageableEventEntities';
import { UPDATE_CALENDAR_CHANNEL } from '@/settings/accounts/graphql/mutations/updateCalendarChannel';
import { useMutation } from '@apollo/client/react';
import { SettingsAccountsEventVisibilitySettingsCard } from '@/settings/accounts/components/SettingsAccountsCalendarVisibilitySettingsCard';
import { SettingsOptionCardContentToggle } from '@/settings/components/SettingsOptions/SettingsOptionCardContentToggle';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { Section } from '@react-email/components';
import { useCallback, useEffect } from 'react';
import { H2Title, IconHierarchy2, IconUserPlus } from 'twenty-ui/display';
import { Card } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { CalendarChannelVisibility } from '~/generated/graphql';

const StyledDetailsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[6]};
`;

const StyledEntityAccessCard = styled(Card)`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[4]};
`;

const StyledEntityAccessHeader = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
`;

const StyledEntityPicker = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledEntityToggle = styled.button<{
  selected: boolean;
  chipColor?: string | null;
}>`
  align-items: center;
  background: ${({ selected }) =>
    selected
      ? themeCssVariables.background.primary
      : themeCssVariables.background.secondary};
  border: 1px solid
    ${({ selected }) =>
      selected
        ? themeCssVariables.border.color.strong
        : themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${({ selected }) =>
    selected
      ? themeCssVariables.font.color.primary
      : themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: inline-flex;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  gap: ${themeCssVariables.spacing[1]};
  max-width: 100%;
  min-width: 0;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledEntityDot = styled.span<{ chipColor?: string | null }>`
  background: ${({ chipColor }) =>
    chipColor ?? themeCssVariables.background.tertiary};
  border-radius: ${themeCssVariables.border.radius.rounded};
  flex: 0 0 ${themeCssVariables.spacing[2]};
  height: ${themeCssVariables.spacing[2]};
  width: ${themeCssVariables.spacing[2]};
`;

const StyledEntityName = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledHint = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

type SettingsAccountsCalendarChannelDetailsProps = {
  calendarChannel: Pick<
    CalendarChannel,
    | 'id'
    | 'visibility'
    | 'visibleInternalEntityIds'
    | 'isContactAutoCreationEnabled'
    | 'isSyncEnabled'
  >;
};

export const SettingsAccountsCalendarChannelDetails = ({
  calendarChannel,
}: SettingsAccountsCalendarChannelDetailsProps) => {
  const [updateMetadataChannel] = useMutation(UPDATE_CALENDAR_CHANNEL);
  const {
    manageableEventEntities,
    primaryEventEntityId,
    isReady: areManageableEntitiesReady,
  } = useManageableEventEntities();

  const updateChannel = useCallback((update: Record<string, unknown>) => {
    updateMetadataChannel({
      variables: { input: { id: calendarChannel.id, update } },
    });
  }, [calendarChannel.id, updateMetadataChannel]);

  const handleVisibilityChange = (value: CalendarChannelVisibility) => {
    updateChannel({ visibility: value });
  };

  const persistedVisibleInternalEntityIds =
    calendarChannel.visibleInternalEntityIds ?? [];

  const selectedInternalEntityIds =
    persistedVisibleInternalEntityIds.length > 0
      ? persistedVisibleInternalEntityIds
      : primaryEventEntityId
        ? [primaryEventEntityId]
        : [];

  useEffect(() => {
    if (
      persistedVisibleInternalEntityIds.length > 0 ||
      !areManageableEntitiesReady ||
      !primaryEventEntityId
    ) {
      return;
    }

    updateChannel({ visibleInternalEntityIds: [primaryEventEntityId] });
  }, [
    areManageableEntitiesReady,
    persistedVisibleInternalEntityIds.length,
    primaryEventEntityId,
    updateChannel,
  ]);

  const handleToggleVisibleInternalEntity = (entityId: string) => {
    const nextSelectedInternalEntityIds = selectedInternalEntityIds.includes(
      entityId,
    )
      ? selectedInternalEntityIds.filter(
          (selectedEntityId) => selectedEntityId !== entityId,
        )
      : [...selectedInternalEntityIds, entityId];

    if (nextSelectedInternalEntityIds.length === 0) {
      return;
    }

    updateChannel({
      visibleInternalEntityIds: nextSelectedInternalEntityIds,
    });
  };

  const handleContactAutoCreationToggle = (value: boolean) => {
    updateChannel({ isContactAutoCreationEnabled: value });
  };

  return (
    <StyledDetailsContainer>
      <Section>
        <H2Title
          title={t`Event visibility`}
          description={t`Define what will be visible to other users in your workspace`}
        />
        <SettingsAccountsEventVisibilitySettingsCard
          value={calendarChannel.visibility}
          onChange={handleVisibilityChange}
        />
      </Section>
      <Section>
        <H2Title
          title={t`Entity access`}
          description={t`Choose which internal entities can see full details from this imported calendar.`}
        />
        <StyledEntityAccessCard rounded>
          <StyledEntityAccessHeader>
            <IconHierarchy2 size={16} />
            {t`Visible internal entities`}
          </StyledEntityAccessHeader>
          {calendarChannel.visibility ===
          CalendarChannelVisibility.SHARE_EVERYTHING ? (
            <StyledHint>
              {t`Everything visibility shares full details with the whole workspace.`}
            </StyledHint>
          ) : manageableEventEntities.length === 0 ? (
            <StyledHint>
              {t`No internal entity is available for your account.`}
            </StyledHint>
          ) : (
            <StyledEntityPicker>
              {manageableEventEntities.map((entity) => (
                <StyledEntityToggle
                  key={entity.id}
                  type="button"
                  selected={selectedInternalEntityIds.includes(entity.id)}
                  chipColor={entity.color}
                  onClick={() => handleToggleVisibleInternalEntity(entity.id)}
                  title={entity.name}
                >
                  <StyledEntityDot chipColor={entity.color} />
                  <StyledEntityName>{entity.name}</StyledEntityName>
                </StyledEntityToggle>
              ))}
            </StyledEntityPicker>
          )}
        </StyledEntityAccessCard>
      </Section>
      <Section>
        <H2Title
          title={t`Contact auto-creation`}
          description={t`Automatically create contacts for people you've participated in an event with.`}
        />
        <Card rounded>
          <SettingsOptionCardContentToggle
            Icon={IconUserPlus}
            title={t`Auto-creation`}
            description={t`Automatically create contacts for people.`}
            checked={calendarChannel.isContactAutoCreationEnabled}
            onChange={() => {
              handleContactAutoCreationToggle(
                !calendarChannel.isContactAutoCreationEnabled,
              );
            }}
          />
        </Card>
      </Section>
    </StyledDetailsContainer>
  );
};
