import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { addDays, endOfMonth, startOfMonth, startOfWeek } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';
import { Between, In, Not, type Repository } from 'typeorm';

import { CalendarChannelVisibility } from 'twenty-shared/types';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  getPrimaryDevWorkspaceUserDisplayName,
  PRIMARY_DEV_WORKSPACE_USERS,
} from 'src/engine/workspace-manager/dev-seeder/core/constants/primary-dev-workspace-data.constant';
import { CALENDAR_CHANNEL_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/calendar-channel-data-seeds.constant';
import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';
import { USER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/core/utils/seed-users.util';
import { INTERNAL_ENTITY_SEEDS } from 'src/modules/internal-entity/constants/internal-entity-seeds.constant';
import { type CalendarChannelEventAssociationWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-channel-event-association.workspace-entity';
import {
  CalendarEventParticipantResponseStatus,
  type CalendarEventParticipantWorkspaceEntity,
} from 'src/modules/calendar/common/standard-objects/calendar-event-participant.workspace-entity';
import { type CalendarEventWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-event.workspace-entity';

const DEMO_TIME_ZONE = 'Europe/Paris';

const SHARED_CALENDAR_DEMO_EVENT_IDS = {
  TIM_TODAY_KICKOFF: '77777777-1111-4111-8111-111111111111',
  JONY_TODAY_REVIEW: '77777777-2222-4222-8222-222222222222',
  TIM_TOMORROW_CLIENT: '77777777-3333-4333-8333-333333333333',
  JONY_TOMORROW_WORKSHOP: '77777777-4444-4444-8444-444444444444',
  TIM_THURSDAY_STEERING: '77777777-5555-4555-8555-555555555555',
  JONY_FRIDAY_DEMO: '77777777-6666-4666-8666-666666666666',
} as const;

const SHARED_CALENDAR_DEMO_ASSOCIATION_IDS = {
  TIM_TODAY_KICKOFF: '88888888-1111-4111-8111-111111111111',
  JONY_TODAY_REVIEW: '88888888-2222-4222-8222-222222222222',
  TIM_TOMORROW_CLIENT: '88888888-3333-4333-8333-333333333333',
  JONY_TOMORROW_WORKSHOP: '88888888-4444-4444-8444-444444444444',
  TIM_THURSDAY_STEERING: '88888888-5555-4555-8555-555555555555',
  JONY_FRIDAY_DEMO: '88888888-6666-4666-8666-666666666666',
} as const;

const SHARED_CALENDAR_DEMO_PARTICIPANT_IDS = {
  TIM_TODAY_KICKOFF: '99999999-1111-4111-8111-111111111111',
  JONY_TODAY_REVIEW: '99999999-2222-4222-8222-222222222222',
  TIM_TOMORROW_CLIENT: '99999999-3333-4333-8333-333333333333',
  JONY_TOMORROW_WORKSHOP: '99999999-4444-4444-8444-444444444444',
  TIM_THURSDAY_STEERING: '99999999-5555-4555-8555-555555555555',
  JONY_FRIDAY_DEMO: '99999999-6666-4666-8666-666666666666',
} as const;

type DemoCalendarSeed = {
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  channelId: string;
  associationId: string;
  participantId: string;
  workspaceMemberId: string;
  handle: string;
  displayName: string;
};

@Injectable()
export class SharedCalendarDemoService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(CalendarChannelEntity)
    private readonly calendarChannelRepository: Repository<CalendarChannelEntity>,
  ) {}

  async resetSharedCalendarDemo({
    workspaceId,
  }: {
    workspaceId: string;
  }): Promise<void> {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const globalWorkspaceDataSource =
        await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();

      const demoSeeds = this.buildDemoCalendarSeeds();
      const demoEventIds = demoSeeds.map((seed) => seed.id);
      const demoMonthRange = this.buildDemoMonthRange();

      await globalWorkspaceDataSource.transaction(async (entityManager) => {
        const workspaceEntityManager = entityManager as WorkspaceEntityManager;
        const calendarEventRepository =
          workspaceEntityManager.getRepository<CalendarEventWorkspaceEntity>(
            'calendarEvent',
            { shouldBypassPermissionChecks: true },
          );
        const calendarChannelEventAssociationRepository =
          workspaceEntityManager.getRepository<CalendarChannelEventAssociationWorkspaceEntity>(
            'calendarChannelEventAssociation',
            { shouldBypassPermissionChecks: true },
          );
        const calendarEventParticipantRepository =
          workspaceEntityManager.getRepository<CalendarEventParticipantWorkspaceEntity>(
            'calendarEventParticipant',
            { shouldBypassPermissionChecks: true },
          );
        const internalEntityRepository = workspaceEntityManager.getRepository<{
          id: string;
          name: string;
          color: string;
        }>('internalEntity', {
          shouldBypassPermissionChecks: true,
        });

        await internalEntityRepository.upsert(
          Object.values(INTERNAL_ENTITY_SEEDS),
          ['id'],
        );

        await Promise.all([
          this.userRepository.update(USER_DATA_SEED_IDS.TIM, {
            entityId: PRIMARY_DEV_WORKSPACE_USERS.TIM.entityId,
          }),
          this.userRepository.update(USER_DATA_SEED_IDS.JONY, {
            entityId: PRIMARY_DEV_WORKSPACE_USERS.JONY.entityId,
          }),
          this.userRepository.update(USER_DATA_SEED_IDS.PHIL, {
            entityId: PRIMARY_DEV_WORKSPACE_USERS.PHIL.entityId,
          }),
          this.userRepository.update(USER_DATA_SEED_IDS.JANE, {
            entityId: PRIMARY_DEV_WORKSPACE_USERS.JANE.entityId,
          }),
        ]);

        await this.calendarChannelRepository.update(
          {
            workspaceId,
            id: In([
              CALENDAR_CHANNEL_DATA_SEED_IDS.TIM,
              CALENDAR_CHANNEL_DATA_SEED_IDS.JONY,
            ]),
          },
          {
            visibility: CalendarChannelVisibility.SHARE_EVERYTHING,
          },
        );

        const calendarEventsToClear = await calendarEventRepository.find({
          where: {
            startsAt: Between(
              demoMonthRange.startMonthIso,
              demoMonthRange.endMonthIso,
            ),
            id: Not(In(demoEventIds)),
          },
          select: { id: true },
        });

        const calendarEventIdsToClear = calendarEventsToClear.map(
          ({ id }) => id,
        );

        if (calendarEventIdsToClear.length > 0) {
          await calendarChannelEventAssociationRepository.delete({
            calendarEventId: In(calendarEventIdsToClear),
          });
          await calendarEventParticipantRepository.delete({
            calendarEventId: In(calendarEventIdsToClear),
          });
          await calendarEventRepository.delete({
            id: In(calendarEventIdsToClear),
          });
        }

        await calendarChannelEventAssociationRepository.delete({
          calendarEventId: In(demoEventIds),
        });
        await calendarEventParticipantRepository.delete({
          calendarEventId: In(demoEventIds),
        });

        await calendarEventRepository.upsert(
          demoSeeds.map((seed) => ({
            id: seed.id,
            title: seed.title,
            isCanceled: false,
            isFullDay: false,
            startsAt: seed.startsAt,
            endsAt: seed.endsAt,
            externalCreatedAt: seed.startsAt,
            externalUpdatedAt: seed.startsAt,
            description: seed.description,
            location: seed.location,
            iCalUid: `${seed.id}@shared-calendar-demo.twenty.local`,
            conferenceSolution: null,
            conferenceLink: this.createEmptyConferenceLink(),
            deletedAt: null,
          })),
          ['id'],
        );

        await calendarChannelEventAssociationRepository.insert(
          demoSeeds.map((seed) => ({
            id: seed.associationId,
            calendarChannelId: seed.channelId,
            calendarEventId: seed.id,
            eventExternalId: `shared-calendar-demo-${seed.id}`,
            recurringEventExternalId: null,
          })),
        );

        await calendarEventParticipantRepository.insert(
          demoSeeds.map((seed) => ({
            id: seed.participantId,
            calendarEventId: seed.id,
            handle: seed.handle,
            displayName: seed.displayName,
            isOrganizer: true,
            responseStatus: CalendarEventParticipantResponseStatus.ACCEPTED,
            personId: null,
            workspaceMemberId: seed.workspaceMemberId,
          })),
        );
      });
    }, authContext);
  }

  private buildDemoCalendarSeeds(): DemoCalendarSeed[] {
    const nowInParis = utcToZonedTime(new Date(), DEMO_TIME_ZONE);
    const weekStartInParis = startOfWeek(nowInParis, { weekStartsOn: 1 });

    return [
      {
        id: SHARED_CALENDAR_DEMO_EVENT_IDS.TIM_TODAY_KICKOFF,
        title: 'Kick-off Atlas',
        description: 'Lancement du projet Atlas avec les équipes delivery.',
        location: 'Salle Atlas',
        startsAt: this.buildUtcIsoFromParisWeekSlot(weekStartInParis, 1, 10, 0),
        endsAt: this.buildUtcIsoFromParisWeekSlot(weekStartInParis, 1, 10, 45),
        channelId: CALENDAR_CHANNEL_DATA_SEED_IDS.TIM,
        associationId: SHARED_CALENDAR_DEMO_ASSOCIATION_IDS.TIM_TODAY_KICKOFF,
        participantId: SHARED_CALENDAR_DEMO_PARTICIPANT_IDS.TIM_TODAY_KICKOFF,
        workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.TIM,
        handle: PRIMARY_DEV_WORKSPACE_USERS.TIM.email,
        displayName: getPrimaryDevWorkspaceUserDisplayName('TIM'),
      },
      {
        id: SHARED_CALENDAR_DEMO_EVENT_IDS.JONY_TODAY_REVIEW,
        title: 'Revue Orbis',
        description: 'Revue design transverse du projet Orbis.',
        location: 'Studio Design',
        startsAt: this.buildUtcIsoFromParisWeekSlot(weekStartInParis, 1, 14, 0),
        endsAt: this.buildUtcIsoFromParisWeekSlot(weekStartInParis, 1, 15, 0),
        channelId: CALENDAR_CHANNEL_DATA_SEED_IDS.JONY,
        associationId: SHARED_CALENDAR_DEMO_ASSOCIATION_IDS.JONY_TODAY_REVIEW,
        participantId: SHARED_CALENDAR_DEMO_PARTICIPANT_IDS.JONY_TODAY_REVIEW,
        workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
        handle: PRIMARY_DEV_WORKSPACE_USERS.JONY.email,
        displayName: getPrimaryDevWorkspaceUserDisplayName('JONY'),
      },
      {
        id: SHARED_CALENDAR_DEMO_EVENT_IDS.TIM_TOMORROW_CLIENT,
        title: 'Point client Atlas',
        description: 'Synchronisation hebdomadaire avec le client Atlas.',
        location: 'Google Meet',
        startsAt: this.buildUtcIsoFromParisWeekSlot(weekStartInParis, 2, 9, 30),
        endsAt: this.buildUtcIsoFromParisWeekSlot(weekStartInParis, 2, 10, 15),
        channelId: CALENDAR_CHANNEL_DATA_SEED_IDS.TIM,
        associationId: SHARED_CALENDAR_DEMO_ASSOCIATION_IDS.TIM_TOMORROW_CLIENT,
        participantId: SHARED_CALENDAR_DEMO_PARTICIPANT_IDS.TIM_TOMORROW_CLIENT,
        workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.TIM,
        handle: PRIMARY_DEV_WORKSPACE_USERS.TIM.email,
        displayName: getPrimaryDevWorkspaceUserDisplayName('TIM'),
      },
      {
        id: SHARED_CALENDAR_DEMO_EVENT_IDS.JONY_TOMORROW_WORKSHOP,
        title: 'Atelier Orbis',
        description: 'Atelier d’arbitrage design et produit.',
        location: 'Salle Workshop',
        startsAt: this.buildUtcIsoFromParisWeekSlot(weekStartInParis, 2, 15, 0),
        endsAt: this.buildUtcIsoFromParisWeekSlot(weekStartInParis, 2, 16, 15),
        channelId: CALENDAR_CHANNEL_DATA_SEED_IDS.JONY,
        associationId:
          SHARED_CALENDAR_DEMO_ASSOCIATION_IDS.JONY_TOMORROW_WORKSHOP,
        participantId:
          SHARED_CALENDAR_DEMO_PARTICIPANT_IDS.JONY_TOMORROW_WORKSHOP,
        workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
        handle: PRIMARY_DEV_WORKSPACE_USERS.JONY.email,
        displayName: getPrimaryDevWorkspaceUserDisplayName('JONY'),
      },
      {
        id: SHARED_CALENDAR_DEMO_EVENT_IDS.TIM_THURSDAY_STEERING,
        title: 'COPIL Atlas',
        description: 'Comité de pilotage avec suivi planning et risques.',
        location: 'Board Room',
        startsAt: this.buildUtcIsoFromParisWeekSlot(weekStartInParis, 3, 11, 0),
        endsAt: this.buildUtcIsoFromParisWeekSlot(weekStartInParis, 3, 12, 0),
        channelId: CALENDAR_CHANNEL_DATA_SEED_IDS.TIM,
        associationId:
          SHARED_CALENDAR_DEMO_ASSOCIATION_IDS.TIM_THURSDAY_STEERING,
        participantId:
          SHARED_CALENDAR_DEMO_PARTICIPANT_IDS.TIM_THURSDAY_STEERING,
        workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.TIM,
        handle: PRIMARY_DEV_WORKSPACE_USERS.TIM.email,
        displayName: getPrimaryDevWorkspaceUserDisplayName('TIM'),
      },
      {
        id: SHARED_CALENDAR_DEMO_EVENT_IDS.JONY_FRIDAY_DEMO,
        title: 'Démo Orbis',
        description: 'Démonstration hebdomadaire des avancées Orbis.',
        location: 'Zoom',
        startsAt: this.buildUtcIsoFromParisWeekSlot(weekStartInParis, 4, 16, 0),
        endsAt: this.buildUtcIsoFromParisWeekSlot(weekStartInParis, 4, 17, 0),
        channelId: CALENDAR_CHANNEL_DATA_SEED_IDS.JONY,
        associationId: SHARED_CALENDAR_DEMO_ASSOCIATION_IDS.JONY_FRIDAY_DEMO,
        participantId: SHARED_CALENDAR_DEMO_PARTICIPANT_IDS.JONY_FRIDAY_DEMO,
        workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
        handle: PRIMARY_DEV_WORKSPACE_USERS.JONY.email,
        displayName: getPrimaryDevWorkspaceUserDisplayName('JONY'),
      },
    ];
  }

  private buildDemoMonthRange() {
    const nowInParis = utcToZonedTime(new Date(), DEMO_TIME_ZONE);

    return {
      startMonthIso: zonedTimeToUtc(
        startOfMonth(nowInParis),
        DEMO_TIME_ZONE,
      ).toISOString(),
      endMonthIso: zonedTimeToUtc(
        endOfMonth(nowInParis),
        DEMO_TIME_ZONE,
      ).toISOString(),
    };
  }

  private buildUtcIsoFromParisWeekSlot(
    weekStartInParis: Date,
    dayOffset: number,
    hour: number,
    minute: number,
  ): string {
    const dayInParis = addDays(weekStartInParis, dayOffset);
    const localParisDate = new Date(
      dayInParis.getFullYear(),
      dayInParis.getMonth(),
      dayInParis.getDate(),
      hour,
      minute,
      0,
      0,
    );

    return zonedTimeToUtc(localParisDate, DEMO_TIME_ZONE).toISOString();
  }

  private createEmptyConferenceLink() {
    return {
      primaryLinkLabel: '',
      primaryLinkUrl: '',
      secondaryLinks: null,
    };
  }
}
