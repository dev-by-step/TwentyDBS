import { sanitizeRecordInput } from '@/object-record/utils/sanitizeRecordInput';
import { FieldMetadataType, RelationType } from '~/generated-metadata/graphql';

describe('sanitizeRecordInput', () => {
  it('drops a join-column field when the corresponding relation connect is provided', () => {
    const objectMetadataItem = {
      fields: [
        {
          id: 'internal-entity-id-field',
          name: 'internalEntityId',
          type: FieldMetadataType.UUID,
          settings: {},
        },
        {
          id: 'internal-entity-field',
          name: 'internalEntity',
          type: FieldMetadataType.RELATION,
          settings: {
            joinColumnName: 'internalEntityId',
          },
          relation: {
            type: RelationType.MANY_TO_ONE,
          },
        },
      ],
    } as any;

    const result = sanitizeRecordInput({
      objectMetadataItem,
      recordInput: {
        internalEntityId: 'legacy-raw-foreign-key',
        internalEntity: {
          connect: {
            where: {
              id: 'canonical-relation-id',
            },
          },
        },
      },
    });

    expect(result).toEqual({
      internalEntity: {
        connect: {
          where: {
            id: 'canonical-relation-id',
          },
        },
      },
    });
  });

  it('keeps a join-column field when no relation connect is provided', () => {
    const objectMetadataItem = {
      fields: [
        {
          id: 'internal-entity-id-field',
          name: 'internalEntityId',
          type: FieldMetadataType.UUID,
          settings: {},
        },
        {
          id: 'internal-entity-field',
          name: 'internalEntity',
          type: FieldMetadataType.RELATION,
          settings: {
            joinColumnName: 'internalEntityId',
          },
          relation: {
            type: RelationType.MANY_TO_ONE,
          },
        },
      ],
    } as any;

    const result = sanitizeRecordInput({
      objectMetadataItem,
      recordInput: {
        internalEntityId: 'legacy-raw-foreign-key',
      },
    });

    expect(result).toEqual({
      internalEntityId: 'legacy-raw-foreign-key',
    });
  });

  it('keeps a relation disconnect operation so imports can clear an existing many-to-one relation', () => {
    const objectMetadataItem = {
      fields: [
        {
          id: 'point-of-contact-field',
          name: 'pointOfContact',
          type: FieldMetadataType.RELATION,
          isNullable: true,
          settings: {
            joinColumnName: 'pointOfContactId',
          },
          relation: {
            type: RelationType.MANY_TO_ONE,
          },
        },
      ],
    } as any;

    const result = sanitizeRecordInput({
      objectMetadataItem,
      recordInput: {
        pointOfContact: {
          disconnect: true,
        },
      },
    });

    expect(result).toEqual({
      pointOfContact: {
        disconnect: true,
      },
    });
  });
});
