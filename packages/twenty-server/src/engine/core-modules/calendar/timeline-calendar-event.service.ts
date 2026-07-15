import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import omit from 'lodash.omit';
import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
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
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type CalendarEventWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-event.workspace-entity';
import { type OpportunityWorkspaceEntity } from 'src/modules/opportunity/standard-objects/opportunity.workspace-entity';
import { type PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';
import { type WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';

@Injectable()
export class TimelineCalendarEventService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    @InjectRepository(CalendarChannelEntity)
    private readonly calendarChannelRepository: Repository<CalendarChannelEntity>,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
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
    workspaceId,
    page = 1,
    pageSize = TIMELINE_CALENDAR_EVENTS_DEFAULT_PAGE_SIZE,
    startDate,
    endDate,
  }: {
    currentWorkspaceMemberId: string;
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

        const [totalNumberOfCalendarEvents, paginatedIds] = await Promise.all([
          calendarEventRepository.count({ where: dateWhere }),
          calendarEventRepository.find({
            where: dateWhere,
            select: { id: true },
            skip: offset,
            take: pageSize,
            order: { startsAt: 'DESC' },
          }),
        ]);

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

        return { totalNumberOfCalendarEvents, timelineCalendarEvents };
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

    const workspaceMemberRepo =
      await this.globalWorkspaceOrmManager.getRepository<WorkspaceMemberWorkspaceEntity>(
        workspaceId,
        'workspaceMember',
        { shouldBypassPermissionChecks: true },
      );

    const currentMember = await workspaceMemberRepo.findOne({
      where: { id: currentWorkspaceMemberId },
      select: { userId: true },
    });

    const currentUserWorkspaceId = currentMember
      ? ((
          await this.userWorkspaceRepository.findOne({
            where: { userId: currentMember.userId, workspaceId },
            select: { id: true },
          })
        )?.id ?? null)
      : null;

    const connectedAccountIds = [
      ...new Set(calendarChannels.map((ch) => ch.connectedAccountId)),
    ];

    const ownedAccountIds =
      connectedAccountIds.length > 0 && currentUserWorkspaceId != null
        ? new Set(
            (
              await this.connectedAccountRepository.find({
                where: {
                  id: In(connectedAccountIds),
                  userWorkspaceId: currentUserWorkspaceId,
                },
                select: { id: true },
              })
            ).map((a) => a.id),
          )
        : new Set<string>();

    const calendarChannelMap = new Map(
      calendarChannels.map((ch) => [
        ch.id,
        {
          visibility: ch.visibility,
          isOwnedByCurrentUser: ownedAccountIds.has(ch.connectedAccountId),
        },
      ]),
    );

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

        const hasFullAccess = event.calendarChannelEventAssociations.some(
          (assoc) => {
            const ch = calendarChannelMap.get(assoc.calendarChannelId);

            return (
              ch?.visibility === 'SHARE_EVERYTHING' || ch?.isOwnedByCurrentUser
            );
          },
        );

        const visibility = hasFullAccess
          ? CalendarChannelVisibility.SHARE_EVERYTHING
          : CalendarChannelVisibility.METADATA;

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
        };
      });
  }
}
