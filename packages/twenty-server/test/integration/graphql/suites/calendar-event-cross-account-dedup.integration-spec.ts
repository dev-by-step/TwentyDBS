import { randomUUID } from 'crypto';

import { getRepositoryToken } from '@nestjs/typeorm';

import gql from 'graphql-tag';
import { type Repository } from 'typeorm';

import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { CALENDAR_CHANNEL_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/calendar-channel-data-seeds.constant';
import { CONNECTED_ACCOUNT_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/connected-account-data-seeds.constant';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';
import { type CalendarSaveEventsService } from 'src/modules/calendar/calendar-event-import-manager/services/calendar-save-events.service';
import { type CalendarPrivacyService } from 'src/modules/calendar/common/services/calendar-privacy.service';
import { type FetchedCalendarEvent } from 'src/modules/calendar/common/types/fetched-calendar-event';
import { INTERNAL_ENTITY_SEEDS } from 'src/modules/internal-entity/constants/internal-entity-seeds.constant';

import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';
import { runInitInternalEntities } from 'test/integration/utils/run-init-internal-entities.util';

/**
 * FIX-41 follow-up (docs/AUDIT-BACKLOG.md): when two workspace members from
 * different internal entities each sync their own calendar and both attend
 * the same real-world meeting, does the fork end up with one merged event
 * (correct) or two duplicated, entity-siloed events (data integrity bug)?
 *
 * This exercises the two services actually involved end-to-end against the
 * real workspace datasource — not mocks:
 *  - CalendarSaveEventsService (upstream Twenty): matches incoming events by
 *    `iCalUid` across ALL connected accounts in the workspace, so a shared
 *    meeting synced from two different calendars collapses into a single
 *    `calendarEvent` row with one `calendarChannelEventAssociation` per
 *    channel — never a duplicate `calendarEvent`.
 *  - CalendarPrivacyService (fork-specific): the entity-isolation masking
 *    layer must still make that merged event visible to BOTH owners' entity
 *    colleagues (not just the first channel synced), while continuing to
 *    mask it for a workspace member outside both entities.
 *
 * Reuses the JANE (Stéphane, ANGLE_INTELLIGENCE) and PHIL (Louis@allsensia,
 * ALLSENSIA-only) seeded dev users/connected accounts/calendar channels —
 * the same two-different-entities pair already established by
 * internal-entity-isolation.integration-spec.ts.
 */

// CalendarSaveEventsService/CalendarPrivacyService are internal providers of
// their feature modules (never exported — nothing outside calendar
// sync/privacy needs them directly), so `app.get()` can't reach them: it
// only resolves what a module exports. The normal fix, `app.select(Module)`,
// needs the module *class* imported as a value — but importing
// calendar-event-import-manager.module.ts drags in its whole transitive
// import graph (down to an unrelated `.mjs` file jest's transform can't
// parse) just to read a type.
//
// Looking the module up by name sidesteps that, but the provider itself must
// ALSO be matched by name rather than by class reference: globalSetup boots
// the app through a separate loader (`--import tsx/esm`) from the one this
// spec file is compiled with (`@swc/jest`), so the two produce distinct
// class objects for the same source file. `moduleWrapper.providers.get(SomeClassImportedHere)`
// would silently miss (different object identity) even though the provider
// is really there — matching by `.name` avoids relying on identity across
// those two realms, while the returned `.instance` is the app's real,
// fully-wired singleton and works exactly like any other object at runtime.
const getInternalProvider = <T>(
  moduleName: string,
  providerName: string,
): T => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modules: Map<string, any> = (global.app as any).container.getModules();
  const moduleWrapper = [...modules.values()].find(
    (module) => module.metatype?.name === moduleName,
  );

  if (!moduleWrapper) {
    throw new Error(
      `Module "${moduleName}" was not found in the compiled test app graph`,
    );
  }

  const providerEntry = [...moduleWrapper.providers.entries()].find(
    ([token]) =>
      (typeof token === 'function' ? token.name : String(token)) ===
      providerName,
  );

  if (!providerEntry) {
    throw new Error(
      `Provider "${providerName}" was not found on module "${moduleName}"`,
    );
  }

  const [, providerWrapper] = providerEntry;

  return providerWrapper.instance as T;
};

const CURRENT_USER_ENTITY_ID_QUERY = gql`
  query CurrentUserEntityIdForCalendarDedupTest {
    currentUser {
      id
      entityId
    }
  }
`;

const getCurrentUserEntityId = async (token: string): Promise<string> => {
  const response = await makeMetadataAPIRequest(
    { query: CURRENT_USER_ENTITY_ID_QUERY },
    token,
  );

  expect(response.body.errors).toBeUndefined();

  const entityId = response.body.data.currentUser.entityId as
    | string
    | null
    | undefined;

  expect(entityId).toBeDefined();

  return entityId as string;
};

const GET_GROUP_TIMELINE_CALENDAR_EVENTS_FOR_ENTITY_FILTER_TEST_QUERY = gql`
  query GetGroupTimelineCalendarEventsForEntityFilterTest(
    $page: Int!
    $pageSize: Int!
    $startDate: DateTime
    $endDate: DateTime
    $entityFilterId: UUID
  ) {
    getGroupTimelineCalendarEvents(
      page: $page
      pageSize: $pageSize
      startDate: $startDate
      endDate: $endDate
      entityFilterId: $entityFilterId
    ) {
      totalNumberOfCalendarEvents
      timelineCalendarEvents {
        id
      }
    }
  }
`;

const TEST_SCHEMA_NAME = 'workspace_1wgvd1injqtife6y4rvfbu3h5';

const buildFetchedCalendarEvent = (
  overrides: Pick<FetchedCalendarEvent, 'id' | 'iCalUid'> &
    Partial<FetchedCalendarEvent>,
): FetchedCalendarEvent => ({
  title: 'Comité de pilotage inter-sociétés',
  description: 'Point mensuel entre WEKNOW et ALLSENSIA',
  startsAt: '2031-03-10T10:00:00.000Z',
  endsAt: '2031-03-10T11:00:00.000Z',
  location: '',
  isFullDay: false,
  isCanceled: false,
  conferenceLinkLabel: '',
  conferenceLinkUrl: '',
  externalCreatedAt: '2031-03-01T09:00:00.000Z',
  externalUpdatedAt: '2031-03-01T09:00:00.000Z',
  conferenceSolution: '',
  recurringEventExternalId: '',
  participants: [],
  status: 'confirmed',
  ...overrides,
});

describe('calendar event cross-account dedup + multi-entity privacy (integration)', () => {
  let calendarSaveEventsService: CalendarSaveEventsService;
  let calendarPrivacyService: CalendarPrivacyService;
  let calendarChannelRepository: Repository<CalendarChannelEntity>;
  let connectedAccountRepository: Repository<ConnectedAccountEntity>;

  let janeCalendarChannel: CalendarChannelEntity;
  let philCalendarChannel: CalendarChannelEntity;
  let janeConnectedAccount: ConnectedAccountEntity;
  let philConnectedAccount: ConnectedAccountEntity;

  let janeEntityId: string;
  let philEntityId: string;

  const sharedICalUid = `integration-test-shared-meeting-${randomUUID()}@twenty-dbs.dev`;

  let mergedCalendarEventId: string;

  beforeAll(async () => {
    // Ensures the InternalEntity metadata/seeds/memberships exist. Idempotent.
    runInitInternalEntities();

    calendarSaveEventsService = getInternalProvider<CalendarSaveEventsService>(
      'CalendarEventImportManagerModule',
      'CalendarSaveEventsService',
    );
    calendarPrivacyService = getInternalProvider<CalendarPrivacyService>(
      'CalendarCommonModule',
      'CalendarPrivacyService',
    );
    calendarChannelRepository = global.app.get(
      getRepositoryToken(CalendarChannelEntity),
    );
    connectedAccountRepository = global.app.get(
      getRepositoryToken(ConnectedAccountEntity),
    );

    [
      janeCalendarChannel,
      philCalendarChannel,
      janeConnectedAccount,
      philConnectedAccount,
      janeEntityId,
      philEntityId,
    ] = await Promise.all([
      calendarChannelRepository.findOneByOrFail({
        id: CALENDAR_CHANNEL_DATA_SEED_IDS.JANE,
      }),
      calendarChannelRepository.findOneByOrFail({
        id: CALENDAR_CHANNEL_DATA_SEED_IDS.PHIL,
      }),
      connectedAccountRepository.findOneByOrFail({
        id: CONNECTED_ACCOUNT_DATA_SEED_IDS.JANE,
      }),
      connectedAccountRepository.findOneByOrFail({
        id: CONNECTED_ACCOUNT_DATA_SEED_IDS.PHIL,
      }),
      getCurrentUserEntityId(APPLE_JANE_ADMIN_ACCESS_TOKEN),
      getCurrentUserEntityId(APPLE_PHIL_GUEST_ACCESS_TOKEN),
    ]);

    expect(janeEntityId).not.toEqual(philEntityId);
  }, 60000);

  afterAll(async () => {
    if (mergedCalendarEventId) {
      await global.testDataSource.query(
        `DELETE FROM "${TEST_SCHEMA_NAME}"."calendarChannelEventAssociation" WHERE "calendarEventId" = $1`,
        [mergedCalendarEventId],
      );
      await global.testDataSource.query(
        `DELETE FROM "${TEST_SCHEMA_NAME}"."calendarEvent" WHERE id = $1`,
        [mergedCalendarEventId],
      );
    }
  });

  it('merges a shared meeting synced from two different connected accounts into a single calendarEvent, with one association per channel', async () => {
    const janeFetchedEvent = buildFetchedCalendarEvent({
      id: `google-event-jane-${randomUUID()}`,
      iCalUid: sharedICalUid,
    });
    const philFetchedEvent = buildFetchedCalendarEvent({
      id: `google-event-phil-${randomUUID()}`,
      iCalUid: sharedICalUid,
      // A real second calendar API response is rarely byte-identical
      // (e.g. per-attendee description) — the match must still key on
      // iCalUid, not full-payload equality.
      description: 'Réunion mensuelle - vue côté ALLSENSIA',
    });

    await calendarSaveEventsService.saveCalendarEventsAndEnqueueContactCreationJob(
      [janeFetchedEvent],
      janeCalendarChannel,
      janeConnectedAccount,
      SEED_APPLE_WORKSPACE_ID,
    );

    await calendarSaveEventsService.saveCalendarEventsAndEnqueueContactCreationJob(
      [philFetchedEvent],
      philCalendarChannel,
      philConnectedAccount,
      SEED_APPLE_WORKSPACE_ID,
    );

    const matchingCalendarEvents = await global.testDataSource.query(
      `SELECT id, "sharingScope" FROM "${TEST_SCHEMA_NAME}"."calendarEvent" WHERE "iCalUid" = $1`,
      [sharedICalUid],
    );

    expect(matchingCalendarEvents).toHaveLength(1);
    mergedCalendarEventId = matchingCalendarEvents[0].id as string;
    // New synced events default to ENTITY_ONLY (see docs/AUDIT-BACKLOG.md
    // FIX-39/FIX-40) — this matters below: if it were WORKSPACE_PUBLIC the
    // masking assertions would trivially pass regardless of the union logic.
    expect(matchingCalendarEvents[0].sharingScope).toEqual('ENTITY_ONLY');

    const associations = await global.testDataSource.query(
      `SELECT "calendarChannelId" FROM "${TEST_SCHEMA_NAME}"."calendarChannelEventAssociation" WHERE "calendarEventId" = $1`,
      [mergedCalendarEventId],
    );

    expect(
      (associations as Array<{ calendarChannelId: string }>)
        .map((association) => association.calendarChannelId)
        .sort(),
    ).toEqual(
      [janeCalendarChannel.id, philCalendarChannel.id].sort((a, b) =>
        a.localeCompare(b),
      ),
    );
  });

  describe('privacy union across both channels of the merged event', () => {
    it('never masks the event for either connected-account owner (FIX-10)', async () => {
      const maskMapForJane =
        await calendarPrivacyService.getCalendarEventMaskMap({
          calendarEventIds: [mergedCalendarEventId],
          workspaceId: SEED_APPLE_WORKSPACE_ID,
          currentWorkspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.JANE,
        });
      const maskMapForPhil =
        await calendarPrivacyService.getCalendarEventMaskMap({
          calendarEventIds: [mergedCalendarEventId],
          workspaceId: SEED_APPLE_WORKSPACE_ID,
          currentWorkspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.PHIL,
        });

      expect(maskMapForJane.get(mergedCalendarEventId)).toBe(false);
      expect(maskMapForPhil.get(mergedCalendarEventId)).toBe(false);
    });

    it("unmasks the event for a non-owner colleague of the FIRST synced channel's entity", async () => {
      const maskMap = await calendarPrivacyService.getCalendarEventMaskMap({
        calendarEventIds: [mergedCalendarEventId],
        workspaceId: SEED_APPLE_WORKSPACE_ID,
        currentUserEntityId: janeEntityId,
      });

      expect(maskMap.get(mergedCalendarEventId)).toBe(false);
    });

    it("unmasks the event for a non-owner colleague of the SECOND synced channel's entity — proves the owner-entity rule unions across every channel of the merged event, not just the first one synced", async () => {
      const maskMap = await calendarPrivacyService.getCalendarEventMaskMap({
        calendarEventIds: [mergedCalendarEventId],
        workspaceId: SEED_APPLE_WORKSPACE_ID,
        currentUserEntityId: philEntityId,
      });

      expect(maskMap.get(mergedCalendarEventId)).toBe(false);
    });

    it('still masks the event for a workspace member outside both owners entities — the merge does not leak visibility to unrelated entities', async () => {
      const outsiderEntityId = Object.values(INTERNAL_ENTITY_SEEDS)
        .map((entity) => entity.id)
        .find((id) => id !== janeEntityId && id !== philEntityId);

      expect(outsiderEntityId).toBeDefined();

      const maskMap = await calendarPrivacyService.getCalendarEventMaskMap({
        calendarEventIds: [mergedCalendarEventId],
        workspaceId: SEED_APPLE_WORKSPACE_ID,
        currentUserEntityId: outsiderEntityId,
      });

      expect(maskMap.get(mergedCalendarEventId)).toBe(true);
    });
  });

  // IMP (docs/AUDIT-BACKLOG.md) : filtre « voir uniquement l'entité X » du
  // Calendrier Groupe — contrairement au masquage ci-dessus, un événement
  // hors filtre doit disparaître complètement du résultat, pas seulement
  // afficher « Occupé ». Choix produit assumé : ce mode explicite réintroduit
  // sciemment le risque de double réservation invisible que FIX-40 a corrigé
  // pour la vue par défaut (sans filtre).
  describe('entity filter — excludes irrelevant events instead of masking them', () => {
    it('getEntityRelevantCalendarEventIds includes the merged event for either owner entity, excludes it for an unrelated one', async () => {
      const outsiderEntityId = Object.values(INTERNAL_ENTITY_SEEDS)
        .map((entity) => entity.id)
        .find((id) => id !== janeEntityId && id !== philEntityId);

      expect(outsiderEntityId).toBeDefined();

      const [relevantForJane, relevantForPhil, relevantForOutsider] =
        await Promise.all([
          calendarPrivacyService.getEntityRelevantCalendarEventIds({
            calendarEventIds: [mergedCalendarEventId],
            workspaceId: SEED_APPLE_WORKSPACE_ID,
            entityId: janeEntityId,
          }),
          calendarPrivacyService.getEntityRelevantCalendarEventIds({
            calendarEventIds: [mergedCalendarEventId],
            workspaceId: SEED_APPLE_WORKSPACE_ID,
            entityId: philEntityId,
          }),
          calendarPrivacyService.getEntityRelevantCalendarEventIds({
            calendarEventIds: [mergedCalendarEventId],
            workspaceId: SEED_APPLE_WORKSPACE_ID,
            entityId: outsiderEntityId as string,
          }),
        ]);

      expect(relevantForJane.has(mergedCalendarEventId)).toBe(true);
      expect(relevantForPhil.has(mergedCalendarEventId)).toBe(true);
      expect(relevantForOutsider.has(mergedCalendarEventId)).toBe(false);
    });

    // Bout-en-bout via le vrai endpoint GraphQL (pas seulement le service de
    // privacy) : Jony (admin, membre des 4 entités, mais n'a jamais synchronisé
    // cet événement) interroge le calendrier groupe filtré tour à tour sur
    // l'entité de Jane (ANGLE_INTELLIGENCE) puis celle de Phil (ALLSENSIA).
    // Utiliser Jony plutôt que Jane/Phil élimine le bypass propriétaire
    // (FIX-10) de l'équation — ce test exerce bien la pertinence par entité
    // à travers resolver -> service -> privacy service en conditions réelles,
    // pas le raccourci « c'est mon propre événement ».
    it.each([
      ['Jane', () => janeEntityId],
      ['Phil', () => philEntityId],
    ])(
      "getGroupTimelineCalendarEvents returns the merged event when entityFilterId matches %s's entity",
      async (_label, getEntityId) => {
        const response = await makeGraphqlAPIRequest(
          {
            query:
              GET_GROUP_TIMELINE_CALENDAR_EVENTS_FOR_ENTITY_FILTER_TEST_QUERY,
            variables: {
              page: 1,
              pageSize: 50,
              startDate: '2031-03-01T00:00:00.000Z',
              endDate: '2031-03-31T00:00:00.000Z',
              entityFilterId: getEntityId(),
            },
          },
          APPLE_JONY_MEMBER_ACCESS_TOKEN,
        );

        expect(response.body.errors).toBeUndefined();

        const returnedIds =
          response.body.data.getGroupTimelineCalendarEvents.timelineCalendarEvents.map(
            (event: { id: string }) => event.id,
          );

        expect(returnedIds).toContain(mergedCalendarEventId);
      },
    );

    it('getGroupTimelineCalendarEvents excludes the merged event when entityFilterId matches neither owner entity', async () => {
      const outsiderEntityId = Object.values(INTERNAL_ENTITY_SEEDS)
        .map((entity) => entity.id)
        .find((id) => id !== janeEntityId && id !== philEntityId);

      expect(outsiderEntityId).toBeDefined();

      // Jony (admin) queries here, not Jane/Phil: they each own the merged
      // event via their own synced channel, so the viewer-owner bypass
      // (FIX-10, extended to the entity filter) would keep it visible to
      // them regardless of entityFilterId — a separately, deliberately
      // tested guarantee (see the getEntityRelevantCalendarEventIds unit
      // test above). Jony never synced this event, so this exercises the
      // actual entity-relevance check, not the owner bypass.
      const response = await makeGraphqlAPIRequest(
        {
          query:
            GET_GROUP_TIMELINE_CALENDAR_EVENTS_FOR_ENTITY_FILTER_TEST_QUERY,
          variables: {
            page: 1,
            pageSize: 50,
            startDate: '2031-03-01T00:00:00.000Z',
            endDate: '2031-03-31T00:00:00.000Z',
            entityFilterId: outsiderEntityId,
          },
        },
        APPLE_JONY_MEMBER_ACCESS_TOKEN,
      );

      expect(response.body.errors).toBeUndefined();

      const returnedIds =
        response.body.data.getGroupTimelineCalendarEvents.timelineCalendarEvents.map(
          (event: { id: string }) => event.id,
        );

      expect(returnedIds).not.toContain(mergedCalendarEventId);
    });

    it('getGroupTimelineCalendarEvents returns the merged event unfiltered when entityFilterId is omitted (default behavior unchanged)', async () => {
      const response = await makeGraphqlAPIRequest(
        {
          query:
            GET_GROUP_TIMELINE_CALENDAR_EVENTS_FOR_ENTITY_FILTER_TEST_QUERY,
          variables: {
            page: 1,
            pageSize: 50,
            startDate: '2031-03-01T00:00:00.000Z',
            endDate: '2031-03-31T00:00:00.000Z',
          },
        },
        APPLE_JANE_ADMIN_ACCESS_TOKEN,
      );

      expect(response.body.errors).toBeUndefined();

      const returnedIds =
        response.body.data.getGroupTimelineCalendarEvents.timelineCalendarEvents.map(
          (event: { id: string }) => event.id,
        );

      expect(returnedIds).toContain(mergedCalendarEventId);
    });
  });
});
