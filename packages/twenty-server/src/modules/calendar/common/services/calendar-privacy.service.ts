import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { MULTI_ENTITY_OBJECT_NAME } from 'twenty-shared/constants';
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

        const audienceEntityIdsByCalendarEventId =
          await this.loadAudienceEntityIdsByCalendarEventId({
            workspaceId,
            calendarEventIds,
          });

        const audienceMemberIdsByCalendarEventId =
          await this.loadAudienceMemberIdsByCalendarEventId({
            workspaceId,
            calendarEventIds,
          });

        const isViewerInPersonAudience = (calendarEventId: string): boolean => {
          if (!isDefined(currentWorkspaceMemberId)) {
            return false;
          }

          const audienceMemberIds =
            audienceMemberIdsByCalendarEventId.get(calendarEventId);

          return (
            isDefined(audienceMemberIds) &&
            audienceMemberIds.has(currentWorkspaceMemberId)
          );
        };

        if (accessibleEntityIds.size === 0) {
          const hasRequesterIdentityHints =
            isDefined(currentUserEntityId) ||
            isDefined(currentUserId) ||
            isDefined(currentWorkspaceMemberId);

          return this.createCalendarEventMaskMapWithPredicate(
            calendarEventIds,
            (calendarEventId) =>
              !publicCalendarEventIds.has(calendarEventId) &&
              !isViewerInPersonAudience(calendarEventId) &&
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
            MULTI_ENTITY_OBJECT_NAME.CalendarChannelEventAssociation,
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
                select: [
                  'id',
                  'connectedAccountId',
                  'visibleInternalEntityIds',
                ],
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
        const visibleEntityIdsByCalendarEventId = new Map<
          string,
          Set<string>
        >();
        const visibleInternalEntityIdsByCalendarChannelId = new Map(
          calendarChannels.map((calendarChannel) => [
            calendarChannel.id,
            new Set(calendarChannel.visibleInternalEntityIds ?? []),
          ]),
        );

        for (const association of calendarChannelEventAssociations) {
          const ownerEntityId = ownerEntityIdByCalendarChannelId.get(
            association.calendarChannelId,
          );
          const visibleInternalEntityIds =
            visibleInternalEntityIdsByCalendarChannelId.get(
              association.calendarChannelId,
            );

          if (
            isDefined(visibleInternalEntityIds) &&
            visibleInternalEntityIds.size > 0
          ) {
            const eventVisibleEntityIds =
              visibleEntityIdsByCalendarEventId.get(
                association.calendarEventId,
              ) ?? new Set<string>();

            for (const visibleInternalEntityId of visibleInternalEntityIds) {
              eventVisibleEntityIds.add(visibleInternalEntityId);
            }

            visibleEntityIdsByCalendarEventId.set(
              association.calendarEventId,
              eventVisibleEntityIds,
            );
          }

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

          // Owner-entity members always see their own events, regardless of
          // any explicit audience grant. When a channel has an explicit
          // entity access list, that list becomes the channel-level source of
          // truth for non-owner visibility; legacy channels without that list
          // keep the previous owner-entity behavior.
          const channelVisibleEntityIds =
            visibleEntityIdsByCalendarEventId.get(calendarEventId);
          const hasExplicitChannelEntityVisibility =
            isDefined(channelVisibleEntityIds) &&
            channelVisibleEntityIds.size > 0;
          const isViewerInChannelVisibleEntity =
            hasExplicitChannelEntityVisibility &&
            [...channelVisibleEntityIds].some((id) =>
              accessibleEntityIds.has(id),
            );

          if (isViewerInChannelVisibleEntity) {
            defaultMaskMap.set(calendarEventId, false);
            continue;
          }

          const ownerEntityIds =
            ownerEntityIdsByCalendarEventId.get(calendarEventId);
          const hasUnknownOwnerEntity =
            calendarEventIdsWithUnknownOwnerEntity.has(calendarEventId);
          const isViewerInOwnerEntity =
            !hasExplicitChannelEntityVisibility &&
            !hasUnknownOwnerEntity &&
            isDefined(ownerEntityIds) &&
            ownerEntityIds.size > 0 &&
            [...ownerEntityIds].some((id) => accessibleEntityIds.has(id));

          if (isViewerInOwnerEntity) {
            defaultMaskMap.set(calendarEventId, false);
            continue;
          }

          const audienceEntityIds =
            audienceEntityIdsByCalendarEventId.get(calendarEventId);
          const isViewerInEntityAudience =
            isDefined(audienceEntityIds) &&
            audienceEntityIds.size > 0 &&
            [...audienceEntityIds].some((entityId) =>
              accessibleEntityIds.has(entityId),
            );

          if (
            isViewerInEntityAudience ||
            isViewerInPersonAudience(calendarEventId)
          ) {
            defaultMaskMap.set(calendarEventId, false);
            continue;
          }

          // No applicable unmasking rule: hide event details, keep the slot
          // visible so other users see "Busy" with the owner entity badge.
          defaultMaskMap.set(calendarEventId, true);
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

  private loadAudienceEntityIdsByCalendarEventId(args: {
    workspaceId: string;
    calendarEventIds: string[];
  }): Promise<Map<string, Set<string>>> {
    return this.loadAudienceMap({
      ...args,
      repositoryName: MULTI_ENTITY_OBJECT_NAME.CalendarEventEntityAudience,
      targetField: 'internalEntityId',
    });
  }

  private loadAudienceMemberIdsByCalendarEventId(args: {
    workspaceId: string;
    calendarEventIds: string[];
  }): Promise<Map<string, Set<string>>> {
    return this.loadAudienceMap({
      ...args,
      repositoryName: MULTI_ENTITY_OBJECT_NAME.CalendarEventPersonAudience,
      targetField: 'workspaceMemberId',
    });
  }

  // Loads junction rows from `repositoryName` matching the given event ids and
  // returns a map calendarEventId -> Set of `targetField` values. Returns an
  // empty map when the metadata is not yet initialised — callers fall back to
  // the public/owner-entity heuristics so the privacy logic stays robust during
  // schema migrations.
  private async loadAudienceMap({
    workspaceId,
    calendarEventIds,
    repositoryName,
    targetField,
  }: {
    workspaceId: string;
    calendarEventIds: string[];
    repositoryName: string;
    targetField: 'internalEntityId' | 'workspaceMemberId';
  }): Promise<Map<string, Set<string>>> {
    if (calendarEventIds.length === 0) {
      return new Map();
    }

    let audienceRows: Array<Record<string, unknown>> = [];

    try {
      const audienceRepository =
        await this.globalWorkspaceOrmManager.getRepository<
          Record<string, unknown>
        >(workspaceId, repositoryName, {
          shouldBypassPermissionChecks: true,
        });

      if (!isDefined(audienceRepository)) {
        return new Map();
      }

      audienceRows = await (
        audienceRepository as {
          find: (args: unknown) => Promise<Array<Record<string, unknown>>>;
        }
      ).find({
        where: {
          calendarEventId: In(calendarEventIds),
        },
      });
    } catch {
      return new Map();
    }

    const audienceMap = new Map<string, Set<string>>();

    for (const row of audienceRows) {
      const calendarEventId = row.calendarEventId;
      const targetValue = row[targetField];

      if (
        typeof calendarEventId !== 'string' ||
        typeof targetValue !== 'string'
      ) {
        continue;
      }

      const set = audienceMap.get(calendarEventId) ?? new Set<string>();

      set.add(targetValue);
      audienceMap.set(calendarEventId, set);
    }

    return audienceMap;
  }

  private extractStringField(
    record: Record<string, unknown>,
    fieldName: string,
  ) {
    const value = record[fieldName];

    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}
