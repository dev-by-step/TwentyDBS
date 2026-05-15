import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserRoleModule } from 'src/engine/metadata-modules/user-role/user-role.module';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { CalendarCommonModule } from 'src/modules/calendar/common/calendar-common.module';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { CalendarEventDeleteManyPreQueryHook } from 'src/modules/calendar/common/query-hooks/calendar-event/calendar-event-delete-many.pre-query.hook';
import { CalendarEventDeleteOnePreQueryHook } from 'src/modules/calendar/common/query-hooks/calendar-event/calendar-event-delete-one.pre-query.hook';
import { CalendarEventCreateManyPreQueryHook } from 'src/modules/calendar/common/query-hooks/calendar-event/calendar-event-create-many.pre-query.hook';
import { CalendarEventCreateOnePreQueryHook } from 'src/modules/calendar/common/query-hooks/calendar-event/calendar-event-create-one.pre-query.hook';
import { CalendarEventDestroyManyPreQueryHook } from 'src/modules/calendar/common/query-hooks/calendar-event/calendar-event-destroy-many.pre-query.hook';
import { CalendarEventDestroyOnePreQueryHook } from 'src/modules/calendar/common/query-hooks/calendar-event/calendar-event-destroy-one.pre-query.hook';
import { CalendarEventFindManyPostQueryHook } from 'src/modules/calendar/common/query-hooks/calendar-event/calendar-event-find-many.post-query.hook';
import { CalendarEventFindOnePostQueryHook } from 'src/modules/calendar/common/query-hooks/calendar-event/calendar-event-find-one.post-query.hook';
import { CalendarEventRestoreManyPreQueryHook } from 'src/modules/calendar/common/query-hooks/calendar-event/calendar-event-restore-many.pre-query.hook';
import { CalendarEventRestoreOnePreQueryHook } from 'src/modules/calendar/common/query-hooks/calendar-event/calendar-event-restore-one.pre-query.hook';
import { CalendarEventUpdateManyPreQueryHook } from 'src/modules/calendar/common/query-hooks/calendar-event/calendar-event-update-many.pre-query.hook';
import { CalendarEventUpdateOnePreQueryHook } from 'src/modules/calendar/common/query-hooks/calendar-event/calendar-event-update-one.pre-query.hook';
import { ApplyCalendarEventsVisibilityRestrictionsService } from 'src/modules/calendar/common/query-hooks/calendar-event/services/apply-calendar-events-visibility-restrictions.service';
import { CalendarEventMutationPermissionService } from 'src/modules/calendar/common/query-hooks/calendar-event/services/calendar-event-mutation-permission.service';

@Module({
  imports: [
    CalendarCommonModule,
    GlobalWorkspaceDataSourceModule,
    UserRoleModule,
    TypeOrmModule.forFeature([
      CalendarChannelEntity,
      ConnectedAccountEntity,
      UserEntity,
      UserWorkspaceEntity,
    ]),
  ],
  providers: [
    ApplyCalendarEventsVisibilityRestrictionsService,
    CalendarEventMutationPermissionService,
    CalendarEventCreateOnePreQueryHook,
    CalendarEventCreateManyPreQueryHook,
    CalendarEventUpdateOnePreQueryHook,
    CalendarEventDeleteOnePreQueryHook,
    CalendarEventDestroyOnePreQueryHook,
    CalendarEventRestoreOnePreQueryHook,
    CalendarEventUpdateManyPreQueryHook,
    CalendarEventDeleteManyPreQueryHook,
    CalendarEventDestroyManyPreQueryHook,
    CalendarEventRestoreManyPreQueryHook,
    CalendarEventFindOnePostQueryHook,
    CalendarEventFindManyPostQueryHook,
  ],
})
export class CalendarQueryHookModule {}
