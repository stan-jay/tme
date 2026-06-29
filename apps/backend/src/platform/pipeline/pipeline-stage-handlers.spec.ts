import type { SJBLEntity } from '@tme/shared';
import { entitiesFromContext, entitiesFromInput, groupEntitiesByType } from './pipeline-stage-handler.registry';

describe('pipeline stage handler helpers', () => {
  const entities = [
    { id: 'customer-1', type: 'customer' },
    { id: 'customer-2', type: 'customer' },
    { id: 'invoice-1', type: 'sale_invoice' },
  ] as SJBLEntity[];

  describe('entitiesFromInput', () => {
    it('extracts only well-formed SJBL entities', () => {
      const input = {
        entities: [
          ...entities,
          { id: 'missing-type' },
          { type: 'no-id' },
          'not-an-object',
          null,
        ],
      };
      expect(entitiesFromInput(input)).toHaveLength(3);
    });

    it('returns an empty array when no entities are present', () => {
      expect(entitiesFromInput({})).toEqual([]);
      expect(entitiesFromInput({ entities: 'nope' })).toEqual([]);
    });
  });

  describe('entitiesFromContext', () => {
    it('uses upstream read/map/normalize output when run input has no entities', () => {
      expect(
        entitiesFromContext({
          input: {},
          priorOutputs: { read: { entities } },
        }),
      ).toHaveLength(3);
    });

    it('prefers direct run input entities over prior stage output', () => {
      expect(
        entitiesFromContext({
          input: { entities: [entities[0]] },
          priorOutputs: { read: { entities } },
        }),
      ).toEqual([entities[0]]);
    });
  });

  describe('groupEntitiesByType', () => {
    it('groups entities by their SJBL type', () => {
      const grouped = groupEntitiesByType(entities);
      expect(grouped.get('customer')).toHaveLength(2);
      expect(grouped.get('sale_invoice')).toHaveLength(1);
      expect(grouped.has('payment')).toBe(false);
    });
  });
});
