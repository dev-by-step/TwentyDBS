import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CalendarPrivacyInterceptor } from 'src/engine/api/graphql/interceptors/calendar-privacy.interceptor';
import { TimelineCalendarEventResolver } from 'src/engine/core-modules/calendar/timeline-calendar-event.resolver';
import { TimelineCalendarEventService } from 'src/engine/core-modules/calendar/timeline-calendar-event.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { UserModule } from 'src/engine/core-modules/user/user.module';
import { CalendarCommonModule } from 'src/modules/calendar/common/calendar-common.module';
import { WorkspaceMemberInternalEntityModule } from 'src/modules/internal-entity/services/workspace-member-internal-entity.module';

@Module({
  imports: [
    CalendarCommonModule,
    UserModule,
    WorkspaceMemberInternalEntityModule,
    TypeOrmModule.forFeature([
      CalendarChannelEntity,
      ConnectedAccountEntity,
      UserEntity,
      UserWorkspaceEntity,
    ]),
  ],
  exports: [],
  providers: [
    TimelineCalendarEventResolver,
    TimelineCalendarEventService,
    CalendarPrivacyInterceptor,
  ],
})
export class TimelineCalendarEventModule {}
