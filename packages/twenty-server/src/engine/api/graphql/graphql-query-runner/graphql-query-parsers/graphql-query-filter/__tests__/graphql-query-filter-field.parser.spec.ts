import { GraphqlQueryFilterFieldParser } from 'src/engine/api/graphql/graphql-query-runner/graphql-query-parsers/graphql-query-filter/graphql-query-filter-field.parser';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

describe('GraphqlQueryFilterFieldParser', () => {
  it('should compute relation table reference from object metadata instead of deprecated targetTableName', () => {
    const flatObjectMetadata = {
      id: 'object-id',
      nameSingular: 'company',
      namePlural: 'companies',
      isCustom: false,
      fieldIds: [],
      universalIdentifier: 'company-universal-id',
      labelIdentifierFieldMetadataUniversalIdentifier: null,
      imageIdentifierFieldMetadataUniversalIdentifier: null,
    } as unknown as FlatObjectMetadata;

    const flatObjectMetadataMaps = {
      byUniversalIdentifier: {},
      universalIdentifierById: {},
      universalIdentifiersByApplicationId: {},
    } as FlatEntityMaps<FlatObjectMetadata>;

    const flatFieldMetadataMaps = {
      byUniversalIdentifier: {},
      universalIdentifierById: {},
      universalIdentifiersByApplicationId: {},
    } as FlatEntityMaps<FlatFieldMetadata>;

    const parser = new GraphqlQueryFilterFieldParser(
      flatObjectMetadata,
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
    );

    const relationTableReference = (
      parser as unknown as {
        buildRelationTableReference: (
          queryBuilder: unknown,
          targetObjectMetadata: unknown,
        ) => string;
      }
    ).buildRelationTableReference(
      {
        expressionMap: {
          mainAlias: {
            metadata: {
              schema: 'workspace_schema',
            },
          },
        },
      },
      {
        nameSingular: 'companyEntityMembership',
        isCustom: false,
        targetTableName: 'DEPRECATED',
      },
    );

    expect(relationTableReference).toBe(
      '"workspace_schema"."companyEntityMembership"',
    );
  });
});
