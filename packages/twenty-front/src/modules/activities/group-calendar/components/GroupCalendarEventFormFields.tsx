import { type ReactNode } from 'react';
import { t } from '@lingui/core/macro';

import { GroupCalendarAudienceSection } from '@/activities/group-calendar/components/GroupCalendarAudienceSection';
import {
  StyledField,
  StyledInput,
} from '@/activities/group-calendar/components/GroupCalendarEventDialogStyles';
import { GroupCalendarEventEntitiesPicker } from '@/activities/group-calendar/components/GroupCalendarEventEntitiesPicker';
import { type ManageableEventEntity } from '@/activities/group-calendar/hooks/useManageableEventEntities';
import { type GroupCalendarEventFormState } from '@/activities/group-calendar/utils/groupCalendarFormUtils';

export {
  type GroupCalendarEventFormState,
  formatDateTimeInputValue,
} from '@/activities/group-calendar/utils/groupCalendarFormUtils';

type GroupCalendarEventFormFieldsProps = {
  state: GroupCalendarEventFormState;
  onPatchState: (patch: Partial<GroupCalendarEventFormState>) => void;
  isAudienceFeatureAvailable: boolean;
  isPersonAudienceFeatureAvailable: boolean;
  manageableEventEntities: readonly ManageableEventEntity[];
  eventEntitiesEmptyHint?: string;
  afterTitleField?: ReactNode;
  autoFocus?: boolean;
};

export const GroupCalendarEventFormFields = ({
  state,
  onPatchState,
  isAudienceFeatureAvailable,
  isPersonAudienceFeatureAvailable,
  manageableEventEntities,
  eventEntitiesEmptyHint,
  afterTitleField,
  autoFocus = true,
}: GroupCalendarEventFormFieldsProps) => {
  const toggleEventEntity = (entityId: string) => {
    onPatchState({
      eventEntityIds: state.eventEntityIds.includes(entityId)
        ? state.eventEntityIds.filter((id) => id !== entityId)
        : [...state.eventEntityIds, entityId],
    });
  };

  const toggleAudienceEntity = (entityId: string) => {
    onPatchState({
      selectedAudienceEntityIds: state.selectedAudienceEntityIds.includes(
        entityId,
      )
        ? state.selectedAudienceEntityIds.filter((id) => id !== entityId)
        : [...state.selectedAudienceEntityIds, entityId],
    });
  };

  const toggleAudienceMember = (workspaceMemberId: string) => {
    onPatchState({
      selectedAudienceMemberIds: state.selectedAudienceMemberIds.includes(
        workspaceMemberId,
      )
        ? state.selectedAudienceMemberIds.filter(
            (id) => id !== workspaceMemberId,
          )
        : [...state.selectedAudienceMemberIds, workspaceMemberId],
    });
  };

  return (
    <>
      <StyledField>
        {t`Title`}
        <StyledInput
          autoFocus={autoFocus}
          value={state.title}
          onChange={(event) => onPatchState({ title: event.target.value })}
          required
        />
      </StyledField>
      {afterTitleField}
      <GroupCalendarEventEntitiesPicker
        manageableEventEntities={manageableEventEntities}
        selectedEventEntityIds={state.eventEntityIds}
        onToggleEventEntity={toggleEventEntity}
        emptyHint={eventEntitiesEmptyHint}
      />
      <StyledField>
        {t`Starts at`}
        <StyledInput
          type="datetime-local"
          value={state.startsAt}
          onChange={(event) => onPatchState({ startsAt: event.target.value })}
          required
        />
      </StyledField>
      <StyledField>
        {t`Ends at`}
        <StyledInput
          type="datetime-local"
          value={state.endsAt}
          onChange={(event) => onPatchState({ endsAt: event.target.value })}
          required
        />
      </StyledField>
      {isAudienceFeatureAvailable && (
        <GroupCalendarAudienceSection
          audienceMode={state.audienceMode}
          selectedAudienceEntityIds={state.selectedAudienceEntityIds}
          selectedAudienceMemberIds={state.selectedAudienceMemberIds}
          isPersonAudienceFeatureAvailable={isPersonAudienceFeatureAvailable}
          eventEntityIds={state.eventEntityIds}
          onAudienceModeChange={(audienceMode) =>
            onPatchState({ audienceMode })
          }
          onToggleAudienceEntity={toggleAudienceEntity}
          onToggleAudienceMember={toggleAudienceMember}
        />
      )}
    </>
  );
};
