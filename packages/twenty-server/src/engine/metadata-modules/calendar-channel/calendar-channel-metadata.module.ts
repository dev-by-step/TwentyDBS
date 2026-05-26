import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FeatureFlagModule } from 'src/engine/core-modules/feature-flag/feature-flag.module';
import { CalendarChannelMetadataService } from 'src/engine/metadata-modules/calendar-channel/calendar-channel-metadata.service';
import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { CalendarChannelGraphqlApiExceptionInterceptor } from 'src/engine/metadata-modules/calendar-channel/interceptors/calendar-channel-graphql-api-exception.interceptor';
import { CalendarChannelResolver } from 'src/engine/metadata-modules/calendar-channel/resolvers/calendar-channel.resolver';
import { CalendarChannelEntityAccessService } from 'src/engine/metadata-modules/calendar-channel/services/calendar-channel-entity-access.service';
import { ConnectedAccountMetadataModule } from 'src/engine/metadata-modules/connected-account/connected-account-metadata.module';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { WorkspaceMemberInternalEntityModule } from 'src/modules/internal-entity/services/workspace-member-internal-entity.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CalendarChannelEntity]),
    PermissionsModule,
    FeatureFlagModule,
    ConnectedAccountMetadataModule,
    WorkspaceMemberInternalEntityModule,
  ],
  providers: [
    CalendarChannelMetadataService,
    CalendarChannelEntityAccessService,
    CalendarChannelResolver,
    CalendarChannelGraphqlApiExceptionInterceptor,
  ],
  exports: [CalendarChannelMetadataService, CalendarChannelEntityAccessService],
})
export class CalendarChannelMetadataModule {}
