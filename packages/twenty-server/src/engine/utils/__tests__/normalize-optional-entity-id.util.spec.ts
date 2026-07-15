import { normalizeOptionalEntityId } from 'src/engine/utils/normalize-optional-entity-id.util';

describe('normalizeOptionalEntityId', () => {
  it('returns null for non-string inputs', () => {
    expect(normalizeOptionalEntityId(undefined)).toBeNull();
    expect(normalizeOptionalEntityId(null)).toBeNull();
    expect(normalizeOptionalEntityId(123)).toBeNull();
    expect(normalizeOptionalEntityId({})).toBeNull();
    expect(normalizeOptionalEntityId([])).toBeNull();
  });

  it('returns null for blank strings', () => {
    expect(normalizeOptionalEntityId('')).toBeNull();
    expect(normalizeOptionalEntityId('   ')).toBeNull();
    expect(normalizeOptionalEntityId('\t\n')).toBeNull();
  });

  it('lowercases and trims valid entity ids', () => {
    expect(normalizeOptionalEntityId('ABC-123')).toBe('abc-123');
    expect(normalizeOptionalEntityId('  abc-123  ')).toBe('abc-123');
    expect(normalizeOptionalEntityId('A1B2-C3D4-E5F6')).toBe('a1b2-c3d4-e5f6');
  });
});
