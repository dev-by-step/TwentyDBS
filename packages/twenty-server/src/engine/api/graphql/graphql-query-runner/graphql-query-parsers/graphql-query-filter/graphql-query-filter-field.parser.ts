import { msg } from '@lingui/core/macro';
import {
  compositeTypeDefinitions,
  FieldMetadataType,
  RelationType,
} from 'twenty-shared/types';
import { capitalize, isDefined } from 'twenty-shared/utils';
import { type WhereExpressionBuilder } from 'typeorm';

import {
  GraphqlQueryRunnerException,
  GraphqlQueryRunnerExceptionCode,
} from 'src/engine/api/graphql/graphql-query-runner/errors/graphql-query-runner.exception';
import { getFlatFieldsFromFlatObjectMetadata } from 'src/engine/api/graphql/workspace-schema-builder/utils/get-flat-fields-for-flat-object-metadata.util';
import { computeWhereConditionParts } from 'src/engine/api/graphql/graphql-query-runner/utils/compute-where-condition-parts';
import { type CompositeFieldMetadataType } from 'src/engine/metadata-modules/field-metadata/types/composite-field-metadata-type.type';
import { computeMorphOrRelationFieldJoinColumnName } from 'src/engine/metadata-modules/field-metadata/utils/compute-morph-or-relation-field-join-column-name.util';
import { isCompositeFieldMetadataType } from 'src/engine/metadata-modules/field-metadata/utils/is-composite-field-metadata-type.util';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { findFlatEntityByIdInFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps-or-throw.util';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { buildFieldMapsFromFlatObjectMetadata } from 'src/engine/metadata-modules/flat-field-metadata/utils/build-field-maps-from-flat-object-metadata.util';
import { isFlatFieldMetadataOfType } from 'src/engine/metadata-modules/flat-field-metadata/utils/is-flat-field-metadata-of-type.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { computeObjectTargetTable } from 'src/engine/utils/compute-object-target-table.util';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';

const ARRAY_OPERATORS = ['in', 'contains', 'notContains'];

export class GraphqlQueryFilterFieldParser {
  private flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  private flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
  private fieldIdByName: Record<string, string>;
  private fieldIdByJoinColumnName: Record<string, string>;
  private oneToManyRelationFieldIdByFilterKey: Record<string, string>;

  constructor(
    flatObjectMetadata: FlatObjectMetadata,
    flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>,
    flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>,
  ) {
    this.flatObjectMetadataMaps = flatObjectMetadataMaps;
    this.flatFieldMetadataMaps = flatFieldMetadataMaps;

    const fieldMaps = buildFieldMapsFromFlatObjectMetadata(
      flatFieldMetadataMaps,
      flatObjectMetadata,
    );

    this.fieldIdByName = fieldMaps.fieldIdByName;
    this.fieldIdByJoinColumnName = fieldMaps.fieldIdByJoinColumnName;
    this.oneToManyRelationFieldIdByFilterKey =
      this.buildOneToManyRelationFieldIdByFilterKey(flatObjectMetadata);
  }

  public parse(
    queryBuilder: WhereExpressionBuilder,
    objectNameSingular: string,
    key: string,
    // oxlint-disable-next-line @typescripttypescript/no-explicit-any
    filterValue: any,
    isFirst = false,
    useDirectTableReference = false,
  ): void {
    const fieldMetadataId =
      this.fieldIdByName[key] ||
      this.fieldIdByJoinColumnName[key] ||
      this.oneToManyRelationFieldIdByFilterKey[key];

    const fieldMetadata = findFlatEntityByIdInFlatEntityMaps({
      flatEntityId: fieldMetadataId,
      flatEntityMaps: this.flatFieldMetadataMaps,
    });

    if (!isDefined(fieldMetadata)) {
      throw new Error(`Field metadata not found for field: ${key}`);
    }

    if (
      this.oneToManyRelationFieldIdByFilterKey[key] === fieldMetadata.id &&
      isFlatFieldMetadataOfType(fieldMetadata, FieldMetadataType.RELATION) &&
      fieldMetadata.settings?.relationType === RelationType.ONE_TO_MANY
    ) {
      return this.parseOneToManyRelationFieldForFilter(
        queryBuilder,
        fieldMetadata,
        objectNameSingular,
        filterValue,
        isFirst,
      );
    }

    if (isCompositeFieldMetadataType(fieldMetadata.type)) {
      return this.parseCompositeFieldForFilter(
        queryBuilder,
        fieldMetadata,
        objectNameSingular,
        filterValue,
        isFirst,
        useDirectTableReference,
      );
    }
    const [[operator, value]] = Object.entries(filterValue);

    if (
      ARRAY_OPERATORS.includes(operator) &&
      (!Array.isArray(value) || value.length === 0)
    ) {
      throw new GraphqlQueryRunnerException(
        `Invalid filter value for field ${key}. Expected non-empty array`,
        GraphqlQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
        { userFriendlyMessage: msg`Invalid filter value: "${value}"` },
      );
    }
    const { sql, params } = computeWhereConditionParts({
      operator,
      objectNameSingular,
      key,
      value,
      fieldMetadataType: fieldMetadata.type,
      useDirectTableReference,
    });

    if (isFirst) {
      queryBuilder.where(sql, params);
    } else {
      queryBuilder.andWhere(sql, params);
    }
  }

  private buildOneToManyRelationFieldIdByFilterKey(
    flatObjectMetadata: FlatObjectMetadata,
  ): Record<string, string> {
    return getFlatFieldsFromFlatObjectMetadata(
      flatObjectMetadata,
      this.flatFieldMetadataMaps,
    ).reduce<Record<string, string>>((acc, fieldMetadata) => {
      if (
        isFlatFieldMetadataOfType(fieldMetadata, FieldMetadataType.RELATION) &&
        fieldMetadata.settings?.relationType === RelationType.ONE_TO_MANY &&
        'junctionTargetFieldId' in fieldMetadata.settings &&
        typeof fieldMetadata.settings.junctionTargetFieldId === 'string'
      ) {
        acc[
          computeMorphOrRelationFieldJoinColumnName({
            name: fieldMetadata.name,
          })
        ] = fieldMetadata.id;
      }

      return acc;
    }, {});
  }

  private parseOneToManyRelationFieldForFilter(
    queryBuilder: WhereExpressionBuilder,
    fieldMetadata: FlatFieldMetadata<FieldMetadataType.RELATION>,
    objectNameSingular: string,
    // oxlint-disable-next-line @typescripttypescript/no-explicit-any
    filterValue: any,
    isFirst = false,
  ): void {
    const relationTargetObjectMetadataId =
      fieldMetadata.relationTargetObjectMetadataId;
    const relationTargetFieldMetadataId =
      fieldMetadata.relationTargetFieldMetadataId;

    if (
      !isDefined(relationTargetObjectMetadataId) ||
      !isDefined(relationTargetFieldMetadataId) ||
      !(
        isDefined(fieldMetadata.settings) &&
        'junctionTargetFieldId' in fieldMetadata.settings &&
        typeof fieldMetadata.settings.junctionTargetFieldId === 'string'
      )
    ) {
      throw new Error(
        `One-to-many relation metadata is incomplete for field: ${fieldMetadata.name}`,
      );
    }

    const targetObjectMetadata = findFlatEntityByIdInFlatEntityMapsOrThrow({
      flatEntityId: relationTargetObjectMetadataId,
      flatEntityMaps: this.flatObjectMetadataMaps,
    });
    const relationTargetFieldMetadata =
      findFlatEntityByIdInFlatEntityMapsOrThrow({
        flatEntityId: relationTargetFieldMetadataId,
        flatEntityMaps: this.flatFieldMetadataMaps,
      });
    const junctionTargetFieldMetadata =
      findFlatEntityByIdInFlatEntityMapsOrThrow({
        flatEntityId: fieldMetadata.settings.junctionTargetFieldId,
        flatEntityMaps: this.flatFieldMetadataMaps,
      });

    if (
      !isFlatFieldMetadataOfType(
        relationTargetFieldMetadata,
        FieldMetadataType.RELATION,
      ) ||
      !isFlatFieldMetadataOfType(
        junctionTargetFieldMetadata,
        FieldMetadataType.RELATION,
      )
    ) {
      throw new Error(
        `One-to-many relation filter target metadata is invalid for field: ${fieldMetadata.name}`,
      );
    }

    const relationTargetJoinColumnName = this.getRelationJoinColumnName(
      relationTargetFieldMetadata,
    );
    const junctionTargetJoinColumnName = this.getRelationJoinColumnName(
      junctionTargetFieldMetadata,
    );
    const [[operator, value]] = Object.entries(filterValue);

    if (
      ARRAY_OPERATORS.includes(operator) &&
      (!Array.isArray(value) || value.length === 0)
    ) {
      throw new GraphqlQueryRunnerException(
        `Invalid filter value for field ${fieldMetadata.name}. Expected non-empty array`,
        GraphqlQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
        { userFriendlyMessage: msg`Invalid filter value: "${value}"` },
      );
    }

    const relationAlias = `relation_filter_${fieldMetadata.name}`;
    const relationTableReference = this.buildRelationTableReference(
      queryBuilder,
      targetObjectMetadata,
    );
    const { sql, params } = computeWhereConditionParts({
      operator,
      objectNameSingular: relationAlias,
      key: junctionTargetJoinColumnName,
      value,
      fieldMetadataType: junctionTargetFieldMetadata.type,
    });
    const existsSql = `EXISTS (
      SELECT 1
      FROM ${relationTableReference} ${escapeIdentifier(relationAlias)}
      WHERE ${escapeIdentifier(relationAlias)}.${escapeIdentifier(
        relationTargetJoinColumnName,
      )} = ${escapeIdentifier(objectNameSingular)}."id"
        AND ${escapeIdentifier(relationAlias)}."deletedAt" IS NULL
        AND ${sql}
    )`;

    if (isFirst) {
      queryBuilder.where(existsSql, params);
    } else {
      queryBuilder.andWhere(existsSql, params);
    }
  }

  private getRelationJoinColumnName(
    fieldMetadata: FlatFieldMetadata<FieldMetadataType.RELATION>,
  ): string {
    const joinColumnName = fieldMetadata.settings?.joinColumnName;

    if (!isDefined(joinColumnName)) {
      throw new Error(
        `Relation join column name is not defined for field: ${fieldMetadata.name}`,
      );
    }

    return joinColumnName;
  }

  private buildRelationTableReference(
    queryBuilder: WhereExpressionBuilder,
    targetObjectMetadata: FlatObjectMetadata,
  ): string {
    const schemaName = (
      queryBuilder as {
        expressionMap?: {
          mainAlias?: {
            metadata?: {
              schema?: string;
            };
          };
        };
      }
    ).expressionMap?.mainAlias?.metadata?.schema;

    const targetTableName = computeObjectTargetTable(targetObjectMetadata);

    return isDefined(schemaName)
      ? `${escapeIdentifier(schemaName)}.${escapeIdentifier(targetTableName)}`
      : escapeIdentifier(targetTableName);
  }

  private parseCompositeFieldForFilter(
    queryBuilder: WhereExpressionBuilder,
    fieldMetadata: FlatFieldMetadata,
    objectNameSingular: string,
    // oxlint-disable-next-line @typescripttypescript/no-explicit-any
    fieldValue: any,
    isFirst = false,
    useDirectTableReference = false,
  ): void {
    const compositeType = compositeTypeDefinitions.get(
      fieldMetadata.type as CompositeFieldMetadataType,
    );

    if (!compositeType) {
      throw new Error(
        `Composite type definition not found for type: ${fieldMetadata.type}`,
      );
    }

    Object.entries(fieldValue).map(([subFieldKey, subFieldFilter], index) => {
      const subFieldMetadata = compositeType.properties.find(
        (property) => property.name === subFieldKey,
      );

      if (!subFieldMetadata) {
        throw new Error(
          `Sub field metadata not found for composite type: ${fieldMetadata.type}`,
        );
      }

      const fullFieldName = `${fieldMetadata.name}${capitalize(subFieldKey)}`;

      const [[operator, value]] = Object.entries(
        // oxlint-disable-next-line @typescripttypescript/no-explicit-any
        subFieldFilter as Record<string, any>,
      );

      if (
        ARRAY_OPERATORS.includes(operator) &&
        (!Array.isArray(value) || value.length === 0)
      ) {
        throw new GraphqlQueryRunnerException(
          `Invalid filter value for field ${subFieldKey}. Expected non-empty array`,
          GraphqlQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
          { userFriendlyMessage: msg`Invalid filter value: "${value}"` },
        );
      }

      const { sql, params } = computeWhereConditionParts({
        operator,
        objectNameSingular,
        key: fullFieldName,
        subFieldKey,
        value,
        fieldMetadataType: fieldMetadata.type,
        useDirectTableReference,
      });

      if (isFirst && index === 0) {
        queryBuilder.where(sql, params);
      }

      queryBuilder.andWhere(sql, params);
    });
  }
}
