import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { In, Repository } from 'typeorm';

import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type TimelineCalendarEventDTO } from 'src/engine/core-modules/calendar/dtos/timeline-calendar-event.dto';
import { CALENDAR_PRIVACY_OCCUPIED_TITLE } from 'src/modules/calendar/common/constants/calendar-privacy.constants';
import { type CalendarChannelEventAssociationWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-channel-event-association.workspace-entity';
import { type CalendarEventWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-event.workspace-entity';

type GetCalendarEventMaskMapArgs = {
  calendarEventIds: string[];
  workspaceId: string;
  currentUserEntityId?: string | null;
  currentUserId?: string;
  currentWorkspaceMemberId?: string;
};

@Injectable()
export class CalendarPrivacyService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    @InjectRepository(CalendarChannelEntity)
    private readonly calendarChannelRepository: Repository<CalendarChannelEntity>,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async getCalendarEventMaskMap({
    calendarEventIds,
    workspaceId,
    currentUserEntityId,
    currentUserId,
    currentWorkspaceMemberId,
  }: GetCalendarEventMaskMapArgs): Promise<Map<string, boolean>> {
    if (calendarEventIds.length === 0) {
      return this.createCalendarEventMaskMap(calendarEventIds, false);
    }

    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const resolvedCurrentUserEntityId =
          await this.resolveCurrentUserEntityId({
            workspaceId,
            currentUserEntityId,
            currentUserId,
            currentWorkspaceMemberId,
          });

        if (!isDefined(resolvedCurrentUserEntityId)) {
          const hasRequesterIdentityHints =
            isDefined(currentUserEntityId) ||
            isDefined(currentUserId) ||
            isDefined(currentWorkspaceMemberId);

          return this.createCalendarEventMaskMap(
            calendarEventIds,
            hasRequesterIdentityHints,
          );
        }

        const defaultMaskMap = this.createCalendarEventMaskMap(
          calendarEventIds,
          false,
        );

        const calendarChannelEventAssociationRepository =
          await this.globalWorkspaceOrmManager.getRepository<CalendarChannelEventAssociationWorkspaceEntity>(
            workspaceId,
            'calendarChannelEventAssociation',
          );

        const calendarChannelEventAssociations =
          await calendarChannelEventAssociationRepository.find({
            where: {
              calendarEventId: In(calendarEventIds),
            },
          });

        if (calendarChannelEventAssociations.length === 0) {
          return defaultMaskMap;
        }

        const calendarChannelIds = [
          ...new Set(
            calendarChannelEventAssociations.map(
              (association) => association.calendarChannelId,
            ),
          ),
        ];

        const calendarChannels =
          calendarChannelIds.length > 0
            ? await this.calendarChannelRepository.find({
                where: {
                  id: In(calendarChannelIds),
                  workspaceId,
                },
                select: ['id', 'connectedAccountId'],
              })
            : [];

        const connectedAccountIds = [
          ...new Set(
            calendarChannels
              .map((channel) => channel.connectedAccountId)
              .filter(isDefined),
          ),
        ];

        const connectedAccounts =
          connectedAccountIds.length > 0
            ? await this.connectedAccountRepository.find({
                where: {
                  id: In(connectedAccountIds),
                  workspaceId,
                },
                select: ['id', 'userWorkspaceId'],
              })
            : [];

        const userWorkspaceIds = [
          ...new Set(
            connectedAccounts
              .map((connectedAccount) => connectedAccount.userWorkspaceId)
              .filter(isDefined),
          ),
        ];

        const userWorkspaces =
          userWorkspaceIds.length > 0
            ? await this.userWorkspaceRepository.find({
                where: {
                  id: In(userWorkspaceIds),
                  workspaceId,
                },
                select: ['id', 'userId'],
              })
            : [];

        const userIds = [
          ...new Set(
            userWorkspaces
              .map((userWorkspace) => userWorkspace.userId)
              .filter(isDefined),
          ),
        ];

        const users =
          userIds.length > 0
            ? await this.userRepository.find({
                where: {
                  id: In(userIds),
                },
                select: ['id', 'entityId'],
              })
            : [];

        const userWorkspaceIdByConnectedAccountId = new Map(
          connectedAccounts.map((connectedAccount) => [
            connectedAccount.id,
            connectedAccount.userWorkspaceId,
          ]),
        );

        const userIdByUserWorkspaceId = new Map(
          userWorkspaces.map((userWorkspace) => [
            userWorkspace.id,
            userWorkspace.userId,
          ]),
        );

        const entityIdByUserId = new Map(
          users.map((user) => [user.id, this.normalizeEntityId(user.entityId)]),
        );

        const ownerEntityIdByCalendarChannelId = new Map(
          calendarChannels.map((calendarChannel) => {
            const userWorkspaceId = userWorkspaceIdByConnectedAccountId.get(
              calendarChannel.connectedAccountId,
            );
            const userId = isDefined(userWorkspaceId)
              ? userIdByUserWorkspaceId.get(userWorkspaceId)
              : undefined;

            return [
              calendarChannel.id,
              isDefined(userId) ? entityIdByUserId.get(userId) ?? null : null,
            ];
          }),
        );

        const ownerEntityIdsByCalendarEventId = new Map<string, Set<string>>();
        const calendarEventIdsWithUnknownOwnerEntity = new Set<string>();

        for (const association of calendarChannelEventAssociations) {
          const ownerEntityId = ownerEntityIdByCalendarChannelId.get(
            association.calendarChannelId,
          );

          if (!isDefined(ownerEntityId)) {
            calendarEventIdsWithUnknownOwnerEntity.add(
              association.calendarEventId,
            );
            continue;
          }

          const ownerEntityIds =
            ownerEntityIdsByCalendarEventId.get(association.calendarEventId) ??
            new Set<string>();

          ownerEntityIds.add(ownerEntityId);
          ownerEntityIdsByCalendarEventId.set(
            association.calendarEventId,
            ownerEntityIds,
          );
        }

        for (const calendarEventId of calendarEventIds) {
          const ownerEntityIds =
            ownerEntityIdsByCalendarEventId.get(calendarEventId);

          if (
            calendarEventIdsWithUnknownOwnerEntity.has(calendarEventId) ||
            !isDefined(ownerEntityIds) ||
            ownerEntityIds.size === 0
          ) {
            defaultMaskMap.set(calendarEventId, true);
            continue;
          }

          defaultMaskMap.set(
            calendarEventId,
            [...ownerEntityIds].some(
              (ownerEntityId) =>
                ownerEntityId !== resolvedCurrentUserEntityId,
            ),
          );
        }

        return defaultMaskMap;
      },
      authContext,
    );
  }

  applyInternalEntityPrivacyToWorkspaceCalendarEvents(
    calendarEvents: CalendarEventWorkspaceEntity[],
    calendarEventMaskMap: Map<string, boolean>,
  ) {
    for (const calendarEvent of calendarEvents) {
      if (!calendarEventMaskMap.get(calendarEvent.id)) {
        continue;
      }

      calendarEvent.title = CALENDAR_PRIVACY_OCCUPIED_TITLE;
      calendarEvent.description = null;
      calendarEvent.location = null;
      calendarEvent.conferenceSolution = null;
      calendarEvent.calendarEventParticipants = [];
      calendarEvent.conferenceLink = this.createEmptyConferenceLink();
    }
  }

  applyInternalEntityPrivacyToTimelineCalendarEvents(
    timelineCalendarEvents: TimelineCalendarEventDTO[],
    calendarEventMaskMap: Map<string, boolean>,
  ) {
    for (const timelineCalendarEvent of timelineCalendarEvents) {
      if (!calendarEventMaskMap.get(timelineCalendarEvent.id)) {
        continue;
      }

      timelineCalendarEvent.title = CALENDAR_PRIVACY_OCCUPIED_TITLE;
      timelineCalendarEvent.description = null;
      timelineCalendarEvent.location = null;
      timelineCalendarEvent.conferenceSolution = null;
      timelineCalendarEvent.participants = null;
      timelineCalendarEvent.conferenceLink = null;
    }
  }

  private createEmptyConferenceLink() {
    return {
      primaryLinkLabel: '',
      primaryLinkUrl: '',
      secondaryLinks: null,
    };
  }

  private normalizeEntityId(entityId?: string | null) {
    if (!isDefined(entityId) || entityId.trim().length === 0) {
      return null;
    }

    return entityId.toLowerCase();
  }

  private createCalendarEventMaskMap(
    calendarEventIds: string[],
    shouldMask: boolean,
  ) {
    return new Map(
      calendarEventIds.map((calendarEventId) => [calendarEventId, shouldMask]),
    );
  }

  private async resolveCurrentUserEntityId({
    workspaceId,
    currentUserEntityId,
    currentUserId,
    currentWorkspaceMemberId,
  }: {
    workspaceId: string;
    currentUserEntityId?: string | null;
    currentUserId?: string;
    currentWorkspaceMemberId?: string;
  }) {
    const normalizedCurrentUserEntityId =
      this.normalizeEntityId(currentUserEntityId);

    if (isDefined(normalizedCurrentUserEntityId)) {
      return normalizedCurrentUserEntityId;
    }

    let resolvedCurrentUserId = currentUserId;

    if (!isDefined(resolvedCurrentUserId) && isDefined(currentWorkspaceMemberId)) {
      const workspaceMemberRepository =
        await this.globalWorkspaceOrmManager.getRepository<{
          id: string;
          userId: string;
        }>(
          workspaceId,
          'workspaceMember',
          { shouldBypassPermissionChecks: true },
        );

      const workspaceMember = await workspaceMemberRepository.findOne({
        where: { id: currentWorkspaceMemberId },
        select: { userId: true },
      });

      resolvedCurrentUserId = workspaceMember?.userId;
    }

    if (!isDefined(resolvedCurrentUserId)) {
      return null;
    }

    const currentUser = await this.userRepository.findOne({
      where: { id: resolvedCurrentUserId },
      select: ['entityId'],
    });

    return this.normalizeEntityId(currentUser?.entityId);
  }
}
