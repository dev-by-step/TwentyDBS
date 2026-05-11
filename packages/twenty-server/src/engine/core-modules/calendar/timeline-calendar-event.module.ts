import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CalendarPrivacyInterceptor } from 'src/engine/api/graphql/interceptors/calendar-privacy.interceptor';
import { TimelineCalendarEventResolver } from 'src/engine/core-modules/calendar/timeline-calendar-event.resolver';
import { TimelineCalendarEventService } from 'src/engine/core-modules/calendar/timeline-calendar-event.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { UserModule } from 'src/engine/core-modules/user/user.module';
import { CalendarCommonModule } from 'src/modules/calendar/common/calendar-common.module';

@Module({
  imports: [
    CalendarCommonModule,
    UserModule,
    TypeOrmModule.forFeature([
      CalendarChannelEntity,
      ConnectedAccountEntity,
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
