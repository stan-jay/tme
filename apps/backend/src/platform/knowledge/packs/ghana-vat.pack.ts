import { Injectable } from '@nestjs/common';
import type { KnowledgePackManifest, SaleInvoice } from '@tme/shared';
import {
  approxEqual,
  asRecord,
  BaseKnowledgePack,
  EvaluableRule,
  num,
  perEntityRule,
} from '../base-knowledge-pack';

/**
 * Ghana VAT knowledge pack.
 *
 * Encodes deterministic checks for Ghanaian standard-rated supplies. The
 * standard VAT rate is 15%, charged on a base that already includes the
 * NHIL (2.5%), GETFund (2.5%) and COVID-19 (1%) levies, giving an effective
 * combined rate around 21.9%. Zero-rated and exempt supplies carry no VAT.
 */
@Injectable()
export class GhanaVatPack extends BaseKnowledgePack {
  readonly manifest: KnowledgePackManifest = {
    id: 'ghana-vat',
    name: 'Ghana VAT',
    version: '2024.1',
    systemFamily: 'jurisdiction',
    languageVersion: '1.0',
    supportedEntityTypes: ['sale_invoice'],
    jurisdictions: ['GH'],
    currencies: ['GHS'],
  };

  protected rulesList(): EvaluableRule[] {
    return [
      perEntityRule(
        {
          id: 'gh-vat-non-negative-tax',
          name: 'VAT must not be negative',
          category: 'tax',
          severity: 'error',
          entityTypes: ['sale_invoice'],
          description: 'A standard-rated invoice cannot carry a negative VAT amount.',
          sourceReference: 'Value Added Tax Act, 2013 (Act 870)',
        },
        (entity) => {
          const tax = num(asRecord(entity).tax);
          if (tax === null) return null;
          return { ok: tax >= 0, explanation: `VAT amount is ${tax}` };
        },
      ),
      perEntityRule(
        {
          id: 'gh-vat-total-consistency',
          name: 'Invoice total reconciles with VAT',
          category: 'tax',
          severity: 'error',
          entityTypes: ['sale_invoice'],
          description: 'Total must equal subtotal plus VAT less any discount.',
        },
        (entity) => {
          const invoice = entity as SaleInvoice;
          const subtotal = num(invoice.subtotal);
          const tax = num(invoice.tax);
          const total = num(invoice.total);
          if (subtotal === null || tax === null || total === null) return null;
          const discount = num(invoice.discount) ?? 0;
          const expected = subtotal + tax - discount;
          return {
            ok: approxEqual(total, expected, 0.01),
            explanation: `Total ${total} vs subtotal ${subtotal} + VAT ${tax} - discount ${discount} = ${expected.toFixed(2)}`,
          };
        },
      ),
      perEntityRule(
        {
          id: 'gh-vat-rate-band',
          name: 'VAT rate within the Ghanaian standard band',
          category: 'tax',
          severity: 'warning',
          entityTypes: ['sale_invoice'],
          description:
            'When VAT is charged, the implied rate is expected between 10% and 25% for standard-rated supplies.',
        },
        (entity) => {
          const invoice = entity as SaleInvoice;
          const subtotal = num(invoice.subtotal);
          const tax = num(invoice.tax);
          if (subtotal === null || tax === null || subtotal <= 0 || tax <= 0) return null;
          const rate = tax / subtotal;
          return {
            ok: rate >= 0.1 && rate <= 0.25,
            explanation: `Implied VAT rate is ${(rate * 100).toFixed(1)}% (expected 10%–25%)`,
          };
        },
      ),
      perEntityRule(
        {
          id: 'gh-vat-currency',
          name: 'Invoice currency is Ghana Cedi',
          category: 'currency',
          severity: 'warning',
          entityTypes: ['sale_invoice'],
          description: 'Invoices in the GH jurisdiction are expected to be denominated in GHS.',
        },
        (entity) => {
          const currency = asRecord(entity).currency;
          if (typeof currency !== 'string' || currency.trim() === '') return null;
          return {
            ok: currency.toUpperCase() === 'GHS',
            explanation: `Invoice currency is ${currency} (expected GHS)`,
          };
        },
      ),
    ];
  }
}
