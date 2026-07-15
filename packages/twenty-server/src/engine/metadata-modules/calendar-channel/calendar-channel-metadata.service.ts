import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { In, Repository } from 'typeorm';

import {
  CalendarChannelSyncStage,
  CalendarChannelVisibility,
} from 'twenty-shared/types';

import {
  CalendarChannelException,
  CalendarChannelExceptionCode,
} from 'src/engine/metadata-modules/calendar-channel/calendar-channel.exception';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { CalendarChannelDTO } from 'src/engine/metadata-modules/calendar-channel/dtos/calendar-channel.dto';
import { type UpdateCalendarChannelInputUpdates } from 'src/engine/metadata-modules/calendar-channel/dtos/update-calendar-channel.input';
import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { CalendarChannelEntityAccessService } from 'src/engine/metadata-modules/calendar-channel/services/calendar-channel-entity-access.service';
import { ConnectedAccountMetadataService } from 'src/engine/metadata-modules/connected-account/connected-account-metadata.service';
import { isDefined } from 'twenty-shared/utils';

@Injectable()
export class CalendarChannelMetadataService {
  constructor(
    @InjectRepository(CalendarChannelEntity)
    private readonly repository: Repository<CalendarChannelEntity>,
    private readonly connectedAccountMetadataService: ConnectedAccountMetadataService,
    private readonly calendarChannelEntityAccessService: CalendarChannelEntityAccessService,
  ) {}

  async findAll(workspaceId: string): Promise<CalendarChannelDTO[]> {
    return this.repository.find({ where: { workspaceId } });
  }

  async findByUserWorkspaceId({
    userWorkspaceId,
    workspaceId,
  }: {
    userWorkspaceId: string;
    workspaceId: string;
  }): Promise<CalendarChannelDTO[]> {
    const userAccountIds =
      await this.connectedAccountMetadataService.getUserConnectedAccountIds({
        userWorkspaceId,
        workspaceId,
      });

    return this.findByConnectedAccountIds({
      connectedAccountIds: userAccountIds,
      workspaceId,
    });
  }

  async findByConnectedAccountIdForUser({
    connectedAccountId,
    userWorkspaceId,
    workspaceId,
  }: {
    connectedAccountId: string;
    userWorkspaceId: string;
    workspaceId: string;
  }): Promise<CalendarChannelDTO[]> {
    await this.connectedAccountMetadataService.verifyOwnership({
      id: connectedAccountId,
      userWorkspaceId,
      workspaceId,
    });

    return this.findByConnectedAccountId({ connectedAccountId, workspaceId });
  }

  async findByConnectedAccountId({
    connectedAccountId,
    workspaceId,
  }: {
    connectedAccountId: string;
    workspaceId: string;
  }): Promise<CalendarChannelDTO[]> {
    return this.repository.find({
      where: { connectedAccountId, workspaceId },
    });
  }

  async findByConnectedAccountIds({
    connectedAccountIds,
    workspaceId,
  }: {
    connectedAccountIds: string[];
    workspaceId: string;
  }): Promise<CalendarChannelDTO[]> {
    if (connectedAccountIds.length === 0) {
      return [];
    }

    return this.repository.find({
      where: { connectedAccountId: In(connectedAccountIds), workspaceId },
    });
  }

  async findById({
    id,
    workspaceId,
  }: {
    id: string;
    workspaceId: string;
  }): Promise<CalendarChannelDTO | null> {
    return this.repository.findOne({ where: { id, workspaceId } });
  }

  async verifyOwnership({
    id,
    userWorkspaceId,
    workspaceId,
  }: {
    id: string;
    userWorkspaceId: string;
    workspaceId: string;
  }): Promise<CalendarChannelEntity> {
    const calendarChannel = await this.repository.findOne({
      where: { id, workspaceId },
    });

    if (!calendarChannel) {
      throw new CalendarChannelException(
        `Calendar channel ${id} not found`,
        CalendarChannelExceptionCode.CALENDAR_CHANNEL_NOT_FOUND,
      );
    }

    const userAccountIds =
      await this.connectedAccountMetadataService.getUserConnectedAccountIds({
        userWorkspaceId,
        workspaceId,
      });

    if (!userAccountIds.includes(calendarChannel.connectedAccountId)) {
      throw new CalendarChannelException(
        `Calendar channel ${id} does not belong to user workspace ${userWorkspaceId}`,
        CalendarChannelExceptionCode.CALENDAR_CHANNEL_OWNERSHIP_VIOLATION,
      );
    }

    return calendarChannel;
  }

  async create(
    data: Partial<CalendarChannelEntity> & {
      workspaceId: string;
      handle: string;
      connectedAccountId: string;
      visibility: CalendarChannelVisibility;
      syncStage: CalendarChannelSyncStage;
    },
  ): Promise<CalendarChannelDTO> {
    const entity = this.repository.create(data);

    return this.repository.save(entity);
  }

  async update({
    id,
    workspaceId,
    data,
  }: {
    id: string;
    workspaceId: string;
    data: Partial<CalendarChannelEntity>;
  }): Promise<CalendarChannelDTO> {
    await this.repository.update(
      { id, workspaceId },
      data as Record<string, unknown>,
    );

    return this.repository.findOneOrFail({ where: { id, workspaceId } });
  }

  async buildValidatedUpdate({
    calendarChannel,
    workspaceId,
    workspaceMemberId,
    user,
    update,
  }: {
    calendarChannel: Pick<
      CalendarChannelEntity,
      'visibility' | 'visibleInternalEntityIds'
    >;
    workspaceId: string;
    workspaceMemberId: string;
    user: Pick<AuthContextUser, 'entityId' | 'canAccessFullAdminPanel'>;
    update: UpdateCalendarChannelInputUpdates;
  }): Promise<UpdateCalendarChannelInputUpdates> {
    const nextVisibility = update.visibility ?? calendarChannel.visibility;
    const shouldValidateVisibleInternalEntityIds =
      isDefined(update.visibleInternalEntityIds) ||
      nextVisibility === CalendarChannelVisibility.METADATA;

    if (!shouldValidateVisibleInternalEntityIds) {
      return update;
    }

    const requestedVisibleInternalEntityIds =
      update.visibleInternalEntityIds ??
      calendarChannel.visibleInternalEntityIds ??
      [];
    const validatedVisibleInternalEntityIds =
      await this.calendarChannelEntityAccessService.resolveVisibleInternalEntityIds(
        {
          workspaceId,
          workspaceMemberId,
          fallbackEntityId: user.entityId,
          canAccessFullAdminPanel: user.canAccessFullAdminPanel,
          requestedVisibleInternalEntityIds,
          shouldDefaultToPrimaryEntity:
            nextVisibility === CalendarChannelVisibility.METADATA,
        },
      );

    return {
      ...update,
      visibleInternalEntityIds: validatedVisibleInternalEntityIds,
    };
  }

  async delete({
    id,
    workspaceId,
  }: {
    id: string;
    workspaceId: string;
  }): Promise<CalendarChannelDTO> {
    const calendarChannel = await this.repository.findOneOrFail({
      where: { id, workspaceId },
    });

    await this.repository.delete({ id, workspaceId });

    return calendarChannel;
  }
}
