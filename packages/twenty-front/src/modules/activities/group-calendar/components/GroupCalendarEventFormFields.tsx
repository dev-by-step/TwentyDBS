import { type ReactNode } from 'react';
import { t } from '@lingui/core/macro';

import { GroupCalendarAudienceSection } from '@/activities/group-calendar/components/GroupCalendarAudienceSection';
import { GroupCalendarEventEntitiesPicker } from '@/activities/group-calendar/components/GroupCalendarEventEntitiesPicker';
import { type ManageableEventEntity } from '@/activities/group-calendar/hooks/useManageableEventEntities';
import { type GroupCalendarEventFormState } from '@/activities/group-calendar/utils/groupCalendarFormUtils';
import { TextInput } from '@/ui/input/components/TextInput';

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
      <TextInput
        label={t`Title`}
        placeholder={t`Event title`}
        dataTestId="group-calendar-event-title-input"
        autoFocus={autoFocus}
        value={state.title}
        onChange={(value) => onPatchState({ title: value })}
        required
        fullWidth
      />
      {afterTitleField}
      <GroupCalendarEventEntitiesPicker
        manageableEventEntities={manageableEventEntities}
        selectedEventEntityIds={state.eventEntityIds}
        onToggleEventEntity={toggleEventEntity}
        emptyHint={eventEntitiesEmptyHint}
      />
      <TextInput
        label={t`Starts at`}
        type="datetime-local"
        value={state.startsAt}
        onChange={(value) => onPatchState({ startsAt: value })}
        required
        fullWidth
      />
      <TextInput
        label={t`Ends at`}
        type="datetime-local"
        value={state.endsAt}
        onChange={(value) => onPatchState({ endsAt: value })}
        required
        fullWidth
      />
      {isAudienceFeatureAvailable && (
        <GroupCalendarAudienceSection
          audienceMode={state.audienceMode}
          selectedAudienceEntityIds={state.selectedAudienceEntityIds}
          selectedAudienceMemberIds={state.selectedAudienceMemberIds}
          audienceEntities={manageableEventEntities}
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
