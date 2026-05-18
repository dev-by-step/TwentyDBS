import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import omit from 'lodash.omit';
import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';
import {
  Any,
  Between,
  type FindOptionsWhere,
  In,
  LessThan,
  MoreThanOrEqual,
  type Repository,
} from 'typeorm';

import { CalendarChannelVisibility } from 'twenty-shared/types';
import { TIMELINE_CALENDAR_EVENTS_DEFAULT_PAGE_SIZE } from 'src/engine/core-modules/calendar/constants/calendar.constants';
import { type TimelineCalendarEventDTO } from 'src/engine/core-modules/calendar/dtos/timeline-calendar-event.dto';
import { type TimelineCalendarEventsWithTotalDTO } from 'src/engine/core-modules/calendar/dtos/timeline-calendar-events-with-total.dto';
import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { CalendarPrivacyService } from 'src/modules/calendar/common/services/calendar-privacy.service';
import { type CalendarEventWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-event.workspace-entity';
import {
  type WorkspaceMemberInternalEntityContext,
  WorkspaceMemberInternalEntityService,
} from 'src/modules/internal-entity/services/workspace-member-internal-entity.service';
import { type OpportunityWorkspaceEntity } from 'src/modules/opportunity/standard-objects/opportunity.workspace-entity';
import { type PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';

type InternalEntityBadgeInfo = {
  color: string | null;
  name: string | null;
};

@Injectable()
export class TimelineCalendarEventService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly calendarPrivacyService: CalendarPrivacyService,
    @InjectRepository(CalendarChannelEntity)
    private readonly calendarChannelRepository: Repository<CalendarChannelEntity>,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    private readonly workspaceMemberInternalEntityService: WorkspaceMemberInternalEntityService,
  ) {}

  async getCalendarEventsFromPersonIds({
    currentWorkspaceMemberId,
    personIds,
    workspaceId,
    page = 1,
    pageSize = TIMELINE_CALENDAR_EVENTS_DEFAULT_PAGE_SIZE,
  }: {
    currentWorkspaceMemberId: string;
    personIds: string[];
    workspaceId: string;
    page: number;
    pageSize: number;
  }): Promise<TimelineCalendarEventsWithTotalDTO> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const offset = (page - 1) * pageSize;

        const calendarEventRepository =
          await this.globalWorkspaceOrmManager.getRepository<CalendarEventWorkspaceEntity>(
            workspaceId,
            'calendarEvent',
          );

        const paginatedIds = await calendarEventRepository.find({
          where: {
            calendarEventParticipants: {
              personId: Any(personIds),
            },
          },
          select: { id: true, startsAt: true },
          skip: offset,
          take: pageSize,
          order: { startsAt: 'DESC' },
        });

        const ids = paginatedIds.map(({ id }) => id);

        if (ids.length === 0) {
          return { totalNumberOfCalendarEvents: 0, timelineCalendarEvents: [] };
        }

        const timelineCalendarEvents =
          await this.buildTimelineCalendarEventsFromIds({
            calendarEventRepository,
            ids,
            currentWorkspaceMemberId,
            workspaceId,
          });

        return {
          totalNumberOfCalendarEvents: timelineCalendarEvents.length,
          timelineCalendarEvents,
        };
      },
      authContext,
    );
  }

  async getGroupCalendarEvents({
    currentWorkspaceMemberId,
    includeMaskedEvents,
    workspaceId,
    page = 1,
    pageSize = TIMELINE_CALENDAR_EVENTS_DEFAULT_PAGE_SIZE,
    startDate,
    endDate,
  }: {
    currentWorkspaceMemberId: string;
    includeMaskedEvents: boolean;
    workspaceId: string;
    page: number;
    pageSize: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<TimelineCalendarEventsWithTotalDTO> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const offset = (page - 1) * pageSize;

        const calendarEventRepository =
          await this.globalWorkspaceOrmManager.getRepository<CalendarEventWorkspaceEntity>(
            workspaceId,
            'calendarEvent',
          );

        const dateWhere = this.buildDateWhereClause(startDate, endDate);

        const allMatchingIds = await calendarEventRepository.find({
          where: dateWhere,
          select: { id: true },
          order: { startsAt: 'DESC' },
        });

        const ids = allMatchingIds.map(({ id }) => id);

        if (ids.length === 0) {
          return { totalNumberOfCalendarEvents: 0, timelineCalendarEvents: [] };
        }

        const timelineCalendarEvents = (
          await this.buildTimelineCalendarEventsFromIds({
            calendarEventRepository,
            ids,
            currentWorkspaceMemberId,
            workspaceId,
          })
        ).filter(
          (timelineCalendarEvent) =>
            includeMaskedEvents ||
            timelineCalendarEvent.visibility !==
              CalendarChannelVisibility.METADATA,
        );

        return {
          totalNumberOfCalendarEvents: timelineCalendarEvents.length,
          timelineCalendarEvents: timelineCalendarEvents.slice(
            offset,
            offset + pageSize,
          ),
        };
      },
      authContext,
    );
  }

  async getCalendarEventsFromCompanyId({
    currentWorkspaceMemberId,
    companyId,
    workspaceId,
    page = 1,
    pageSize = TIMELINE_CALENDAR_EVENTS_DEFAULT_PAGE_SIZE,
  }: {
    currentWorkspaceMemberId: string;
    companyId: string;
    workspaceId: string;
    page: number;
    pageSize: number;
  }): Promise<TimelineCalendarEventsWithTotalDTO> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const personRepository =
          await this.globalWorkspaceOrmManager.getRepository<PersonWorkspaceEntity>(
            workspaceId,
            'person',
            { shouldBypassPermissionChecks: true },
          );

        const persons = await personRepository.find({
          where: { companyId },
          select: { id: true },
        });

        if (persons.length === 0) {
          return { totalNumberOfCalendarEvents: 0, timelineCalendarEvents: [] };
        }

        return this.getCalendarEventsFromPersonIds({
          currentWorkspaceMemberId,
          personIds: persons.map(({ id }) => id),
          workspaceId,
          page,
          pageSize,
        });
      },
      authContext,
    );
  }

  async getCalendarEventsFromOpportunityId({
    currentWorkspaceMemberId,
    opportunityId,
    workspaceId,
    page = 1,
    pageSize = TIMELINE_CALENDAR_EVENTS_DEFAULT_PAGE_SIZE,
  }: {
    currentWorkspaceMemberId: string;
    opportunityId: string;
    workspaceId: string;
    page: number;
    pageSize: number;
  }): Promise<TimelineCalendarEventsWithTotalDTO> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const opportunityRepository =
          await this.globalWorkspaceOrmManager.getRepository<OpportunityWorkspaceEntity>(
            workspaceId,
            'opportunity',
            { shouldBypassPermissionChecks: true },
          );

        const opportunity = await opportunityRepository.findOne({
          where: { id: opportunityId },
          select: { companyId: true },
        });

        if (!opportunity?.companyId) {
          return { totalNumberOfCalendarEvents: 0, timelineCalendarEvents: [] };
        }

        return this.getCalendarEventsFromCompanyId({
          currentWorkspaceMemberId,
          companyId: opportunity.companyId,
          workspaceId,
          page,
          pageSize,
        });
      },
      authContext,
    );
  }

  private buildDateWhereClause(
    startDate?: Date,
    endDate?: Date,
  ): FindOptionsWhere<CalendarEventWorkspaceEntity> {
    if (startDate != null && endDate != null) {
      return {
        startsAt: Between(startDate, endDate),
      } as unknown as FindOptionsWhere<CalendarEventWorkspaceEntity>;
    }
    if (startDate != null) {
      return {
        startsAt: MoreThanOrEqual(startDate),
      } as unknown as FindOptionsWhere<CalendarEventWorkspaceEntity>;
    }
    if (endDate != null) {
      return {
        startsAt: LessThan(endDate),
      } as unknown as FindOptionsWhere<CalendarEventWorkspaceEntity>;
    }

    return {};
  }

  private async buildTimelineCalendarEventsFromIds({
    calendarEventRepository,
    ids,
    currentWorkspaceMemberId,
    workspaceId,
  }: {
    calendarEventRepository: Repository<CalendarEventWorkspaceEntity>;
    ids: string[];
    currentWorkspaceMemberId: string;
    workspaceId: string;
  }): Promise<TimelineCalendarEventDTO[]> {
    const events = await calendarEventRepository.find({
      where: { id: Any(ids) },
      relations: {
        calendarEventParticipants: { person: true, workspaceMember: true },
        calendarChannelEventAssociations: true,
      },
    });

    const allCalendarChannelIds = [
      ...new Set(
        events.flatMap((event) =>
          event.calendarChannelEventAssociations.map(
            (assoc) => assoc.calendarChannelId,
          ),
        ),
      ),
    ];

    const calendarChannels =
      allCalendarChannelIds.length > 0
        ? await this.calendarChannelRepository.find({
            where: { id: In(allCalendarChannelIds), workspaceId },
          })
        : [];

    const calendarEventEntityBadgeMap =
      await this.buildCalendarEventEntityBadgeMap({
        workspaceId,
        events,
        calendarChannels,
      });
    const calendarEventMaskMap =
      await this.calendarPrivacyService.getCalendarEventMaskMap({
        calendarEventIds: events.map((event) => event.id),
        workspaceId,
        currentWorkspaceMemberId,
      });

    return events
      .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
      .map((event) => {
        const participants = event.calendarEventParticipants.map((p) => ({
          calendarEventId: event.id,
          personId: p.personId ?? null,
          workspaceMemberId: p.workspaceMemberId ?? null,
          firstName:
            p.person?.name?.firstName ||
            p.workspaceMember?.name.firstName ||
            '',
          lastName:
            p.person?.name?.lastName || p.workspaceMember?.name.lastName || '',
          displayName:
            p.person?.name?.firstName ||
            p.person?.name?.lastName ||
            p.workspaceMember?.name.firstName ||
            p.workspaceMember?.name.lastName ||
            p.displayName ||
            p.handle ||
            '',
          avatarUrl: p.person?.avatarUrl || p.workspaceMember?.avatarUrl || '',
          handle: p.handle ?? '',
        }));

        const shouldMask = calendarEventMaskMap.get(event.id) ?? false;

        const visibility = shouldMask
          ? CalendarChannelVisibility.METADATA
          : CalendarChannelVisibility.SHARE_EVERYTHING;
        const eventEntityBadge = calendarEventEntityBadgeMap.get(event.id);

        return {
          ...omit(event, [
            'calendarEventParticipants',
            'calendarChannelEventAssociations',
          ]),
          title:
            visibility === CalendarChannelVisibility.METADATA
              ? FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED
              : (event.title ?? ''),
          description:
            visibility === CalendarChannelVisibility.METADATA
              ? null
              : (event.description ?? null),
          startsAt: event.startsAt as unknown as Date,
          endsAt: event.endsAt as unknown as Date,
          participants,
          visibility,
          location: event.location ?? null,
          conferenceSolution: event.conferenceSolution ?? null,
          conferenceLink: null,
          entityColor: eventEntityBadge?.color ?? null,
          entityName: eventEntityBadge?.name ?? null,
        };
      });
  }

  private async buildCalendarEventEntityBadgeMap({
    workspaceId,
    events,
    calendarChannels,
  }: {
    workspaceId: string;
    events: CalendarEventWorkspaceEntity[];
    calendarChannels: CalendarChannelEntity[];
  }): Promise<Map<string, InternalEntityBadgeInfo>> {
    if (events.length === 0 || calendarChannels.length === 0) {
      return new Map();
    }

    const connectedAccountIds = [
      ...new Set(
        calendarChannels
          .map((calendarChannel) => calendarChannel.connectedAccountId)
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
    const userById = new Map(users.map((user) => [user.id, user]));
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

    const workspaceMemberIds = [...workspaceMemberIdByUserId.values()];
    const fallbackEntityIdByWorkspaceMemberId = new Map(
      workspaceMemberIds.map((workspaceMemberId) => {
        const userId = [...workspaceMemberIdByUserId.entries()].find(
          ([, resolvedWorkspaceMemberId]) =>
            resolvedWorkspaceMemberId === workspaceMemberId,
        )?.[0];

        return [
          workspaceMemberId,
          userId != null ? (userById.get(userId)?.entityId ?? null) : null,
        ] as const;
      }),
    );

    const ownerEntityContexts =
      workspaceMemberIds.length > 0
        ? await this.workspaceMemberInternalEntityService.resolveContextsByWorkspaceMemberIds(
            {
              workspaceId,
              workspaceMemberIds,
              fallbackEntityIdByWorkspaceMemberId,
            },
          )
        : new Map<string, WorkspaceMemberInternalEntityContext>();

    const ownerEntityIds = [
      ...new Set(
        [...ownerEntityContexts.values()]
          .map((context) => context.currentEntityId)
          .filter(isDefined),
      ),
    ];

    if (ownerEntityIds.length === 0) {
      return new Map();
    }

    const internalEntityRepository =
      await this.globalWorkspaceOrmManager.getRepository<{
        id: string;
        color: string | null;
        name: string | null;
      }>(workspaceId, 'internalEntity', {
        shouldBypassPermissionChecks: true,
      });
    const internalEntities = await internalEntityRepository.find({
      where: {
        id: In(ownerEntityIds),
      },
      select: {
        id: true,
        color: true,
        name: true,
      },
    });

    const entityBadgeById = new Map(
      internalEntities.map((internalEntity) => [
        internalEntity.id,
        {
          color: internalEntity.color,
          name:
            typeof internalEntity.name === 'string' &&
            internalEntity.name.length > 0
              ? internalEntity.name
              : null,
        } satisfies InternalEntityBadgeInfo,
      ]),
    );

    const ownerEntityBadgeByCalendarChannelId = new Map(
      calendarChannels.map((calendarChannel) => {
        const userWorkspaceId = userWorkspaceIdByConnectedAccountId.get(
          calendarChannel.connectedAccountId,
        );
        const userId = isDefined(userWorkspaceId)
          ? userIdByUserWorkspaceId.get(userWorkspaceId)
          : undefined;
        const workspaceMemberId = isDefined(userId)
          ? workspaceMemberIdByUserId.get(userId)
          : undefined;
        const ownerEntityId = isDefined(workspaceMemberId)
          ? (ownerEntityContexts.get(workspaceMemberId)?.currentEntityId ??
            null)
          : null;

        return [
          calendarChannel.id,
          ownerEntityId != null
            ? (entityBadgeById.get(ownerEntityId) ?? null)
            : null,
        ] as const;
      }),
    );

    return new Map(
      events
        .map((event) => {
          const eventEntityBadge = event.calendarChannelEventAssociations
            .map((association) =>
              ownerEntityBadgeByCalendarChannelId.get(
                association.calendarChannelId,
              ),
            )
            .find(
              (badge): badge is InternalEntityBadgeInfo =>
                isDefined(badge) &&
                (isDefined(badge.color) || isDefined(badge.name)),
            );

          return isDefined(eventEntityBadge)
            ? ([event.id, eventEntityBadge] as const)
            : null;
        })
        .filter(
          (entry): entry is readonly [string, InternalEntityBadgeInfo] =>
            entry !== null,
        ),
    );
  }

  private extractStringField(
    record: Record<string, unknown>,
    fieldName: string,
  ) {
    const value = record[fieldName];

    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}
