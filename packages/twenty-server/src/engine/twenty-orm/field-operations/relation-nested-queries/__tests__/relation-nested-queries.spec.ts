import { msg } from '@lingui/core/macro';

import { RelationNestedQueries } from 'src/engine/twenty-orm/field-operations/relation-nested-queries/relation-nested-queries';
import { type RelationConnectQueryConfig } from 'src/engine/twenty-orm/entity-manager/types/relation-connect-query-config.type';
import {
  TwentyORMException,
  TwentyORMExceptionCode,
} from 'src/engine/twenty-orm/exceptions/twenty-orm.exception';

const buildConnectQueryConfig = (): RelationConnectQueryConfig =>
  ({
    targetObjectName: 'company',
    recordToConnectConditions: [[['id', 'company-id']]],
    relationFieldName: 'companyId',
    connectFieldName: 'company',
    uniqueConstraintFields: [],
    recordToConnectConditionByEntityIndex: {
      0: [['id', 'company-id']],
    },
  }) as unknown as RelationConnectQueryConfig;

const buildEntities = () => [
  {
    company: {
      connect: {
        where: {
          id: 'company-id',
        },
      },
    },
  },
];

const getUpdateEntitiesWithRecordToConnectId = () => {
  const relationNestedQueries = new RelationNestedQueries({} as never);

  return relationNestedQueries as unknown as {
    updateEntitiesWithRecordToConnectId: <
      Entity extends Record<string, unknown>,
    >(
      entities: Entity[],
      recordsToConnectWithConfig: [
        RelationConnectQueryConfig,
        Record<string, unknown>[],
      ][],
    ) => Entity[];
  };
};

describe('RelationNestedQueries', () => {
  it('should leave the relation null when a connect query does not match any record', () => {
    const updateEntitiesWithRecordToConnectId =
      getUpdateEntitiesWithRecordToConnectId();

    const updatedEntities =
      updateEntitiesWithRecordToConnectId.updateEntitiesWithRecordToConnectId(
        buildEntities(),
        [[buildConnectQueryConfig(), []]],
      );

    expect(updatedEntities).toEqual([
      {
        companyId: null,
        company: null,
      },
    ]);
  });

  it('should connect the relation when a connect query matches exactly one record', () => {
    const updateEntitiesWithRecordToConnectId =
      getUpdateEntitiesWithRecordToConnectId();

    const updatedEntities =
      updateEntitiesWithRecordToConnectId.updateEntitiesWithRecordToConnectId(
        buildEntities(),
        [[buildConnectQueryConfig(), [{ id: 'company-id' }]]],
      );

    expect(updatedEntities).toEqual([
      {
        companyId: 'company-id',
        company: null,
      },
    ]);
  });

  it('should throw when a connect query matches more than one record', () => {
    const updateEntitiesWithRecordToConnectId =
      getUpdateEntitiesWithRecordToConnectId();

    expect(() =>
      updateEntitiesWithRecordToConnectId.updateEntitiesWithRecordToConnectId(
        buildEntities(),
        [
          [
            buildConnectQueryConfig(),
            [{ id: 'company-id' }, { id: 'company-id' }],
          ],
        ],
      ),
    ).toThrow(
      new TwentyORMException(
        'Expected 1 record to connect to company, but found 2 for id = company-id',
        TwentyORMExceptionCode.CONNECT_RECORD_NOT_FOUND,
        {
          userFriendlyMessage: msg`Can't connect to company. No unique record found with condition: id = company-id`,
        },
      ),
    );
  });
});
