import { msg } from '@lingui/core/macro';

import { RelationNestedQueries } from 'src/engine/twenty-orm/field-operations/relation-nested-queries/relation-nested-queries';
import { type RelationConnectQueryConfig } from 'src/engine/twenty-orm/entity-manager/types/relation-connect-query-config.type';
import {
  TwentyORMException,
  TwentyORMExceptionCode,
} from 'src/engine/twenty-orm/exceptions/twenty-orm.exception';

describe('RelationNestedQueries', () => {
  it('should throw when a connect query does not match any record', () => {
    const relationNestedQueries = new RelationNestedQueries({} as never);

    const updateEntitiesWithRecordToConnectId =
      relationNestedQueries as unknown as {
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

    expect(() =>
      updateEntitiesWithRecordToConnectId.updateEntitiesWithRecordToConnectId(
        [
          {
            company: {
              connect: {
                where: {
                  id: 'company-id',
                },
              },
            },
          },
        ],
        [
          [
            {
              targetObjectName: 'company',
              recordToConnectConditions: [[['id', 'company-id']]],
              relationFieldName: 'companyId',
              connectFieldName: 'company',
              uniqueConstraintFields: [],
              recordToConnectConditionByEntityIndex: {
                0: [['id', 'company-id']],
              },
            },
            [],
          ],
        ],
      ),
    ).toThrow(
      new TwentyORMException(
        'Expected 1 record to connect to company, but found 0 for id = company-id',
        TwentyORMExceptionCode.CONNECT_RECORD_NOT_FOUND,
        {
          userFriendlyMessage: msg`Can't connect to company. No unique record found with condition: id = company-id`,
        },
      ),
    );
  });
});
