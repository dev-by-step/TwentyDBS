import { buildInternalEntitySeed } from 'src/modules/internal-entity/__tests__/internal-entity-test.factory';
import { DEFAULT_INTERNAL_ENTITY_SEEDS } from 'src/modules/internal-entity/constants/internal-entity-seeds.constant';
import {
  buildWorkspaceSqlTableName,
  quoteSqlIdentifierOrThrow,
  resolveObjectTableNameOrThrow,
  validateUuidOrThrow,
} from 'src/modules/internal-entity/utils/internal-entity-command.utils';
import { resolveInternalEntitySeedId } from 'src/modules/internal-entity/utils/internal-entity-seeds.util';

const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('internal-entity-command.utils', () => {
  describe('validateUuidOrThrow', () => {
    it('should normalize a valid UUID', () => {
      expect(
        validateUuidOrThrow(WORKSPACE_ID.toUpperCase(), 'workspaceId'),
      ).toBe(WORKSPACE_ID);
    });

    it('should throw for an invalid UUID', () => {
      expect(() =>
        validateUuidOrThrow('workspace;DROP SCHEMA', 'workspaceId'),
      ).toThrow('workspaceId invalide: workspace;DROP SCHEMA');
    });
  });

  describe('buildWorkspaceSqlTableName', () => {
    it('should quote workspace schema and table identifiers', () => {
      expect(
        buildWorkspaceSqlTableName('workspace_abc123', 'opportunity'),
      ).toBe('"workspace_abc123"."opportunity"');
    });

    it('should reject unsafe SQL identifiers', () => {
      expect(() =>
        quoteSqlIdentifierOrThrow('workspace";DROP TABLE opportunity;--'),
      ).toThrow(
        'Identifiant SQL invalide: workspace";DROP TABLE opportunity;--',
      );
    });
  });

  describe('resolveInternalEntitySeedId', () => {
    it('should resolve an internal entity by seed key', () => {
      expect(
        resolveInternalEntitySeedId('WEKNOW', DEFAULT_INTERNAL_ENTITY_SEEDS),
      ).toBe(
        DEFAULT_INTERNAL_ENTITY_SEEDS.find((seed) => seed.name === 'WEKNOW')
          ?.id,
      );
    });

    it('should resolve an internal entity by seed name', () => {
      const customInternalEntitySeed = buildInternalEntitySeed({
        name: 'Custom Entity Display Name',
        color: '#000000',
      });

      expect(
        resolveInternalEntitySeedId('Custom Entity Display Name', [
          ...DEFAULT_INTERNAL_ENTITY_SEEDS,
          customInternalEntitySeed,
        ]),
      ).toBe(customInternalEntitySeed.id);
    });

    it('should resolve an internal entity by alias', () => {
      const customInternalEntitySeed = buildInternalEntitySeed({
        name: 'Custom Entity Display Name',
        color: '#000000',
        aliases: ['Legacy Entity Name'],
      });

      expect(
        resolveInternalEntitySeedId('legacy entity name', [
          ...DEFAULT_INTERNAL_ENTITY_SEEDS,
          customInternalEntitySeed,
        ]),
      ).toBe(customInternalEntitySeed.id);
    });

    it('should return null for missing entity names', () => {
      expect(
        resolveInternalEntitySeedId(null, DEFAULT_INTERNAL_ENTITY_SEEDS),
      ).toBeNull();
      expect(
        resolveInternalEntitySeedId('UNKNOWN', DEFAULT_INTERNAL_ENTITY_SEEDS),
      ).toBeNull();
    });
  });

  describe('resolveObjectTableNameOrThrow', () => {
    it('should resolve the physical table name from object metadata', async () => {
      const objectMetadataService = {
        findOneWithinWorkspace: jest.fn().mockResolvedValue({
          nameSingular: 'customThing',
          isCustom: true,
        }),
      };

      await expect(
        resolveObjectTableNameOrThrow({
          objectMetadataService: objectMetadataService as never,
          workspaceId: WORKSPACE_ID,
          nameSingular: 'customThing',
        }),
      ).resolves.toBe('_customThing');
    });

    it('should throw when object metadata cannot be found', async () => {
      const objectMetadataService = {
        findOneWithinWorkspace: jest.fn().mockResolvedValue(null),
      };

      await expect(
        resolveObjectTableNameOrThrow({
          objectMetadataService: objectMetadataService as never,
          workspaceId: WORKSPACE_ID,
          nameSingular: 'opportunity',
        }),
      ).rejects.toThrow(
        'Objet standard introuvable dans le workspace: opportunity',
      );
    });
  });
});
