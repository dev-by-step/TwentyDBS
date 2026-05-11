import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import { CalendarChannelVisibility } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { In, Repository } from 'typeorm';

import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { CalendarPrivacyService } from 'src/modules/calendar/common/services/calendar-privacy.service';
import { type CalendarChannelEventAssociationWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-channel-event-association.workspace-entity';
import { type CalendarEventWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-event.workspace-entity';

@Injectable()
export class ApplyCalendarEventsVisibilityRestrictionsService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly calendarPrivacyService: CalendarPrivacyService,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    @InjectRepository(CalendarChannelEntity)
    private readonly calendarChannelRepository: Repository<CalendarChannelEntity>,
  ) {}

  public async applyCalendarEventsVisibilityRestrictions(
    calendarEvents: CalendarEventWorkspaceEntity[],
    workspaceId: string,
    userId?: string,
    currentUserEntityId?: string | null,
    currentWorkspaceMemberId?: string,
  ) {
    if (calendarEvents.length === 0) {
      return calendarEvents;
    }

    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const calendarChannelEventAssociationRepository =
          await this.globalWorkspaceOrmManager.getRepository<CalendarChannelEventAssociationWorkspaceEntity>(
            workspaceId,
            'calendarChannelEventAssociation',
          );

        const calendarChannelCalendarEventsAssociations =
          await calendarChannelEventAssociationRepository.find({
            where: {
              calendarEventId: In(calendarEvents.map((event) => event.id)),
            },
          });

        const calendarChannelIds = [
          ...new Set(
            calendarChannelCalendarEventsAssociations.map(
              (association) => association.calendarChannelId,
            ),
          ),
        ];

        const calendarChannelsFromCore =
          calendarChannelIds.length > 0
            ? await this.calendarChannelRepository.find({
                where: {
                  id: In(calendarChannelIds),
                  workspaceId,
                },
              })
            : [];

        const calendarChannelMap = new Map(
          calendarChannelsFromCore.map((channel) => [channel.id, channel]),
        );

        const associationsByCalendarEventId = new Map<
          string,
          CalendarChannelEventAssociationWorkspaceEntity[]
        >();

        for (const association of calendarChannelCalendarEventsAssociations) {
          const associations =
            associationsByCalendarEventId.get(association.calendarEventId) ?? [];

          associations.push(association);
          associationsByCalendarEventId.set(
            association.calendarEventId,
            associations,
          );
        }

        const currentUserWorkspaceId = isDefined(userId)
          ? (
              await this.userWorkspaceRepository.findOne({
                where: { userId, workspaceId },
                select: ['id'],
              })
            )?.id ?? null
          : null;

        const connectedAccountIds = [
          ...new Set(
            calendarChannelsFromCore
              .map((calendarChannel) => calendarChannel.connectedAccountId)
              .filter(isDefined),
          ),
        ];

        const ownedConnectedAccountIds =
          isDefined(currentUserWorkspaceId) && connectedAccountIds.length > 0
            ? new Set(
                (
                  await this.connectedAccountRepository.find({
                    where: {
                      id: In(connectedAccountIds),
                      userWorkspaceId: currentUserWorkspaceId,
                      workspaceId,
                    },
                    select: ['id'],
                  })
                ).map((connectedAccount) => connectedAccount.id),
              )
            : new Set<string>();

        for (let i = calendarEvents.length - 1; i >= 0; i--) {
          const associations =
            associationsByCalendarEventId.get(calendarEvents[i].id) ?? [];

          const calendarChannels = associations
            .map((association) =>
              calendarChannelMap.get(association.calendarChannelId),
            )
            .filter(isDefined);

          const hasShareEverythingVisibility = calendarChannels.some(
            (calendarChannel) =>
              calendarChannel.visibility ===
              CalendarChannelVisibility.SHARE_EVERYTHING,
          );

          if (hasShareEverythingVisibility) {
            continue;
          }

          const isOwnedByCurrentUser = calendarChannels.some((calendarChannel) =>
            ownedConnectedAccountIds.has(calendarChannel.connectedAccountId),
          );

          if (isOwnedByCurrentUser) {
            continue;
          }

          const hasMetadataVisibility = calendarChannels.some(
            (calendarChannel) =>
              calendarChannel.visibility === CalendarChannelVisibility.METADATA,
          );

          if (hasMetadataVisibility) {
            calendarEvents[i].title =
              FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED;
            calendarEvents[i].description =
              FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED;
            continue;
          }

          calendarEvents.splice(i, 1);
        }

        if (calendarEvents.length === 0) {
          return calendarEvents;
        }

        const calendarEventMaskMap =
          await this.calendarPrivacyService.getCalendarEventMaskMap({
            calendarEventIds: calendarEvents.map((calendarEvent) => calendarEvent.id),
            workspaceId,
            currentUserEntityId,
            currentUserId: userId,
            currentWorkspaceMemberId,
          });

        this.calendarPrivacyService.applyInternalEntityPrivacyToWorkspaceCalendarEvents(
          calendarEvents,
          calendarEventMaskMap,
        );

        return calendarEvents;
      },
      authContext,
    );
  }
}
