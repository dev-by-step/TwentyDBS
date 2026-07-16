import {
  buildRenameLegacyInternalEntityFieldsQuery,
  INTERNAL_ENTITY_RELATION_HOST_OBJECT_NAMES,
  LEGACY_INTERNAL_ENTITY_RELATION_FIELD_NAMES,
} from 'src/modules/internal-entity/utils/internal-entity-legacy-field-migration.util';

describe('internal entity legacy field migration SQL builder', () => {
  it('renames legacy relation field names to internalEntity', () => {
    const query = buildRenameLegacyInternalEntityFieldsQuery();

    expect(query).toContain(`SET name = 'internalEntity'`);
    expect(query).toContain(`field."workspaceId" = $1`);
    expect(query).toContain(`field.type = 'RELATION'`);
    expect(query).toContain(`field.name IN ('entiteInterne')`);
  });

  it('scopes the rename to the known host objects', () => {
    const query = buildRenameLegacyInternalEntityFieldsQuery();

    for (const hostObjectName of INTERNAL_ENTITY_RELATION_HOST_OBJECT_NAMES) {
      expect(query).toContain(`'${hostObjectName}'`);
    }
  });

  it('never renames when an internalEntity field already exists on the object (idempotence)', () => {
    const query = buildRenameLegacyInternalEntityFieldsQuery();

    expect(query).toContain('NOT EXISTS');
    expect(query).toContain(`existing.name = 'internalEntity'`);
  });

  it('returns the renamed object names for logging and cache invalidation', () => {
    const query = buildRenameLegacyInternalEntityFieldsQuery();

    expect(query).toContain(
      `RETURNING object."nameSingular" AS "objectNameSingular"`,
    );
  });

  it('only contains safe camelCase identifiers in its constants', () => {
    for (const name of [
      ...LEGACY_INTERNAL_ENTITY_RELATION_FIELD_NAMES,
      ...INTERNAL_ENTITY_RELATION_HOST_OBJECT_NAMES,
    ]) {
      expect(name).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
    }
  });
});
