import { buildInternalEntitySeed } from 'src/modules/internal-entity/__tests__/internal-entity-test.factory';
import {
  DEFAULT_INTERNAL_ENTITY_SEEDS,
  INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME,
} from 'src/modules/internal-entity/constants/internal-entity-seeds.constant';
import { InternalEntityConfigurationService } from 'src/modules/internal-entity/services/internal-entity-configuration.service';

describe('InternalEntityConfigurationService', () => {
  const originalInternalEntitySeedsEnv =
    process.env[INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME];

  afterEach(() => {
    if (originalInternalEntitySeedsEnv === undefined) {
      delete process.env[INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME];
    } else {
      process.env[INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME] =
        originalInternalEntitySeedsEnv;
    }
  });

  it('should return default seeds when no override is configured', () => {
    delete process.env[INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME];

    const service = new InternalEntityConfigurationService();

    expect(service.getInternalEntitySeeds()).toStrictEqual(
      DEFAULT_INTERNAL_ENTITY_SEEDS,
    );
  });

  it('should resolve seeds from env override', () => {
    const customInternalEntity = buildInternalEntitySeed({
      name: 'CUSTOM_ENTITY',
      color: '#123456',
      aliases: ['Custom Legacy'],
    });

    process.env[INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME] = JSON.stringify([
      customInternalEntity,
    ]);

    const service = new InternalEntityConfigurationService();

    expect(service.getInternalEntitySeeds()).toStrictEqual([
      {
        ...customInternalEntity,
        color: customInternalEntity.color.toUpperCase(),
        id: customInternalEntity.id.toLowerCase(),
      },
    ]);
    expect(service.resolveInternalEntityId(customInternalEntity.name)).toBe(
      customInternalEntity.id.toLowerCase(),
    );
    expect(service.resolveInternalEntityId('custom legacy')).toBe(
      customInternalEntity.id.toLowerCase(),
    );
  });

  it('should prefer TwentyConfigService over direct process env', () => {
    const configuredInternalEntity = buildInternalEntitySeed({
      name: 'CONFIG_SERVICE_ENTITY',
      color: '#abcdef',
    });
    const processEnvInternalEntity = buildInternalEntitySeed({
      name: 'PROCESS_ENV_ENTITY',
      color: '#123456',
    });

    process.env[INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME] = JSON.stringify([
      processEnvInternalEntity,
    ]);

    const service = new InternalEntityConfigurationService({
      get: jest
        .fn()
        .mockReturnValue(JSON.stringify([configuredInternalEntity])),
    } as never);

    expect(service.getInternalEntitySeeds()).toStrictEqual([
      {
        ...configuredInternalEntity,
        color: configuredInternalEntity.color.toUpperCase(),
        id: configuredInternalEntity.id.toLowerCase(),
      },
    ]);
  });

  it('should resolve seeds from object env override', () => {
    const customInternalEntity = buildInternalEntitySeed({
      name: 'OBJECT_CONFIG_ENTITY',
      color: '#654321',
    });

    process.env[INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME] = JSON.stringify({
      entities: [customInternalEntity],
    });

    const service = new InternalEntityConfigurationService();

    expect(service.getInternalEntitySeeds()).toStrictEqual([
      {
        ...customInternalEntity,
        color: customInternalEntity.color.toUpperCase(),
        id: customInternalEntity.id.toLowerCase(),
      },
    ]);
  });

  it('should throw on invalid env override payload', () => {
    process.env[INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME] = '{"entities":"invalid"}';

    const service = new InternalEntityConfigurationService();

    expect(() => service.getInternalEntitySeeds()).toThrow(
      `${INTERNAL_ENTITY_SEEDS_ENV_VAR_NAME} invalide`,
    );
  });
});
