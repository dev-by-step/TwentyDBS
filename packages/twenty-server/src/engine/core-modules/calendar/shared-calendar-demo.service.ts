import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Between, In, Not, type Repository } from 'typeorm';

import { CalendarChannelVisibility } from 'twenty-shared/types';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { PRIMARY_DEV_WORKSPACE_USERS } from 'src/engine/workspace-manager/dev-seeder/core/constants/primary-dev-workspace-data.constant';
import { CALENDAR_CHANNEL_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/calendar-channel-data-seeds.constant';
import { USER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/core/utils/seed-users.util';
import {
  buildSharedCalendarDemoMonthRange,
  buildSharedCalendarDemoSeeds,
} from 'src/engine/core-modules/calendar/shared-calendar-demo.util';
import { INTERNAL_ENTITY_SEEDS } from 'src/modules/internal-entity/constants/internal-entity-seeds.constant';
import { type CalendarChannelEventAssociationWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-channel-event-association.workspace-entity';
import {
  CalendarEventParticipantResponseStatus,
  type CalendarEventParticipantWorkspaceEntity,
} from 'src/modules/calendar/common/standard-objects/calendar-event-participant.workspace-entity';
import { type CalendarEventWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-event.workspace-entity';

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

      const demoSeeds = buildSharedCalendarDemoSeeds();
      const demoEventIds = demoSeeds.map((seed) => seed.id);
      const demoMonthRange = buildSharedCalendarDemoMonthRange();

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
              CALENDAR_CHANNEL_DATA_SEED_IDS.PHIL,
              CALENDAR_CHANNEL_DATA_SEED_IDS.JANE,
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

  private createEmptyConferenceLink() {
    return {
      primaryLinkLabel: '',
      primaryLinkUrl: '',
      secondaryLinks: null,
    };
  }
}
