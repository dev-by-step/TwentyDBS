// Canonical normalization for InternalEntity identifiers. Use this anywhere
// an entity id flows from a less-trusted source (HTTP header, persisted column,
// user payload) so comparisons remain consistent across services.
export const normalizeOptionalEntityId = (
  entityId: unknown,
): string | null => {
  if (typeof entityId !== 'string') {
    return null;
  }

  const trimmed = entityId.trim();

  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.toLowerCase();
};
