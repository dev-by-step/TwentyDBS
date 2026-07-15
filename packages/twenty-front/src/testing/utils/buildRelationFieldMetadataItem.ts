import { faker } from '@faker-js/faker';

import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type FieldMetadataItemRelation } from '@/object-metadata/types/FieldMetadataItemRelation';
import { FieldMetadataType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { RelationType } from '~/generated-metadata/graphql';

type RelationTargetObjectMetadata = {
  id: string;
  nameSingular: string;
  namePlural?: string;
};

type BuildRelationFieldMetadataItemOverrides = Partial<FieldMetadataItem> & {
  relationTargetObjectMetadata?: RelationTargetObjectMetadata;
};

const buildRelation = (
  target: RelationTargetObjectMetadata,
): FieldMetadataItemRelation => ({
  type: RelationType.MANY_TO_ONE,
  sourceFieldMetadata: { id: faker.string.uuid(), name: 'source' },
  targetFieldMetadata: {
    id: faker.string.uuid(),
    name: 'target',
    isCustom: false,
  },
  sourceObjectMetadata: {
    id: faker.string.uuid(),
    nameSingular: 'source',
    namePlural: 'sources',
  },
  targetObjectMetadata: {
    id: target.id,
    nameSingular: target.nameSingular,
    namePlural: target.namePlural ?? `${target.nameSingular}s`,
  },
});

/**
 * Builds a complete relation `FieldMetadataItem` for tests.
 *
 * Defaults to a randomly generated UUID so each call is isolated ; pass an `id`
 * (and `name`) override when an assertion relies on a stable value. Provide
 * `relationTargetObjectMetadata` to attach a fully shaped relation, or override
 * `relation` / `settings` directly.
 */
export const buildRelationFieldMetadataItem = ({
  relationTargetObjectMetadata,
  ...overrides
}: BuildRelationFieldMetadataItemOverrides = {}): FieldMetadataItem => {
  const id = overrides.id ?? faker.string.uuid();
  const name = overrides.name ?? id;

  return {
    id,
    universalIdentifier: id,
    label: name,
    name,
    type: FieldMetadataType.RELATION,
    isNullable: true,
    isActive: true,
    isSystem: false,
    isCustom: false,
    defaultValue: null,
    options: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    morphRelations: null,
    relation: isDefined(relationTargetObjectMetadata)
      ? buildRelation(relationTargetObjectMetadata)
      : null,
    settings: null,
    ...overrides,
  };
};
