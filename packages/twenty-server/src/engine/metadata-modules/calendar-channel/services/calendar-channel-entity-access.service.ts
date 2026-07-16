import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import {
  CalendarChannelException,
  CalendarChannelExceptionCode,
} from 'src/engine/metadata-modules/calendar-channel/calendar-channel.exception';
import { normalizeOptionalEntityId } from 'src/engine/utils/normalize-optional-entity-id.util';
import { WorkspaceMemberInternalEntityService } from 'src/modules/internal-entity/services/workspace-member-internal-entity.service';

@Injectable()
export class CalendarChannelEntityAccessService {
  constructor(
    private readonly workspaceMemberInternalEntityService: WorkspaceMemberInternalEntityService,
  ) {}

  async resolveVisibleInternalEntityIds({
    workspaceId,
    workspaceMemberId,
    fallbackEntityId,
    canAccessFullAdminPanel,
    requestedVisibleInternalEntityIds,
    shouldDefaultToPrimaryEntity,
  }: {
    workspaceId: string;
    workspaceMemberId?: string | null;
    fallbackEntityId?: string | null;
    canAccessFullAdminPanel: boolean;
    requestedVisibleInternalEntityIds?: string[];
    shouldDefaultToPrimaryEntity: boolean;
  }): Promise<string[]> {
    const normalizedRequestedVisibleInternalEntityIds = [
      ...new Set(
        (requestedVisibleInternalEntityIds ?? [])
          .map(normalizeOptionalEntityId)
          .filter(isDefined),
      ),
    ];

    if (
      normalizedRequestedVisibleInternalEntityIds.length === 0 &&
      !shouldDefaultToPrimaryEntity
    ) {
      return [];
    }

    const { manageableEntityIds, primaryEntityId } =
      await this.workspaceMemberInternalEntityService.resolveManageableEntityAccess(
        {
          workspaceId,
          workspaceMemberId,
          fallbackEntityId,
          canAccessFullAdminPanel,
        },
      );

    if (normalizedRequestedVisibleInternalEntityIds.length === 0) {
      return isDefined(primaryEntityId)
        ? [primaryEntityId]
        : manageableEntityIds.slice(0, 1);
    }

    const unmanageableVisibleInternalEntityIds =
      normalizedRequestedVisibleInternalEntityIds.filter(
        (visibleInternalEntityId) =>
          !manageableEntityIds.includes(visibleInternalEntityId),
      );

    if (unmanageableVisibleInternalEntityIds.length > 0) {
      throw new CalendarChannelException(
        `Cannot grant calendar event details to unmanaged internal entities: ${unmanageableVisibleInternalEntityIds.join(
          ', ',
        )}`,
        CalendarChannelExceptionCode.INVALID_CALENDAR_CHANNEL_INPUT,
      );
    }

    return normalizedRequestedVisibleInternalEntityIds;
  }
}
