import { Injectable, Logger, Optional } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import {
  DEFAULT_INTERNAL_ENTITY_SEEDS,
  INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME,
  type InternalEntitySeed,
} from 'src/modules/internal-entity/constants/internal-entity-seeds.constant';
import {
  cloneInternalEntitySeeds,
  resolveInternalEntitySeedId,
  validateInternalEntitySeedsOrThrow,
} from 'src/modules/internal-entity/utils/internal-entity-seeds.util';

@Injectable()
export class InternalEntityConfigurationService {
  private readonly logger = new Logger(InternalEntityConfigurationService.name);
  private cachedInternalEntitySeeds: InternalEntitySeed[] | null = null;

  constructor(
    @Optional()
    private readonly twentyConfigService?: TwentyConfigService,
  ) {}

  getInternalEntitySeeds(): InternalEntitySeed[] {
    if (isDefined(this.cachedInternalEntitySeeds)) {
      return cloneInternalEntitySeeds(this.cachedInternalEntitySeeds);
    }

    this.cachedInternalEntitySeeds = this.loadInternalEntitySeeds();

    return cloneInternalEntitySeeds(this.cachedInternalEntitySeeds);
  }

  resolveInternalEntityId(entityName: string | null): string | null {
    return resolveInternalEntitySeedId(
      entityName,
      this.getInternalEntitySeeds(),
    );
  }

  private loadInternalEntitySeeds(): InternalEntitySeed[] {
    const rawInternalEntitySeeds = this.getRawInternalEntitySeeds();

    if (
      !isDefined(rawInternalEntitySeeds) ||
      (typeof rawInternalEntitySeeds === 'string' &&
        rawInternalEntitySeeds.trim().length === 0)
    ) {
      return cloneInternalEntitySeeds(DEFAULT_INTERNAL_ENTITY_SEEDS);
    }

    try {
      const parsedInternalEntitySeeds =
        typeof rawInternalEntitySeeds === 'string'
          ? JSON.parse(rawInternalEntitySeeds)
          : rawInternalEntitySeeds;

      return validateInternalEntitySeedsOrThrow(parsedInternalEntitySeeds);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Impossible de charger ${INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME}: ${errorMessage}`,
      );

      throw new Error(
        `${INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME} invalide: ${errorMessage}`,
      );
    }
  }

  private getRawInternalEntitySeeds(): unknown {
    return (
      this.twentyConfigService?.get('INTERNAL_ENTITY_SEEDS') ??
      process.env[INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME]
    );
  }
}
