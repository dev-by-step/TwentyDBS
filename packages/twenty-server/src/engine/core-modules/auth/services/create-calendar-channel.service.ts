import { Injectable } from '@nestjs/common';

import { v4 } from 'uuid';
import { EntityManager } from 'typeorm';

import {
  CalendarChannelSyncStage,
  CalendarChannelSyncStatus,
  CalendarChannelVisibility,
} from 'twenty-shared/types';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { CalendarChannelEntityAccessService } from 'src/engine/metadata-modules/calendar-channel/services/calendar-channel-entity-access.service';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';

export type CreateCalendarChannelInput = {
  workspaceId: string;
  connectedAccountId: string;
  handle: string;
  calendarVisibility?: CalendarChannelVisibility;
  visibleInternalEntityIds?: string[];
  skipMessageChannelConfiguration?: boolean;
  workspaceMemberId?: string;
  fallbackEntityId?: string | null;
  canAccessFullAdminPanel?: boolean;
  transactionManager: EntityManager;
};

@Injectable()
export class CreateCalendarChannelService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly calendarChannelEntityAccessService: CalendarChannelEntityAccessService,
  ) {}

  async createCalendarChannel(
    input: CreateCalendarChannelInput,
  ): Promise<string> {
    const {
      workspaceId,
      connectedAccountId,
      handle,
      calendarVisibility,
      visibleInternalEntityIds,
      skipMessageChannelConfiguration,
      workspaceMemberId,
      fallbackEntityId,
      canAccessFullAdminPanel,
      transactionManager,
    } = input;

    const authContext = buildSystemAuthContext(workspaceId);
    const visibility =
      calendarVisibility || CalendarChannelVisibility.SHARE_EVERYTHING;
    const validatedVisibleInternalEntityIds =
      await this.calendarChannelEntityAccessService.resolveVisibleInternalEntityIds(
        {
          workspaceId,
          workspaceMemberId,
          fallbackEntityId,
          canAccessFullAdminPanel: canAccessFullAdminPanel ?? false,
          requestedVisibleInternalEntityIds: visibleInternalEntityIds,
          shouldDefaultToPrimaryEntity:
            visibility === CalendarChannelVisibility.METADATA,
        },
      );

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const newCalendarChannelId = v4();

        await transactionManager.getRepository(CalendarChannelEntity).save({
          id: newCalendarChannelId,
          connectedAccountId,
          handle,
          visibility,
          visibleInternalEntityIds: validatedVisibleInternalEntityIds,
          syncStatus: skipMessageChannelConfiguration
            ? CalendarChannelSyncStatus.ONGOING
            : CalendarChannelSyncStatus.NOT_SYNCED,
          syncStage: skipMessageChannelConfiguration
            ? CalendarChannelSyncStage.CALENDAR_EVENT_LIST_FETCH_PENDING
            : CalendarChannelSyncStage.PENDING_CONFIGURATION,
          workspaceId,
        } as CalendarChannelEntity);

        return newCalendarChannelId;
      },
      authContext,
    );
  }
}
