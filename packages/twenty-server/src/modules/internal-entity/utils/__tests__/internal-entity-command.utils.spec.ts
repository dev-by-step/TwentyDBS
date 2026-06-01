import { INTERNAL_ENTITY_SEEDS } from 'src/modules/internal-entity/constants/internal-entity-seeds.constant';
import {
  buildWorkspaceSqlTableName,
  quoteSqlIdentifierOrThrow,
  resolveInternalEntitySeedId,
  resolveObjectTableNameOrThrow,
  validateUuidOrThrow,
} from 'src/modules/internal-entity/utils/internal-entity-command.utils';

const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';
const CUSTOM_ENTITY_ID = '550e8400-e29b-41d4-a716-446655440099';
const CUSTOM_ENTITY_KEY = 'TEST_INTERNAL_ENTITY_KEY';

describe('internal-entity-command.utils', () => {
  afterEach(() => {
    delete INTERNAL_ENTITY_SEEDS[CUSTOM_ENTITY_KEY];
  });

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
      ).toThrow('Invalid SQL identifier: workspace";DROP TABLE opportunity;--');
    });
  });

  describe('resolveInternalEntitySeedId', () => {
    it('should resolve an internal entity by seed key', () => {
      expect(resolveInternalEntitySeedId('WEKNOW')).toBe(
        INTERNAL_ENTITY_SEEDS.WEKNOW.id,
      );
    });

    it('should resolve an internal entity by seed name', () => {
      INTERNAL_ENTITY_SEEDS[CUSTOM_ENTITY_KEY] = {
        id: CUSTOM_ENTITY_ID,
        name: 'Custom Entity Display Name',
        color: '#000000',
      };

      expect(resolveInternalEntitySeedId('Custom Entity Display Name')).toBe(
        CUSTOM_ENTITY_ID,
      );
    });

    it('should return null for missing entity names', () => {
      expect(resolveInternalEntitySeedId(null)).toBeNull();
      expect(resolveInternalEntitySeedId('UNKNOWN')).toBeNull();
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
      ).rejects.toThrow('Standard object not found in workspace: opportunity');
    });
  });
});
