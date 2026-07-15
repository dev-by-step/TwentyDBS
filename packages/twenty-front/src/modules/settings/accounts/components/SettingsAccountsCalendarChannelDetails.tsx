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
import {
  H2Title,
  IconCalendarEvent,
  IconHierarchy2,
  IconMail,
  IconPlug,
  IconUserPlus,
  IconUsers,
} from 'twenty-ui/display';
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

const StyledImportList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  list-style: none;
  margin: 0;
  padding: 0;
`;

const StyledImportItem = styled.li`
  align-items: flex-start;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledImportItemContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledImportItemTitle = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledImportItemDescription = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledImportCard = styled(Card)`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[4]};
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

  const updateChannel = useCallback(
    (update: Record<string, unknown>) => {
      updateMetadataChannel({
        variables: { input: { id: calendarChannel.id, update } },
      });
    },
    [calendarChannel.id, updateMetadataChannel],
  );

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
          title={t`What's imported from this account`}
          description={t`Connecting the account synchronises the following data into your workspace.`}
        />
        <StyledImportCard rounded>
          <StyledImportList>
            <StyledImportItem>
              <IconCalendarEvent size={16} />
              <StyledImportItemContent>
                <StyledImportItemTitle>
                  {t`Calendar events`}
                </StyledImportItemTitle>
                <StyledImportItemDescription>
                  {t`Title, description, location, attendees, dates and recurrence — masked to "Busy" for entities that aren't granted access below.`}
                </StyledImportItemDescription>
              </StyledImportItemContent>
            </StyledImportItem>
            <StyledImportItem>
              <IconMail size={16} />
              <StyledImportItemContent>
                <StyledImportItemTitle>{t`Emails`}</StyledImportItemTitle>
                <StyledImportItemDescription>
                  {t`Subject, body, sender and recipients of received and sent emails (attachments stay on the provider's servers).`}
                </StyledImportItemDescription>
              </StyledImportItemContent>
            </StyledImportItem>
            <StyledImportItem>
              <IconUsers size={16} />
              <StyledImportItemContent>
                <StyledImportItemTitle>{t`Contacts`}</StyledImportItemTitle>
                <StyledImportItemDescription>
                  {t`People you exchange emails with or share calendar events with — automatically added as Persons if auto-creation is enabled below.`}
                </StyledImportItemDescription>
              </StyledImportItemContent>
            </StyledImportItem>
            <StyledImportItem>
              <IconPlug size={16} />
              <StyledImportItemContent>
                <StyledImportItemTitle>
                  {t`Connection metadata`}
                </StyledImportItemTitle>
                <StyledImportItemDescription>
                  {t`Encrypted OAuth tokens kept securely so we can keep your data in sync. You can disconnect at any time.`}
                </StyledImportItemDescription>
              </StyledImportItemContent>
            </StyledImportItem>
          </StyledImportList>
        </StyledImportCard>
      </Section>
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
          description={t`Choose which internal entities can see full details from this imported calendar. This does not grant permission to manage or disconnect the connected account.`}
        />
        <StyledEntityAccessCard rounded>
          <StyledEntityAccessHeader>
            <IconHierarchy2 size={16} />
            {t`Visible internal entities`}
          </StyledEntityAccessHeader>
          <StyledHint>
            {t`Only the connected account owner can change account-level settings.`}
          </StyledHint>
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
            <>
              <StyledEntityPicker>
                {manageableEventEntities.map((entity) => (
                  <StyledEntityToggle
                    key={entity.id}
                    type="button"
                    aria-pressed={selectedInternalEntityIds.includes(entity.id)}
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
              <StyledHint>
                {t`Unselected entities will only see "Busy" on your calendar slots — they won't see the event title, description, attendees, or location, only that you're unavailable in that time range, along with your entity badge.`}
              </StyledHint>
            </>
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
