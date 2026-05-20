import { isGoogleCalendarEnabledState } from '@/client-config/states/isGoogleCalendarEnabledState';
import { isGoogleMessagingEnabledState } from '@/client-config/states/isGoogleMessagingEnabledState';
import { isImapSmtpCaldavEnabledState } from '@/client-config/states/isImapSmtpCaldavEnabledState';
import { isMicrosoftCalendarEnabledState } from '@/client-config/states/isMicrosoftCalendarEnabledState';
import { isMicrosoftMessagingEnabledState } from '@/client-config/states/isMicrosoftMessagingEnabledState';
import { useManageableEventEntities } from '@/activities/group-calendar/hooks/useManageableEventEntities';
import { useTriggerApisOAuth } from '@/settings/accounts/hooks/useTriggerApiOAuth';
import { SettingsCard } from '@/settings/components/SettingsCard';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { ConnectedAccountProvider, SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import { useContext, useEffect, useState } from 'react';
import { H1Title, IconAt, IconGoogle, IconMicrosoft } from 'twenty-ui/display';
import { Button } from 'twenty-ui/input';
import { UndecoratedLink } from 'twenty-ui/navigation';
import { ThemeContext, themeCssVariables } from 'twenty-ui/theme-constants';
import { CalendarChannelVisibility } from '~/generated/graphql';

const MICROSOFT_CALENDAR_ENTITY_ACCESS_MODAL_ID =
  'microsoft-calendar-entity-access-modal';

const StyledCardsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledModalContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[6]};
`;

const StyledModalDescription = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  line-height: ${themeCssVariables.text.lineHeight.lg};
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

const StyledModalActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
`;

const StyledHint = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

export const SettingsAccountsListEmptyStateCard = () => {
  const { theme } = useContext(ThemeContext);
  const { triggerApisOAuth } = useTriggerApisOAuth();
  const { openModal, closeModal } = useModal();
  const [selectedInternalEntityIds, setSelectedInternalEntityIds] = useState<
    string[]
  >([]);
  const {
    manageableEventEntities,
    primaryEventEntityId,
    isReady: areManageableEntitiesReady,
  } = useManageableEventEntities();

  const { t } = useLingui();
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

  const isImapSmtpCaldavEnabled = useAtomStateValue(
    isImapSmtpCaldavEnabledState,
  );

  useEffect(() => {
    if (
      selectedInternalEntityIds.length === 0 &&
      areManageableEntitiesReady &&
      primaryEventEntityId
    ) {
      setSelectedInternalEntityIds([primaryEventEntityId]);
    }
  }, [
    areManageableEntitiesReady,
    primaryEventEntityId,
    selectedInternalEntityIds.length,
  ]);

  const triggerMicrosoftOAuth = (visibleInternalEntityIds?: string[]) => {
    triggerApisOAuth(ConnectedAccountProvider.MICROSOFT, {
      calendarVisibility: CalendarChannelVisibility.METADATA,
      visibleInternalEntityIds,
      skipMessageChannelConfiguration: true,
    });
  };

  const handleMicrosoftClick = () => {
    if (isMicrosoftCalendarEnabled) {
      openModal(MICROSOFT_CALENDAR_ENTITY_ACCESS_MODAL_ID);

      return;
    }

    triggerApisOAuth(ConnectedAccountProvider.MICROSOFT);
  };

  const handleToggleVisibleInternalEntity = (entityId: string) => {
    setSelectedInternalEntityIds((currentSelectedInternalEntityIds) => {
      if (currentSelectedInternalEntityIds.includes(entityId)) {
        return currentSelectedInternalEntityIds.filter(
          (selectedEntityId) => selectedEntityId !== entityId,
        );
      }

      return [...currentSelectedInternalEntityIds, entityId];
    });
  };

  const handleConfirmMicrosoftCalendarAccess = () => {
    closeModal(MICROSOFT_CALENDAR_ENTITY_ACCESS_MODAL_ID);
    triggerMicrosoftOAuth(selectedInternalEntityIds);
  };

  return (
    <StyledCardsContainer>
      {(isGoogleMessagingEnabled || isGoogleCalendarEnabled) && (
        <SettingsCard
          Icon={<IconGoogle size={theme.icon.size.md} />}
          title={t`Connect with Google`}
          onClick={() => triggerApisOAuth(ConnectedAccountProvider.GOOGLE)}
        />
      )}

      {(isMicrosoftMessagingEnabled || isMicrosoftCalendarEnabled) && (
        <SettingsCard
          Icon={<IconMicrosoft size={theme.icon.size.md} />}
          title={t`Connect with Microsoft`}
          onClick={handleMicrosoftClick}
        />
      )}

      {isImapSmtpCaldavEnabled && (
        <UndecoratedLink
          to={getSettingsPath(SettingsPath.NewImapSmtpCaldavConnection)}
        >
          <SettingsCard
            Icon={<IconAt size={theme.icon.size.md} />}
            title={t`Connect Account`}
          />
        </UndecoratedLink>
      )}
      <ModalStatefulWrapper
        modalInstanceId={MICROSOFT_CALENDAR_ENTITY_ACCESS_MODAL_ID}
        isClosable
        onClose={() => undefined}
        padding="large"
        renderInDocumentBody
        smallBorderRadius
        autoHeight
      >
        <StyledModalContent>
          <H1Title title={t`Calendar access`} />
          <StyledModalDescription>
            {t`Choose which internal entities can see the full details of this Outlook calendar.`}
          </StyledModalDescription>
          {!areManageableEntitiesReady ? (
            <StyledHint>{t`Loading entities...`}</StyledHint>
          ) : manageableEventEntities.length === 0 ? (
            <StyledHint>{t`No internal entity is available for your account.`}</StyledHint>
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
          <StyledModalActions>
            <Button
              title={t`Cancel`}
              variant="secondary"
              onClick={() =>
                closeModal(MICROSOFT_CALENDAR_ENTITY_ACCESS_MODAL_ID)
              }
            />
            <Button
              title={t`Connect`}
              onClick={handleConfirmMicrosoftCalendarAccess}
              disabled={
                !areManageableEntitiesReady ||
                selectedInternalEntityIds.length === 0
              }
            />
          </StyledModalActions>
        </StyledModalContent>
      </ModalStatefulWrapper>
    </StyledCardsContainer>
  );
};
