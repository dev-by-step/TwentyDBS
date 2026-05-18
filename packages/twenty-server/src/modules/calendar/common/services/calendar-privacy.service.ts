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
import { CALENDAR_EVENT_SHARING_SCOPE } from 'src/modules/calendar/common/constants/calendar-event-sharing-scope.constants';
import { CALENDAR_PRIVACY_OCCUPIED_TITLE } from 'src/modules/calendar/common/constants/calendar-privacy.constants';
import { type CalendarChannelEventAssociationWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-channel-event-association.workspace-entity';
import { type CalendarEventWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-event.workspace-entity';
import {
  type WorkspaceMemberInternalEntityContext,
  WorkspaceMemberInternalEntityService,
} from 'src/modules/internal-entity/services/workspace-member-internal-entity.service';

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
    private readonly workspaceMemberInternalEntityService: WorkspaceMemberInternalEntityService,
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
        const resolvedCurrentUserEntityContext =
          await this.resolveCurrentUserEntityContext({
            workspaceId,
            currentUserEntityId,
            currentUserId,
            currentWorkspaceMemberId,
          });
        const accessibleEntityIds = new Set(
          resolvedCurrentUserEntityContext.entityIds,
        );

        const calendarEventRepository =
          await this.globalWorkspaceOrmManager.getRepository<{
            id: string;
            sharingScope: string | null;
          }>(workspaceId, 'calendarEvent', {
            shouldBypassPermissionChecks: true,
          });
        const calendarEvents = await calendarEventRepository.find({
          where: {
            id: In(calendarEventIds),
          },
          select: {
            id: true,
            sharingScope: true,
          },
        });
        const publicCalendarEventIds = new Set(
          calendarEvents
            .filter(
              (calendarEvent) =>
                calendarEvent.sharingScope ===
                CALENDAR_EVENT_SHARING_SCOPE.WORKSPACE_PUBLIC,
            )
            .map((calendarEvent) => calendarEvent.id),
        );

        if (accessibleEntityIds.size === 0) {
          const hasRequesterIdentityHints =
            isDefined(currentUserEntityId) ||
            isDefined(currentUserId) ||
            isDefined(currentWorkspaceMemberId);

          return this.createCalendarEventMaskMapWithPredicate(
            calendarEventIds,
            (calendarEventId) =>
              !publicCalendarEventIds.has(calendarEventId) &&
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

        const workspaceMemberRepository =
          await this.globalWorkspaceOrmManager.getRepository<
            Record<string, unknown>
          >(workspaceId, 'workspaceMember', {
            shouldBypassPermissionChecks: true,
          });
        const workspaceMembers =
          userIds.length > 0
            ? await workspaceMemberRepository.find({
                where: {
                  userId: In(userIds),
                },
              })
            : [];
        const workspaceMemberIdByUserId = new Map(
          workspaceMembers
            .map((workspaceMember) => [
              this.extractStringField(workspaceMember, 'userId'),
              this.extractStringField(workspaceMember, 'id'),
            ])
            .filter(
              (entry): entry is [string, string] =>
                isDefined(entry[0]) && isDefined(entry[1]),
            ),
        );

        const ownerEntityIdByCalendarChannelId = new Map(
          await Promise.all(
            calendarChannels.map(async (calendarChannel) => {
              const userWorkspaceId = userWorkspaceIdByConnectedAccountId.get(
                calendarChannel.connectedAccountId,
              );
              const userId = isDefined(userWorkspaceId)
                ? userIdByUserWorkspaceId.get(userWorkspaceId)
                : undefined;
              const workspaceMemberId = isDefined(userId)
                ? workspaceMemberIdByUserId.get(userId)
                : null;
              const fallbackEntityId =
                users.find((user) => user.id === userId)?.entityId ?? null;
              const { currentEntityId } =
                await this.workspaceMemberInternalEntityService.resolveContext({
                  workspaceId,
                  workspaceMemberId,
                  fallbackEntityId,
                });

              return [calendarChannel.id, currentEntityId] as const;
            }),
          ),
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
          if (publicCalendarEventIds.has(calendarEventId)) {
            defaultMaskMap.set(calendarEventId, false);
            continue;
          }

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
              (ownerEntityId) => !accessibleEntityIds.has(ownerEntityId),
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
      if (calendarEventMaskMap.get(calendarEvent.id) !== true) {
        continue;
      }

      this.applyWorkspaceCalendarEventMask(calendarEvent);
    }
  }

  applyInternalEntityPrivacyToTimelineCalendarEvents(
    timelineCalendarEvents: TimelineCalendarEventDTO[],
    calendarEventMaskMap: Map<string, boolean>,
  ) {
    for (const timelineCalendarEvent of timelineCalendarEvents) {
      if (calendarEventMaskMap.get(timelineCalendarEvent.id) !== true) {
        continue;
      }

      this.applyTimelineCalendarEventMask(timelineCalendarEvent);
    }
  }

  // Privacy contract: every field that can reveal the owning entity must be
  // redacted here. When adding a sensitive field to CalendarEventWorkspaceEntity,
  // extend this method to keep cross-entity events anonymized.
  private applyWorkspaceCalendarEventMask(
    calendarEvent: CalendarEventWorkspaceEntity,
  ): void {
    calendarEvent.title = CALENDAR_PRIVACY_OCCUPIED_TITLE;
    calendarEvent.description = null;
    calendarEvent.location = null;
    calendarEvent.conferenceSolution = null;
    calendarEvent.calendarEventParticipants = [];
    calendarEvent.conferenceLink = this.createEmptyConferenceLink();
  }

  // Privacy contract: every field that can reveal the owning entity must be
  // redacted here. When adding a sensitive field to TimelineCalendarEventDTO,
  // extend this method to keep cross-entity events anonymized.
  private applyTimelineCalendarEventMask(
    timelineCalendarEvent: TimelineCalendarEventDTO,
  ): void {
    timelineCalendarEvent.title = CALENDAR_PRIVACY_OCCUPIED_TITLE;
    timelineCalendarEvent.description = null;
    timelineCalendarEvent.location = null;
    timelineCalendarEvent.conferenceSolution = null;
    timelineCalendarEvent.participants = null;
    timelineCalendarEvent.conferenceLink = null;
  }

  private createEmptyConferenceLink() {
    return {
      primaryLinkLabel: '',
      primaryLinkUrl: '',
      secondaryLinks: null,
    };
  }

  private createCalendarEventMaskMap(
    calendarEventIds: string[],
    shouldMask: boolean,
  ) {
    return new Map(
      calendarEventIds.map((calendarEventId) => [calendarEventId, shouldMask]),
    );
  }

  private createCalendarEventMaskMapWithPredicate(
    calendarEventIds: string[],
    shouldMaskPredicate: (calendarEventId: string) => boolean,
  ) {
    return new Map(
      calendarEventIds.map((calendarEventId) => [
        calendarEventId,
        shouldMaskPredicate(calendarEventId),
      ]),
    );
  }

  private async resolveCurrentUserEntityContext({
    workspaceId,
    currentUserEntityId,
    currentUserId,
    currentWorkspaceMemberId,
  }: {
    workspaceId: string;
    currentUserEntityId?: string | null;
    currentUserId?: string;
    currentWorkspaceMemberId?: string;
  }): Promise<WorkspaceMemberInternalEntityContext> {
    let fallbackEntityId = currentUserEntityId ?? null;

    if (!isDefined(fallbackEntityId) && isDefined(currentUserId)) {
      const currentUser = await this.userRepository.findOne({
        where: { id: currentUserId },
        select: ['entityId'],
      });

      fallbackEntityId = currentUser?.entityId ?? null;
    }

    return await this.workspaceMemberInternalEntityService.resolveContext({
      workspaceId,
      workspaceMemberId: currentWorkspaceMemberId,
      fallbackEntityId,
    });
  }

  private extractStringField(
    record: Record<string, unknown>,
    fieldName: string,
  ) {
    const value = record[fieldName];

    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}
