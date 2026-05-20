import { Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

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

  getInternalEntitySeeds(): InternalEntitySeed[] {
    if (isDefined(this.cachedInternalEntitySeeds)) {
      return cloneInternalEntitySeeds(this.cachedInternalEntitySeeds);
    }

    this.cachedInternalEntitySeeds = this.loadInternalEntitySeeds();

    return cloneInternalEntitySeeds(this.cachedInternalEntitySeeds);
  }

  resolveInternalEntityId(entityName: string | null): string | null {
    return resolveInternalEntitySeedId(entityName, this.getInternalEntitySeeds());
  }

  private loadInternalEntitySeeds(): InternalEntitySeed[] {
    const rawInternalEntitySeeds = process.env[INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME];

    if (!isDefined(rawInternalEntitySeeds) || rawInternalEntitySeeds.length === 0) {
      return cloneInternalEntitySeeds(DEFAULT_INTERNAL_ENTITY_SEEDS);
    }

    try {
      const parsedInternalEntitySeeds = JSON.parse(rawInternalEntitySeeds);

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
}
