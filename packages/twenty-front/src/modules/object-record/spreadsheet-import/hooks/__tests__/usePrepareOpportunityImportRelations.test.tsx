import { renderHook } from '@testing-library/react';

import { usePrepareOpportunityImportRelations } from '@/object-record/spreadsheet-import/hooks/usePrepareOpportunityImportRelations';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { FieldMetadataType, RelationType } from '~/generated-metadata/graphql';
import { CoreObjectNameSingular } from 'twenty-shared/types';

const mockApolloCoreClient = {
  mutate: jest.fn(),
  query: jest.fn(),
};

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockApolloCoreClient,
}));

const mockUseObjectMetadataItems = jest.fn();

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => mockUseObjectMetadataItems(),
}));

jest.mock('@/object-record/hooks/useObjectPermissions', () => ({
  useObjectPermissions: () => ({
    objectPermissionsByObjectMetadataId: {},
  }),
}));

const createMockFieldMetadataItem = (
  overrides: Partial<FieldMetadataItem> = {},
): FieldMetadataItem =>
  ({
    id: 'test-field-id',
    universalIdentifier: 'test-field-id',
    name: 'testField',
    label: 'Test Field',
    type: FieldMetadataType.TEXT,
    icon: 'IconTest',
    settings: {},
    isActive: true,
    isCustom: false,
    isSystem: false,
    isNullable: true,
    createdAt: '2023-01-01',
    updatedAt: '2023-01-01',
    ...overrides,
  }) as FieldMetadataItem;

const createMockObjectMetadataItem = (
  overrides: Partial<EnrichedObjectMetadataItem> = {},
): EnrichedObjectMetadataItem =>
  ({
    id: 'test-object-id',
    universalIdentifier: 'test-object-id',
    nameSingular: 'testObject',
    namePlural: 'testObjects',
    labelSingular: 'Test Object',
    labelPlural: 'Test Objects',
    description: null,
    icon: 'IconTest',
    isCustom: false,
    isSystem: false,
    isActive: true,
    isLabelSyncedWithName: false,
    isRemote: false,
    isSearchable: true,
    createdAt: '2023-01-01',
    updatedAt: '2023-01-01',
    fields: [],
    readableFields: [],
    updatableFields: [],
    labelIdentifierFieldMetadataId: 'id-field',
    indexMetadatas: [],
    ...overrides,
  }) as EnrichedObjectMetadataItem;

const idField = createMockFieldMetadataItem({
  id: 'id-field',
  name: 'id',
  label: 'Id',
  type: FieldMetadataType.UUID,
  isNullable: false,
});

const emptyConnection = (namePlural: string) => ({
  data: {
    [namePlural]: {
      edges: [],
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: '',
        endCursor: '',
      },
      totalCount: 0,
    },
  },
});

const connectionWithRecords = (
  namePlural: string,
  records: Record<string, unknown>[],
) => ({
  data: {
    [namePlural]: {
      edges: records.map((record, index) => ({
        node: {
          __typename: namePlural,
          ...record,
        },
        cursor: `${index}`,
      })),
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: '',
        endCursor: '',
      },
      totalCount: records.length,
    },
  },
});

describe('usePrepareOpportunityImportRelations', () => {
  const internalEntityId = 'internal-entity-id';
  const companyId = '003f2bd8-d8a5-4efd-b4af-4fd094214bb3';
  const personId = 'a627b96e-25b5-48fb-bb6f-d42b443f8f81';

  const companyMembershipObjectMetadataId = 'company-membership-object-id';
  const personMembershipObjectMetadataId = 'person-membership-object-id';

  const internalEntityNameField = createMockFieldMetadataItem({
    id: 'internal-entity-name-field',
    name: 'name',
    label: 'Name',
    type: FieldMetadataType.TEXT,
    isNullable: false,
  });

  const internalEntityObjectMetadataItem = createMockObjectMetadataItem({
    id: 'internal-entity-object-id',
    nameSingular: 'internalEntity',
    namePlural: 'internalEntities',
    labelSingular: 'Internal Entity',
    labelPlural: 'Internal Entities',
    labelIdentifierFieldMetadataId: internalEntityNameField.id,
    fields: [idField, internalEntityNameField],
    readableFields: [idField, internalEntityNameField],
    updatableFields: [idField, internalEntityNameField],
  });

  const companyInternalEntitiesField = createMockFieldMetadataItem({
    id: 'company-internal-entities-field',
    name: 'internalEntities',
    label: 'Internal Entities',
    type: FieldMetadataType.RELATION,
    relation: {
      type: RelationType.ONE_TO_MANY,
      targetObjectMetadata: {
        id: companyMembershipObjectMetadataId,
        nameSingular: 'companyEntityMembership',
        namePlural: 'companyEntityMemberships',
      },
    } as any,
  });

  const companyNameField = createMockFieldMetadataItem({
    id: 'company-name-field',
    name: 'name',
    label: 'Name',
    type: FieldMetadataType.TEXT,
    isNullable: true,
  });

  const companyObjectMetadataItem = createMockObjectMetadataItem({
    id: 'company-object-id',
    nameSingular: CoreObjectNameSingular.Company,
    namePlural: 'companies',
    labelSingular: 'Company',
    labelPlural: 'Companies',
    fields: [idField, companyNameField, companyInternalEntitiesField],
    readableFields: [idField, companyNameField, companyInternalEntitiesField],
    updatableFields: [idField, companyNameField, companyInternalEntitiesField],
  });

  const personInternalEntitiesField = createMockFieldMetadataItem({
    id: 'person-internal-entities-field',
    name: 'internalEntities',
    label: 'Internal Entities',
    type: FieldMetadataType.RELATION,
    relation: {
      type: RelationType.ONE_TO_MANY,
      targetObjectMetadata: {
        id: personMembershipObjectMetadataId,
        nameSingular: 'personEntityMembership',
        namePlural: 'personEntityMemberships',
      },
    } as any,
  });

  const personCompanyField = createMockFieldMetadataItem({
    id: 'person-company-field',
    name: 'company',
    label: 'Company',
    type: FieldMetadataType.RELATION,
    relation: {
      type: RelationType.MANY_TO_ONE,
      targetObjectMetadata: {
        id: companyObjectMetadataItem.id,
        nameSingular: CoreObjectNameSingular.Company,
        namePlural: 'companies',
      },
    } as any,
  });

  const personFirstNameField = createMockFieldMetadataItem({
    id: 'person-first-name-field',
    name: 'nameFirstName',
    label: 'First name',
    type: FieldMetadataType.TEXT,
    isNullable: true,
  });

  const personLastNameField = createMockFieldMetadataItem({
    id: 'person-last-name-field',
    name: 'nameLastName',
    label: 'Last name',
    type: FieldMetadataType.TEXT,
    isNullable: true,
  });

  const personObjectMetadataItem = createMockObjectMetadataItem({
    id: 'person-object-id',
    nameSingular: CoreObjectNameSingular.Person,
    namePlural: 'people',
    labelSingular: 'Person',
    labelPlural: 'People',
    fields: [
      idField,
      personFirstNameField,
      personLastNameField,
      personCompanyField,
      personInternalEntitiesField,
    ],
    readableFields: [
      idField,
      personFirstNameField,
      personLastNameField,
      personCompanyField,
      personInternalEntitiesField,
    ],
    updatableFields: [
      idField,
      personFirstNameField,
      personLastNameField,
      personCompanyField,
      personInternalEntitiesField,
    ],
  });

  const companyMembershipCompanyField = createMockFieldMetadataItem({
    id: 'company-membership-company-field',
    name: 'company',
    label: 'Company',
    type: FieldMetadataType.RELATION,
    relation: {
      type: RelationType.MANY_TO_ONE,
      targetObjectMetadata: {
        id: companyObjectMetadataItem.id,
        nameSingular: CoreObjectNameSingular.Company,
        namePlural: 'companies',
      },
    } as any,
  });

  const companyMembershipInternalEntityField = createMockFieldMetadataItem({
    id: 'company-membership-internal-entity-field',
    name: 'internalEntity',
    label: 'Internal Entity',
    type: FieldMetadataType.RELATION,
    relation: {
      type: RelationType.MANY_TO_ONE,
      targetObjectMetadata: {
        id: internalEntityObjectMetadataItem.id,
        nameSingular: 'internalEntity',
        namePlural: 'internalEntities',
      },
    } as any,
  });

  const companyMembershipObjectMetadataItem = createMockObjectMetadataItem({
    id: companyMembershipObjectMetadataId,
    nameSingular: 'companyEntityMembership',
    namePlural: 'companyEntityMemberships',
    fields: [
      companyMembershipCompanyField,
      companyMembershipInternalEntityField,
    ],
    readableFields: [
      companyMembershipCompanyField,
      companyMembershipInternalEntityField,
    ],
    updatableFields: [
      companyMembershipCompanyField,
      companyMembershipInternalEntityField,
    ],
    labelIdentifierFieldMetadataId: companyMembershipCompanyField.id,
  });

  const personMembershipPersonField = createMockFieldMetadataItem({
    id: 'person-membership-person-field',
    name: 'person',
    label: 'Person',
    type: FieldMetadataType.RELATION,
    relation: {
      type: RelationType.MANY_TO_ONE,
      targetObjectMetadata: {
        id: personObjectMetadataItem.id,
        nameSingular: CoreObjectNameSingular.Person,
        namePlural: 'people',
      },
    } as any,
  });

  const personMembershipInternalEntityField = createMockFieldMetadataItem({
    id: 'person-membership-internal-entity-field',
    name: 'internalEntity',
    label: 'Internal Entity',
    type: FieldMetadataType.RELATION,
    relation: {
      type: RelationType.MANY_TO_ONE,
      targetObjectMetadata: {
        id: internalEntityObjectMetadataItem.id,
        nameSingular: 'internalEntity',
        namePlural: 'internalEntities',
      },
    } as any,
  });

  const personMembershipObjectMetadataItem = createMockObjectMetadataItem({
    id: personMembershipObjectMetadataId,
    nameSingular: 'personEntityMembership',
    namePlural: 'personEntityMemberships',
    fields: [personMembershipPersonField, personMembershipInternalEntityField],
    readableFields: [
      personMembershipPersonField,
      personMembershipInternalEntityField,
    ],
    updatableFields: [
      personMembershipPersonField,
      personMembershipInternalEntityField,
    ],
    labelIdentifierFieldMetadataId: personMembershipPersonField.id,
  });

  const opportunityCompanyField = createMockFieldMetadataItem({
    id: 'opportunity-company-field',
    name: 'company',
    label: 'Company',
    type: FieldMetadataType.RELATION,
    relation: {
      type: RelationType.MANY_TO_ONE,
      targetObjectMetadata: {
        id: companyObjectMetadataItem.id,
        nameSingular: CoreObjectNameSingular.Company,
        namePlural: 'companies',
      },
    } as any,
  });

  const opportunityPointOfContactField = createMockFieldMetadataItem({
    id: 'opportunity-point-of-contact-field',
    name: 'pointOfContact',
    label: 'Point of Contact',
    type: FieldMetadataType.RELATION,
    relation: {
      type: RelationType.MANY_TO_ONE,
      targetObjectMetadata: {
        id: personObjectMetadataItem.id,
        nameSingular: CoreObjectNameSingular.Person,
        namePlural: 'people',
      },
    } as any,
  });

  const opportunityInternalEntityField = createMockFieldMetadataItem({
    id: 'opportunity-internal-entity-field',
    name: 'internalEntity',
    label: 'Internal Entity',
    type: FieldMetadataType.RELATION,
    relation: {
      type: RelationType.MANY_TO_ONE,
      targetObjectMetadata: {
        id: internalEntityObjectMetadataItem.id,
        nameSingular: 'internalEntity',
        namePlural: 'internalEntities',
      },
    } as any,
  });

  const opportunityObjectMetadataItem = createMockObjectMetadataItem({
    id: 'opportunity-object-id',
    nameSingular: CoreObjectNameSingular.Opportunity,
    namePlural: 'opportunities',
    labelSingular: 'Opportunity',
    labelPlural: 'Opportunities',
    fields: [
      idField,
      opportunityCompanyField,
      opportunityPointOfContactField,
      opportunityInternalEntityField,
    ],
    readableFields: [
      idField,
      opportunityCompanyField,
      opportunityPointOfContactField,
      opportunityInternalEntityField,
    ],
    updatableFields: [
      idField,
      opportunityCompanyField,
      opportunityPointOfContactField,
      opportunityInternalEntityField,
    ],
  });

  const buildCsvFile = () =>
    new File(
      [
        [
          'Id,Nom,Société,Montant / Amount,Montant / Currency,Entreprise Id,Point de contact Id,Étape',
          `${crypto.randomUUID()},WeKnow POC,"[""WEKNOW""]",6000,EUR,${companyId},${personId},GAGNE`,
        ].join('\n'),
      ],
      'opportunity.csv',
      { type: 'text/csv' },
    );

  beforeEach(() => {
    jest.clearAllMocks();
    mockApolloCoreClient.mutate.mockResolvedValue({ data: {} });
    mockUseObjectMetadataItems.mockReturnValue({
      objectMetadataItems: [
        opportunityObjectMetadataItem,
        companyObjectMetadataItem,
        personObjectMetadataItem,
        internalEntityObjectMetadataItem,
        companyMembershipObjectMetadataItem,
        personMembershipObjectMetadataItem,
      ],
    });
  });

  it('attaches existing company and person to the internal entity resolved from the csv', async () => {
    mockApolloCoreClient.query
      .mockResolvedValueOnce(
        connectionWithRecords('internalEntities', [
          { id: internalEntityId, name: 'WEKNOW' },
        ]),
      )
      .mockResolvedValueOnce(
        connectionWithRecords('companies', [
          { id: companyId, name: 'Acme Corp' },
        ]),
      )
      .mockResolvedValueOnce(
        connectionWithRecords('people', [
          {
            id: personId,
            nameFirstName: 'Alice',
            nameLastName: 'Martin',
          },
        ]),
      )
      .mockResolvedValueOnce(emptyConnection('companies'))
      .mockResolvedValueOnce(emptyConnection('people'));

    const { result } = renderHook(() => usePrepareOpportunityImportRelations());

    const preparationResult =
      await result.current.ensureOpportunityImportRelations({
        allStructuredRows: [
          {
            name: 'WeKnow POC',
          },
        ],
        file: buildCsvFile(),
        opportunityObjectMetadataItem,
        recordsToCreate: [
          {
            company: {
              connect: {
                where: {
                  id: companyId,
                },
              },
            },
            pointOfContact: {
              connect: {
                where: {
                  id: personId,
                },
              },
            },
          },
        ],
      });

    expect(preparationResult).toEqual({
      attachedCompaniesToInternalEntitiesCount: 1,
      attachedPeopleToInternalEntitiesCount: 1,
      skippedCompanyRelationsCount: 0,
      skippedPeopleRelationsCount: 0,
      recordsToCreate: [
        {
          company: {
            connect: {
              where: {
                id: companyId,
              },
            },
          },
          pointOfContact: {
            connect: {
              where: {
                id: personId,
              },
            },
          },
          internalEntity: {
            connect: {
              where: {
                id: internalEntityId,
              },
            },
          },
        },
      ],
    });

    expect(mockApolloCoreClient.mutate).toHaveBeenCalledTimes(2);
    expect(mockApolloCoreClient.mutate.mock.calls[0][0].variables).toEqual({
      data: [
        {
          company: {
            connect: {
              where: {
                id: companyId,
              },
            },
          },
          internalEntity: {
            connect: {
              where: {
                id: internalEntityId,
              },
            },
          },
        },
      ],
      upsert: false,
    });
    expect(mockApolloCoreClient.mutate.mock.calls[1][0].variables).toEqual({
      data: [
        {
          person: {
            connect: {
              where: {
                id: personId,
              },
            },
          },
          internalEntity: {
            connect: {
              where: {
                id: internalEntityId,
              },
            },
          },
        },
      ],
      upsert: false,
    });
  });

  it('disconnects company and point of contact when the csv only provides unknown relation ids', async () => {
    mockApolloCoreClient.query
      .mockResolvedValueOnce(
        connectionWithRecords('internalEntities', [
          { id: internalEntityId, name: 'WEKNOW' },
        ]),
      )
      .mockResolvedValueOnce(emptyConnection('companies'))
      .mockResolvedValueOnce(emptyConnection('people'))
      .mockResolvedValueOnce(emptyConnection('companies'))
      .mockResolvedValueOnce(emptyConnection('people'));

    const { result } = renderHook(() => usePrepareOpportunityImportRelations());

    const preparationResult =
      await result.current.ensureOpportunityImportRelations({
        allStructuredRows: [
          {
            name: 'WeKnow POC',
          },
        ],
        file: buildCsvFile(),
        opportunityObjectMetadataItem,
        recordsToCreate: [
          {
            company: {
              connect: {
                where: {
                  id: companyId,
                },
              },
            },
            pointOfContact: {
              connect: {
                where: {
                  id: personId,
                },
              },
            },
          },
        ],
      });

    expect(preparationResult?.attachedCompaniesToInternalEntitiesCount).toBe(0);
    expect(preparationResult?.attachedPeopleToInternalEntitiesCount).toBe(0);
    expect(preparationResult?.skippedCompanyRelationsCount).toBe(1);
    expect(preparationResult?.skippedPeopleRelationsCount).toBe(1);
    expect(preparationResult?.recordsToCreate).toEqual([
      expect.objectContaining({
        company: {
          disconnect: true,
        },
        pointOfContact: {
          disconnect: true,
        },
      }),
    ]);

    expect(mockApolloCoreClient.mutate).not.toHaveBeenCalled();
  });

  it('clears synthetic point-of-contact labels created by the previous import behavior', async () => {
    mockApolloCoreClient.query
      .mockResolvedValueOnce(
        connectionWithRecords('internalEntities', [
          { id: internalEntityId, name: 'WEKNOW' },
        ]),
      )
      .mockResolvedValueOnce(
        connectionWithRecords('companies', [
          { id: companyId, name: 'Imported company 003f2bd8' },
        ]),
      )
      .mockResolvedValueOnce(
        connectionWithRecords('people', [
          {
            id: personId,
            nameFirstName: 'WeKnow',
            nameLastName: 'POC',
          },
        ]),
      )
      .mockResolvedValueOnce(emptyConnection('companies'))
      .mockResolvedValueOnce(emptyConnection('people'));

    const { result } = renderHook(() => usePrepareOpportunityImportRelations());

    const preparationResult =
      await result.current.ensureOpportunityImportRelations({
        allStructuredRows: [
          {
            name: 'WeKnow POC',
          },
        ],
        file: buildCsvFile(),
        opportunityObjectMetadataItem,
        recordsToCreate: [
          {
            company: {
              connect: {
                where: {
                  id: companyId,
                },
              },
            },
            pointOfContact: {
              connect: {
                where: {
                  id: personId,
                },
              },
            },
          },
        ],
      });

    expect(preparationResult?.attachedCompaniesToInternalEntitiesCount).toBe(0);
    expect(preparationResult?.attachedPeopleToInternalEntitiesCount).toBe(0);
    expect(preparationResult?.skippedCompanyRelationsCount).toBe(1);
    expect(preparationResult?.skippedPeopleRelationsCount).toBe(1);
    expect(preparationResult?.recordsToCreate).toEqual([
      expect.objectContaining({
        company: {
          disconnect: true,
        },
        pointOfContact: {
          disconnect: true,
        },
      }),
    ]);
  });
});
