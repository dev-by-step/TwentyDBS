import { styled } from '@linaria/react';
import { useContext, useEffect, useMemo, useState } from 'react';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { Key } from 'ts-key-enum';

import { SubTitle } from '@/auth/components/SubTitle';
import { Title } from '@/auth/components/Title';
import { OnboardingSyncEmailsSettingsCard } from '@/onboarding/components/OnboardingSyncEmailsSettingsCard';
import { useSetNextOnboardingStatus } from '@/onboarding/hooks/useSetNextOnboardingStatus';
import { useManageableEventEntities } from '@/activities/group-calendar/hooks/useManageableEventEntities';

import { isGoogleCalendarEnabledState } from '@/client-config/states/isGoogleCalendarEnabledState';
import { isGoogleMessagingEnabledState } from '@/client-config/states/isGoogleMessagingEnabledState';
import { isMicrosoftCalendarEnabledState } from '@/client-config/states/isMicrosoftCalendarEnabledState';
import { isMicrosoftMessagingEnabledState } from '@/client-config/states/isMicrosoftMessagingEnabledState';
import { useTriggerApisOAuth } from '@/settings/accounts/hooks/useTriggerApiOAuth';
import { PageFocusId } from '@/types/PageFocusId';
import { ModalContent } from 'twenty-ui/layout';
import { useHotkeysOnFocusedElement } from '@/ui/utilities/hotkey/hooks/useHotkeysOnFocusedElement';
import { t } from '@lingui/core/macro';
import { AppPath, ConnectedAccountProvider } from 'twenty-shared/types';
import {
  H2Title,
  IconCalendarEvent,
  IconGoogle,
  IconHierarchy2,
  IconMail,
  IconMicrosoft,
  IconUsers,
} from 'twenty-ui/display';
import { MainButton } from 'twenty-ui/input';
import { ClickToActionLink } from 'twenty-ui/navigation';
import { ThemeContext, themeCssVariables } from 'twenty-ui/theme-constants';
import { useMutation } from '@apollo/client/react';
import {
  CalendarChannelVisibility,
  MessageChannelVisibility,
} from '~/generated/graphql';
import { SkipSyncEmailOnboardingStepDocument } from '~/generated-metadata/graphql';
import { lastAuthenticatedMethodState } from '@/auth/states/lastAuthenticatedMethodState';
import { AuthenticatedMethod } from '@/auth/types/AuthenticatedMethod.enum';

const StyledSyncEmailsContainer = styled.div`
  display: flex;
  flex-direction: row;
  gap: ${themeCssVariables.spacing[2]};
  margin: ${themeCssVariables.spacing[8]} 0;
  width: 100%;
`;

const StyledActionLinkContainer = styled.div`
  display: flex;
  flex-direction: row;
  margin: ${themeCssVariables.spacing[3]} 0 0;
  padding-top: ${themeCssVariables.spacing[2]};
`;

const StyledProviderContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  margin-top: ${themeCssVariables.spacing[4]};
  width: 100%;
`;

const StyledImportRow = styled.div`
  align-items: flex-start;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledImportCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const StyledImportTitle = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledImportDescription = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledEntityPicker = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledEntityChip = styled.button<{
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
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledEntityDot = styled.span<{ chipColor?: string | null }>`
  background: ${({ chipColor }) =>
    chipColor ?? themeCssVariables.background.tertiary};
  border-radius: ${themeCssVariables.border.radius.rounded};
  height: ${themeCssVariables.spacing[2]};
  width: ${themeCssVariables.spacing[2]};
`;

const StyledHint = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

export const SyncEmails = () => {
  const { theme } = useContext(ThemeContext);
  const { triggerApisOAuth } = useTriggerApisOAuth();
  const setNextOnboardingStatus = useSetNextOnboardingStatus();
  const [visibility, setVisibility] = useState<MessageChannelVisibility>(
    MessageChannelVisibility.SHARE_EVERYTHING,
  );
  const [lastAuthenticatedMethod] = useAtomState(lastAuthenticatedMethodState);
  const [skipSyncEmailOnboardingStatusMutation] = useMutation(
    SkipSyncEmailOnboardingStepDocument,
  );

  const {
    manageableEventEntities,
    primaryEventEntityId,
    isReady: areManageableEntitiesReady,
  } = useManageableEventEntities();

  const [selectedInternalEntityIds, setSelectedInternalEntityIds] = useState<
    string[]
  >([]);
  const [hasUserChangedSelection, setHasUserChangedSelection] = useState(false);

  // Pre-select the user's primary entity once the entity list has resolved.
  // This mirrors the post-connect default of CreateCalendarChannelService —
  // showing the same opinionated baseline keeps onboarding consistent with
  // what users would see in Settings later.
  useEffect(() => {
    if (
      hasUserChangedSelection ||
      !areManageableEntitiesReady ||
      manageableEventEntities.length === 0
    ) {
      return;
    }

    if (
      selectedInternalEntityIds.length === 0 &&
      primaryEventEntityId !== null
    ) {
      setSelectedInternalEntityIds([primaryEventEntityId]);
    }
  }, [
    areManageableEntitiesReady,
    hasUserChangedSelection,
    manageableEventEntities.length,
    primaryEventEntityId,
    selectedInternalEntityIds.length,
  ]);

  const handleToggleEntity = (entityId: string) => {
    setHasUserChangedSelection(true);
    setSelectedInternalEntityIds((current) =>
      current.includes(entityId)
        ? current.filter((id) => id !== entityId)
        : [...current, entityId],
    );
  };

  const isMetadataVisibility =
    visibility !== MessageChannelVisibility.SHARE_EVERYTHING;

  const sortedSelectedEntityNames = useMemo(() => {
    return manageableEventEntities
      .filter((entity) => selectedInternalEntityIds.includes(entity.id))
      .map((entity) => entity.name);
  }, [manageableEventEntities, selectedInternalEntityIds]);

  const handleButtonClick = async (provider: ConnectedAccountProvider) => {
    const calendarChannelVisibility =
      visibility === MessageChannelVisibility.SHARE_EVERYTHING
        ? CalendarChannelVisibility.SHARE_EVERYTHING
        : CalendarChannelVisibility.METADATA;

    await triggerApisOAuth(provider, {
      redirectLocation: AppPath.Index,
      messageVisibility: visibility,
      calendarVisibility: calendarChannelVisibility,
      visibleInternalEntityIds:
        isMetadataVisibility && selectedInternalEntityIds.length > 0
          ? selectedInternalEntityIds
          : undefined,
      skipMessageChannelConfiguration: true,
    });
  };

  const continueWithoutSync = async () => {
    await skipSyncEmailOnboardingStatusMutation();
    setNextOnboardingStatus();
  };

  const userAuthenticatedWithSSO =
    lastAuthenticatedMethod === AuthenticatedMethod.SSO;

  const isGoogleMessagingEnabled = useAtomStateValue(
    isGoogleMessagingEnabledState,
  );
  const isMicrosoftMessagingEnabled = useAtomStateValue(
    isMicrosoftMessagingEnabledState,
  );

  const isGoogleCalendarEnabled = useAtomStateValue(
    isGoogleCalendarEnabledState,
  );

  const isMicrosoftCalendarEnabled = useAtomStateValue(
    isMicrosoftCalendarEnabledState,
  );

  const isGoogleProviderEnabled =
    isGoogleMessagingEnabled || isGoogleCalendarEnabled;
  const isMicrosoftProviderEnabled =
    isMicrosoftMessagingEnabled || isMicrosoftCalendarEnabled;

  useHotkeysOnFocusedElement({
    keys: Key.Enter,
    callback: async () => {
      await continueWithoutSync();
    },
    focusId: PageFocusId.SyncEmail,
    dependencies: [continueWithoutSync],
  });

  return (
    <ModalContent isVerticallyCentered isHorizontallyCentered>
      <Title noMarginTop>{t`Emails and Calendar`}</Title>
      <SubTitle>
        {t`Sync your Emails and Calendar with Twenty. Choose your privacy settings.`}
      </SubTitle>

      <StyledSection>
        <H2Title
          title={t`What will be imported`}
          description={t`The selected provider will sync the following data into your workspace.`}
        />
        <StyledImportRow>
          <IconCalendarEvent size={16} />
          <StyledImportCol>
            <StyledImportTitle>{t`Calendar events`}</StyledImportTitle>
            <StyledImportDescription>
              {t`Title, description, location, attendees, dates and recurrence.`}
            </StyledImportDescription>
          </StyledImportCol>
        </StyledImportRow>
        <StyledImportRow>
          <IconMail size={16} />
          <StyledImportCol>
            <StyledImportTitle>{t`Emails`}</StyledImportTitle>
            <StyledImportDescription>
              {t`Subject, body, sender and recipients of sent and received messages.`}
            </StyledImportDescription>
          </StyledImportCol>
        </StyledImportRow>
        <StyledImportRow>
          <IconUsers size={16} />
          <StyledImportCol>
            <StyledImportTitle>{t`Contacts`}</StyledImportTitle>
            <StyledImportDescription>
              {t`People you exchange emails with or share calendar events with — added as Persons in your workspace.`}
            </StyledImportDescription>
          </StyledImportCol>
        </StyledImportRow>
      </StyledSection>

      <StyledSyncEmailsContainer>
        <OnboardingSyncEmailsSettingsCard
          value={visibility}
          onChange={setVisibility}
        />
      </StyledSyncEmailsContainer>

      {isMetadataVisibility && manageableEventEntities.length > 0 && (
        <StyledSection>
          <H2Title
            title={t`Who can see the details`}
            description={t`Pick the internal entities allowed to see the full content of your imported calendar. Unselected entities will only see "Busy" slots on your calendar (no title, location or attendees) — they will keep seeing your availability and your entity badge. You can change this later in Settings.`}
          />
          <StyledEntityPicker>
            {manageableEventEntities.map((entity) => {
              const selected = selectedInternalEntityIds.includes(entity.id);
              return (
                <StyledEntityChip
                  key={entity.id}
                  type="button"
                  selected={selected}
                  aria-pressed={selected}
                  chipColor={entity.color}
                  onClick={() => handleToggleEntity(entity.id)}
                  title={entity.name}
                >
                  <IconHierarchy2 size={12} />
                  <StyledEntityDot chipColor={entity.color} />
                  {entity.name}
                </StyledEntityChip>
              );
            })}
          </StyledEntityPicker>
          <StyledHint>
            {sortedSelectedEntityNames.length === 0
              ? t`No entity selected: only you will see full details until you change this in Settings.`
              : t`Selected: ${sortedSelectedEntityNames.join(', ')}.`}
          </StyledHint>
          <StyledHint>
            {t`Note: email content visibility follows the workspace-wide privacy setting above; the entity selection below applies to calendar events.`}
          </StyledHint>
        </StyledSection>
      )}

      <StyledProviderContainer>
        {!userAuthenticatedWithSSO && isGoogleProviderEnabled && (
          <MainButton
            title={t`Sync with Google`}
            onClick={() => handleButtonClick(ConnectedAccountProvider.GOOGLE)}
            width={200}
            Icon={() => <IconGoogle size={theme.icon.size.sm} />}
          />
        )}
        {!userAuthenticatedWithSSO && isMicrosoftProviderEnabled && (
          <MainButton
            title={t`Sync with Outlook`}
            onClick={() =>
              handleButtonClick(ConnectedAccountProvider.MICROSOFT)
            }
            width={200}
            Icon={() => <IconMicrosoft size={theme.icon.size.sm} />}
          />
        )}
        {!isMicrosoftProviderEnabled && !isGoogleProviderEnabled && (
          <MainButton
            title={t`Continue`}
            onClick={continueWithoutSync}
            width={144}
          />
        )}
        {userAuthenticatedWithSSO && isMicrosoftProviderEnabled && (
          <MainButton
            title={t`Continue`}
            onClick={() =>
              handleButtonClick(ConnectedAccountProvider.MICROSOFT)
            }
            width={144}
          />
        )}
        {userAuthenticatedWithSSO && isGoogleProviderEnabled && (
          <MainButton
            title={t`Continue`}
            onClick={() => handleButtonClick(ConnectedAccountProvider.GOOGLE)}
            width={144}
          />
        )}
      </StyledProviderContainer>
      <StyledActionLinkContainer>
        <ClickToActionLink onClick={continueWithoutSync}>
          {t`Continue without sync`}
        </ClickToActionLink>
      </StyledActionLinkContainer>
    </ModalContent>
  );
};
