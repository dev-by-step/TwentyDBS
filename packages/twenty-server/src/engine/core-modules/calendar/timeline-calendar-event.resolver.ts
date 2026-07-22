import { UseGuards, UseInterceptors } from '@nestjs/common';
import { Args, ArgsType, Field, Int, Query } from '@nestjs/graphql';

import { IsOptional, Max } from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { TIMELINE_CALENDAR_EVENTS_MAX_PAGE_SIZE } from 'src/engine/core-modules/calendar/constants/calendar.constants';
import { TimelineCalendarEventsWithTotalDTO } from 'src/engine/core-modules/calendar/dtos/timeline-calendar-events-with-total.dto';
import { TimelineCalendarEventService } from 'src/engine/core-modules/calendar/timeline-calendar-event.service';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { CalendarPrivacyInterceptor } from 'src/engine/api/graphql/interceptors/calendar-privacy.interceptor';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';

@ArgsType()
class GetTimelineCalendarEventsFromPersonIdArgs {
  @Field(() => UUIDScalarType)
  personId: string;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  @Max(TIMELINE_CALENDAR_EVENTS_MAX_PAGE_SIZE)
  pageSize: number;
}

@ArgsType()
class GetTimelineCalendarEventsFromCompanyIdArgs {
  @Field(() => UUIDScalarType)
  companyId: string;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  @Max(TIMELINE_CALENDAR_EVENTS_MAX_PAGE_SIZE)
  pageSize: number;
}

@ArgsType()
class GetTimelineCalendarEventsFromOpportunityIdArgs {
  @Field(() => UUIDScalarType)
  opportunityId: string;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  @Max(TIMELINE_CALENDAR_EVENTS_MAX_PAGE_SIZE)
  pageSize: number;
}

@ArgsType()
class GetGroupTimelineCalendarEventsArgs {
  @Field(() => Int)
  page: number;

  @Field(() => Int)
  @Max(TIMELINE_CALENDAR_EVENTS_MAX_PAGE_SIZE)
  pageSize: number;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  startDate?: Date;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  endDate?: Date;

  // IMP : filtre explicite « voir uniquement cette entité » du Calendrier
  // Groupe — fourni par le client, indépendant de l'en-tête
  // x-active-internal-entity-id (qui ne pilote que le masquage, voir
  // requestedActiveEntityId ci-dessous).
  @Field(() => UUIDScalarType, { nullable: true })
  @IsOptional()
  entityFilterId?: string;
}

@UseGuards(WorkspaceAuthGuard, CustomPermissionGuard)
@UseInterceptors(CalendarPrivacyInterceptor)
@CoreResolver(() => TimelineCalendarEventsWithTotalDTO)
export class TimelineCalendarEventResolver {
  constructor(
    private readonly timelineCalendarEventService: TimelineCalendarEventService,
  ) {}

  @Query(() => TimelineCalendarEventsWithTotalDTO)
  async getTimelineCalendarEventsFromPersonId(
    @Args()
    { personId, page, pageSize }: GetTimelineCalendarEventsFromPersonIdArgs,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ) {
    const timelineCalendarEvents =
      await this.timelineCalendarEventService.getCalendarEventsFromPersonIds({
        currentWorkspaceMemberId: workspaceMemberId,
        personIds: [personId],
        workspaceId: workspace.id,
        page,
        pageSize,
      });

    return timelineCalendarEvents;
  }

  @Query(() => TimelineCalendarEventsWithTotalDTO)
  async getTimelineCalendarEventsFromCompanyId(
    @Args()
    { companyId, page, pageSize }: GetTimelineCalendarEventsFromCompanyIdArgs,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ) {
    const timelineCalendarEvents =
      await this.timelineCalendarEventService.getCalendarEventsFromCompanyId({
        currentWorkspaceMemberId: workspaceMemberId,
        companyId,
        workspaceId: workspace.id,
        page,
        pageSize,
      });

    return timelineCalendarEvents;
  }

  @Query(() => TimelineCalendarEventsWithTotalDTO)
  async getTimelineCalendarEventsFromOpportunityId(
    @Args()
    {
      opportunityId,
      page,
      pageSize,
    }: GetTimelineCalendarEventsFromOpportunityIdArgs,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ) {
    return this.timelineCalendarEventService.getCalendarEventsFromOpportunityId(
      {
        currentWorkspaceMemberId: workspaceMemberId,
        opportunityId,
        workspaceId: workspace.id,
        page,
        pageSize,
      },
    );
  }

  @Query(() => TimelineCalendarEventsWithTotalDTO)
  async getGroupTimelineCalendarEvents(
    @Args()
    {
      page,
      pageSize,
      startDate,
      endDate,
      entityFilterId,
    }: GetGroupTimelineCalendarEventsArgs,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ) {
    const authContext = getWorkspaceAuthContext();
    // Distingue Ma Société de Vue Groupe : une entité active restreint
    // l'arbitrage masqué/visible à cette seule entité, la Vue Groupe (en-tête
    // absent) couvre toutes les entités d'appartenance du spectateur.
    const requestedActiveEntityId = isUserAuthContext(authContext)
      ? authContext.activeInternalEntityId
      : undefined;

    return this.timelineCalendarEventService.getGroupCalendarEvents({
      currentWorkspaceMemberId: workspaceMemberId,
      requestedActiveEntityId,
      entityFilterId,
      workspaceId: workspace.id,
      page,
      pageSize,
      startDate,
      endDate,
    });
  }
}
