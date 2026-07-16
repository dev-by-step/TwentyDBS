import { Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

export type InternalEntityScopeCacheKeyParams = {
  workspaceId: string;
  workspaceMemberId: string;
  entityIds: string[];
  objectName: string;
};

type CachedIds = {
  ids: string[];
  expiresAt: number;
};

const READABLE_IDS_CACHE_TTL_MS = 30_000;

@Injectable()
export class InternalEntityScopeCacheService {
  private readonly logger = new Logger(InternalEntityScopeCacheService.name);

  private readonly readableIdsCache = new Map<string, CachedIds>();

  getReadableIds(
    params: InternalEntityScopeCacheKeyParams,
  ): string[] | undefined {
    const key = this.buildReadableIdsCacheKey(params);
    const cached = this.readableIdsCache.get(key);

    if (!isDefined(cached)) {
      return undefined;
    }

    if (cached.expiresAt <= Date.now()) {
      this.readableIdsCache.delete(key);

      return undefined;
    }

    return cached.ids;
  }

  setReadableIds(
    params: InternalEntityScopeCacheKeyParams,
    ids: string[],
  ): void {
    const key = this.buildReadableIdsCacheKey(params);

    this.readableIdsCache.set(key, {
      ids,
      expiresAt: Date.now() + READABLE_IDS_CACHE_TTL_MS,
    });
  }

  invalidateWorkspaceCache(workspaceId: string): void {
    const prefix = `${workspaceId}::`;

    for (const key of this.readableIdsCache.keys()) {
      if (key.startsWith(prefix)) {
        this.readableIdsCache.delete(key);
      }
    }
  }

  private buildReadableIdsCacheKey(
    params: InternalEntityScopeCacheKeyParams,
  ): string {
    const entityIdsHash = [...params.entityIds].sort().join(',');

    return `${params.workspaceId}::${params.workspaceMemberId}::${entityIdsHash}::${params.objectName}`;
  }
}
