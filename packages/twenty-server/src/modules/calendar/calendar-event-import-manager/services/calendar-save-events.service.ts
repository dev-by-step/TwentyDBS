import { Injectable } from '@nestjs/common';

import { Any } from 'typeorm';
import { v4 as uuid } from 'uuid';

import { type CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { CalendarEventParticipantService } from 'src/modules/calendar/calendar-event-participant-manager/services/calendar-event-participant.service';
import { type CalendarChannelEventAssociationWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-channel-event-association.workspace-entity';
import { type CalendarEventWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-event.workspace-entity';
import { type FetchedCalendarEvent } from 'src/modules/calendar/common/types/fetched-calendar-event';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';

type FetchedCalendarEventWithDBEvent = {
  fetchedCalendarEvent: FetchedCalendarEvent;
  existingCalendarEvent: CalendarEventWorkspaceEntity | null;
  newlyCreatedCalendarEvent: CalendarEventWorkspaceEntity | null;
  matchKind: 'icalUid' | 'signature' | null;
};

const normalizeCalendarEventTitle = (title: string | null | undefined) =>
  (title ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

const getCalendarEventSignature = ({
  title,
  startsAt,
  endsAt,
  isFullDay,
}: {
  title: string | null | undefined;
  startsAt: string | null | undefined;
  endsAt: string | null | undefined;
  isFullDay: boolean;
}) => {
  const normalizedTitle = normalizeCalendarEventTitle(title);

  if (!normalizedTitle || !startsAt || !endsAt) {
    return null;
  }

  return `${normalizedTitle}|${startsAt}|${endsAt}|${isFullDay}`;
};

const isNonEmptyString = (value: string | null | undefined): value is string =>
  Boolean(value);

@Injectable()
export class CalendarSaveEventsService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly calendarEventParticipantService: CalendarEventParticipantService,
  ) {}

  public async saveCalendarEventsAndEnqueueContactCreationJob(
    fetchedCalendarEvents: FetchedCalendarEvent[],
    calendarChannel: CalendarChannelEntity,
    connectedAccount: ConnectedAccountEntity,
    workspaceId: string,
  ): Promise<void> {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const calendarEventRepository =
        await this.globalWorkspaceOrmManager.getRepository<CalendarEventWorkspaceEntity>(
          workspaceId,
          'calendarEvent',
        );

      const calendarChannelEventAssociationRepository =
        await this.globalWorkspaceOrmManager.getRepository<CalendarChannelEventAssociationWorkspaceEntity>(
          workspaceId,
          'calendarChannelEventAssociation',
        );

      const workspaceDataSource =
        await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();

      await workspaceDataSource.transaction(
        async (transactionManager: WorkspaceEntityManager) => {
          const fetchedICalUids = [
            ...new Set(
              fetchedCalendarEvents
                .map((event) => event.iCalUid)
                .filter(isNonEmptyString),
            ),
          ];
          const fetchedStartDates = [
            ...new Set(
              fetchedCalendarEvents
                .map((event) => event.startsAt)
                .filter(isNonEmptyString),
            ),
          ];
          const fetchedEndDates = [
            ...new Set(
              fetchedCalendarEvents
                .map((event) => event.endsAt)
                .filter(isNonEmptyString),
            ),
          ];

          const existingCalendarEventsByICalUid =
            fetchedICalUids.length > 0
              ? await calendarEventRepository.find(
                  {
                    where: {
                      iCalUid: Any(fetchedICalUids),
                    },
                  },
                  transactionManager,
                )
              : [];

          const existingCalendarEventsByTimeSignature =
            fetchedStartDates.length > 0 && fetchedEndDates.length > 0
              ? await calendarEventRepository.find(
                  {
                    where: {
                      startsAt: Any(fetchedStartDates),
                      endsAt: Any(fetchedEndDates),
                    },
                  },
                  transactionManager,
                )
              : [];

          const existingCalendarEvents = [
            ...existingCalendarEventsByICalUid,
            ...existingCalendarEventsByTimeSignature,
          ].filter(
            (event, index, events) =>
              events.findIndex(({ id }) => id === event.id) === index,
          );
          const existingCalendarEventBySignature = new Map(
            existingCalendarEvents
              .map((event) => [getCalendarEventSignature(event), event] as const)
              .filter(
                (
                  entry,
                ): entry is readonly [string, CalendarEventWorkspaceEntity] =>
                  entry[0] !== null,
              ),
          );

          const fetchedCalendarEventsWithDBEvents: FetchedCalendarEventWithDBEvent[] =
            fetchedCalendarEvents.map(
              (event): FetchedCalendarEventWithDBEvent => {
                const existingEventWithSameiCalUid =
                  existingCalendarEvents.find(
                    (existingEvent) =>
                      event.iCalUid && existingEvent.iCalUid === event.iCalUid,
                  );
                const existingEventWithSameSignature =
                  existingCalendarEventBySignature.get(
                    getCalendarEventSignature(event) ?? '',
                  );
                const existingCalendarEvent =
                  existingEventWithSameiCalUid ??
                  existingEventWithSameSignature ??
                  null;

                return {
                  fetchedCalendarEvent: event,
                  existingCalendarEvent,
                  newlyCreatedCalendarEvent: null,
                  matchKind: existingEventWithSameiCalUid
                    ? 'icalUid'
                    : existingEventWithSameSignature
                      ? 'signature'
                      : null,
                };
              },
            );

          const newCalendarEventsToInsertWithFetched =
            fetchedCalendarEventsWithDBEvents
              .filter(
                ({ existingCalendarEvent }) => existingCalendarEvent === null,
              )
              .map(({ fetchedCalendarEvent }) => ({
                fetchedCalendarEvent,
                calendarEventToInsert: {
                  id: uuid(),
                  iCalUid: fetchedCalendarEvent.iCalUid,
                  title: fetchedCalendarEvent.title,
                  description: fetchedCalendarEvent.description,
                  startsAt: fetchedCalendarEvent.startsAt,
                  endsAt: fetchedCalendarEvent.endsAt,
                  location: fetchedCalendarEvent.location,
                  isFullDay: fetchedCalendarEvent.isFullDay,
                  isCanceled: fetchedCalendarEvent.isCanceled,
                  conferenceSolution: fetchedCalendarEvent.conferenceSolution,
                  conferenceLink: {
                    primaryLinkLabel: fetchedCalendarEvent.conferenceLinkLabel,
                    primaryLinkUrl: fetchedCalendarEvent.conferenceLinkUrl,
                    secondaryLinks: [],
                  },
                  externalCreatedAt: fetchedCalendarEvent.externalCreatedAt,
                  externalUpdatedAt: fetchedCalendarEvent.externalUpdatedAt,
                },
              }));
          const newCalendarEventsToInsert =
            newCalendarEventsToInsertWithFetched.map(
              ({ calendarEventToInsert }) => calendarEventToInsert,
            );

          if (newCalendarEventsToInsert.length > 0) {
            await calendarEventRepository.insert(
              newCalendarEventsToInsert,
              transactionManager,
            );
          }

          const fetchedCalendarEventsWithDBEventsEnrichedWithSavedEvents: FetchedCalendarEventWithDBEvent[] =
            fetchedCalendarEventsWithDBEvents.map(
              ({ fetchedCalendarEvent, existingCalendarEvent, matchKind }) => {
                const savedCalendarEvent =
                  newCalendarEventsToInsertWithFetched.find(
                    (inserted) =>
                      inserted.fetchedCalendarEvent === fetchedCalendarEvent,
                  )?.calendarEventToInsert;

                return {
                  fetchedCalendarEvent,
                  existingCalendarEvent: existingCalendarEvent,
                  newlyCreatedCalendarEvent: savedCalendarEvent
                    ? ({
                        id: savedCalendarEvent.id,
                        iCalUid: savedCalendarEvent.iCalUid,
                      } as CalendarEventWorkspaceEntity)
                    : null,
                  matchKind,
                };
              },
            );

          const existingEventsToUpdate =
            fetchedCalendarEventsWithDBEventsEnrichedWithSavedEvents
              .filter(
                ({ existingCalendarEvent, matchKind }) =>
                  existingCalendarEvent !== null && matchKind === 'icalUid',
              )
              .map(({ fetchedCalendarEvent, existingCalendarEvent }) => {
                if (!existingCalendarEvent) {
                  throw new Error(
                    `Existing calendar event with iCalUid ${fetchedCalendarEvent.iCalUid} not found - should never happen`,
                  );
                }

                return {
                  criteria: existingCalendarEvent.id,
                  partialEntity: {
                    iCalUid: fetchedCalendarEvent.iCalUid,
                    title: fetchedCalendarEvent.title,
                    description: fetchedCalendarEvent.description,
                    startsAt: fetchedCalendarEvent.startsAt,
                    endsAt: fetchedCalendarEvent.endsAt,
                    location: fetchedCalendarEvent.location,
                    isFullDay: fetchedCalendarEvent.isFullDay,
                    isCanceled: fetchedCalendarEvent.isCanceled,
                    conferenceSolution: fetchedCalendarEvent.conferenceSolution,
                    conferenceLink: {
                      primaryLinkLabel:
                        fetchedCalendarEvent.conferenceLinkLabel,
                      primaryLinkUrl: fetchedCalendarEvent.conferenceLinkUrl,
                      secondaryLinks: [],
                    },
                    externalCreatedAt: fetchedCalendarEvent.externalCreatedAt,
                    externalUpdatedAt: fetchedCalendarEvent.externalUpdatedAt,
                  },
                };
              });

          if (existingEventsToUpdate.length > 0) {
            await calendarEventRepository.updateMany(
              existingEventsToUpdate,
              transactionManager,
            );
          }

          const calendarEventIds =
            fetchedCalendarEventsWithDBEventsEnrichedWithSavedEvents
              .map(
                ({ existingCalendarEvent, newlyCreatedCalendarEvent }) =>
                  existingCalendarEvent?.id ?? newlyCreatedCalendarEvent?.id,
              )
              .filter(isNonEmptyString);
          const existingCalendarChannelEventAssociations =
            calendarEventIds.length > 0
              ? await calendarChannelEventAssociationRepository.find(
                  {
                    where: {
                      calendarChannelId: calendarChannel.id,
                      calendarEventId: Any(calendarEventIds),
                    },
                  },
                  transactionManager,
                )
              : [];

          const calendarChannelEventAssociationsToSave: Pick<
            CalendarChannelEventAssociationWorkspaceEntity,
            | 'calendarEventId'
            | 'eventExternalId'
            | 'calendarChannelId'
            | 'recurringEventExternalId'
          >[] = fetchedCalendarEventsWithDBEventsEnrichedWithSavedEvents.flatMap(
            ({
              fetchedCalendarEvent,
              existingCalendarEvent,
              newlyCreatedCalendarEvent,
            }) => {
              const calendarEventId =
                existingCalendarEvent?.id ?? newlyCreatedCalendarEvent?.id;

              if (!calendarEventId) {
                throw new Error(
                  `Calendar event id not found for event with iCalUid ${fetchedCalendarEvent.iCalUid} - should never happen`,
                );
              }

              const existingAssociation =
                existingCalendarChannelEventAssociations.find(
                  (association) =>
                    association.calendarEventId === calendarEventId ||
                    association.eventExternalId === fetchedCalendarEvent.id,
                );

              if (existingAssociation) {
                return [];
              }

              return [
                {
                  calendarEventId,
                  eventExternalId: fetchedCalendarEvent.id,
                  calendarChannelId: calendarChannel.id,
                  recurringEventExternalId:
                    fetchedCalendarEvent.recurringEventExternalId ?? '',
                },
              ];
            },
          );

          if (calendarChannelEventAssociationsToSave.length > 0) {
            await calendarChannelEventAssociationRepository.insert(
              calendarChannelEventAssociationsToSave,
              transactionManager,
            );
          }

          const participantsToCreate =
            fetchedCalendarEventsWithDBEventsEnrichedWithSavedEvents
              .filter(
                ({ newlyCreatedCalendarEvent }) =>
                  newlyCreatedCalendarEvent !== null,
              )
              .flatMap(
                ({ newlyCreatedCalendarEvent, fetchedCalendarEvent }) => {
                  if (!newlyCreatedCalendarEvent?.id) {
                    throw new Error(
                      `Newly created calendar event with iCalUid ${fetchedCalendarEvent.iCalUid} not found - should never happen`,
                    );
                  }

                  return fetchedCalendarEvent.participants.map(
                    (participant) => ({
                      ...participant,
                      calendarEventId: newlyCreatedCalendarEvent.id,
                    }),
                  );
                },
              );

          // todo: we should prevent duplicate rows on calendarEventAssociation by creating
          // an index on calendarChannelId and calendarEventId
          const participantsToUpdate =
            fetchedCalendarEventsWithDBEventsEnrichedWithSavedEvents
              .filter(
                ({ existingCalendarEvent, matchKind }) =>
                  existingCalendarEvent !== null && matchKind === 'icalUid',
              )
              .flatMap(({ fetchedCalendarEvent, existingCalendarEvent }) => {
                if (!existingCalendarEvent?.id) {
                  throw new Error(
                    `Existing calendar event with iCalUid ${fetchedCalendarEvent.iCalUid} not found - should never happen`,
                  );
                }

                return fetchedCalendarEvent.participants.map((participant) => ({
                  ...participant,
                  calendarEventId: existingCalendarEvent.id,
                }));
              });

          await this.calendarEventParticipantService.upsertAndDeleteCalendarEventParticipants(
            {
              participantsToCreate,
              participantsToUpdate,
              transactionManager,
              calendarChannel,
              connectedAccount,
              workspaceId,
            },
          );
        },
      );
    }, authContext);
  }
}
