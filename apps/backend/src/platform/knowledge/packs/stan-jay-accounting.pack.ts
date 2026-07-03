import { Injectable } from '@nestjs/common';
import type { KnowledgePackManifest, LineItem, Payment, Product, SaleInvoice } from '@tme/shared';
import {
  approxEqual,
  asRecord,
  BaseKnowledgePack,
  EvaluableRule,
  nonEmptyString,
  num,
  perEntityRule,
} from '../base-knowledge-pack';

/**
 * Stan Jay accounting knowledge pack.
 *
 * Encodes the required fields and posting invariants the Stan Jay writer needs
 * to accept a document. These are deterministic acceptance rules independent of
 * the transport adapter, so the same rules apply whatever moves the data.
 */
@Injectable()
export class StanJayAccountingPack extends BaseKnowledgePack {
  readonly manifest: KnowledgePackManifest = {
    id: 'stan-jay-accounting',
    name: 'Stan Jay Accounting',
    version: '0.1.0',
    systemFamily: 'stan-jay',
    languageVersion: '1.0',
    supportedEntityTypes: ['customer', 'supplier', 'product', 'sale_invoice', 'purchase_order', 'payment', 'credit_note'],
  };

  protected rulesList(): EvaluableRule[] {
    return [
      perEntityRule(
        {
          id: 'sj-customer-name',
          name: 'Customer requires a name',
          category: 'required-field',
          severity: 'error',
          entityTypes: ['customer'],
          description: 'Stan Jay rejects customers without a name.',
        },
        (entity) => ({
          ok: nonEmptyString(asRecord(entity).name),
          explanation: 'Customer name is required',
        }),
      ),
      perEntityRule(
        {
          id: 'sj-supplier-name',
          name: 'Supplier requires a name',
          category: 'required-field',
          severity: 'error',
          entityTypes: ['supplier'],
          description: 'Stan Jay rejects suppliers without a name.',
        },
        (entity) => ({
          ok: nonEmptyString(asRecord(entity).name),
          explanation: 'Supplier name is required',
        }),
      ),
      perEntityRule(
        {
          id: 'sj-product-price',
          name: 'Product requires a non-negative unit price',
          category: 'required-field',
          severity: 'error',
          entityTypes: ['product'],
          description: 'Stan Jay requires a finite, non-negative unit price.',
        },
        (entity) => {
          const price = num((entity as Product).unitPrice);
          return {
            perEntityRule(
              {
                id: 'sj-debit-note-required',
                name: 'Debit note requires number, supplier, date and at least one line',
                category: 'required-field',
                severity: 'error',
                entityTypes: ['debit_note'],
                description: 'Stan Jay rejects debit notes missing core fields or line items.',
              },
              (entity) => {
                const note = entity as SaleInvoice;
                const missing: string[] = [];
                if (!nonEmptyString((entity as any).debitNoteNumber)) missing.push('debitNoteNumber');
                if (!nonEmptyString((note as any).supplierId)) missing.push('supplierId');
                if (!nonEmptyString(note.date)) missing.push('date');
                if (!Array.isArray(note.items) || note.items.length === 0) missing.push('items');
                return {
                  ok: missing.length === 0,
                  explanation: missing.length ? `Missing required fields: ${missing.join(', ')}` : 'All required fields present',
                };
              },
            ),
            ok: price !== null && price >= 0,
            explanation: `Unit price is ${(entity as Product).unitPrice}`,
          };
        },
      ),
      perEntityRule(
        {
          id: 'sj-purchase-order-required',
          name: 'Purchase order requires number, supplier, date and at least one line',
          category: 'required-field',
          severity: 'error',
          entityTypes: ['purchase_order'],
          description: 'Stan Jay rejects purchase orders missing core fields or line items.',
        },
        (entity) => {
          const order = entity as SaleInvoice;
          const missing: string[] = [];
          if (!nonEmptyString((entity as any).purchaseOrderNumber)) missing.push('purchaseOrderNumber');
          if (!nonEmptyString(order.supplierId)) missing.push('supplierId');
          if (!nonEmptyString(order.date)) missing.push('date');
          if (!Array.isArray(order.items) || order.items.length === 0) missing.push('items');
          return {
            ok: missing.length === 0,
            explanation: missing.length ? `Missing required fields: ${missing.join(', ')}` : 'All required fields present',
          };
        },
      ),
      perEntityRule(
        {
          id: 'sj-credit-note-required',
          name: 'Credit note requires number, customer, date and at least one line',
          category: 'required-field',
          severity: 'error',
          entityTypes: ['credit_note'],
          description: 'Stan Jay rejects credit notes missing core fields or line items.',
        },
        (entity) => {
          const creditNote = entity as SaleInvoice;
          const missing: string[] = [];
          if (!nonEmptyString((entity as any).creditNoteNumber)) missing.push('creditNoteNumber');
          if (!nonEmptyString(creditNote.customerId)) missing.push('customerId');
          if (!nonEmptyString(creditNote.date)) missing.push('date');
          if (!Array.isArray(creditNote.items) || creditNote.items.length === 0) missing.push('items');
          return {
            ok: missing.length === 0,
            explanation: missing.length ? `Missing required fields: ${missing.join(', ')}` : 'All required fields present',
          };
        },
      ),
      perEntityRule(
        {
          id: 'sj-invoice-required',
          name: 'Invoice requires number, customer, date and at least one line',
          category: 'required-field',
          severity: 'error',
          entityTypes: ['sale_invoice'],
          description: 'Stan Jay rejects invoices missing core fields or line items.',
        },
        (entity) => {
          const invoice = entity as SaleInvoice;
          const missing: string[] = [];
          if (!nonEmptyString(invoice.invoiceNumber)) missing.push('invoiceNumber');
          if (!nonEmptyString(invoice.customerId)) missing.push('customerId');
          if (!nonEmptyString(invoice.date)) missing.push('date');
          if (!Array.isArray(invoice.items) || invoice.items.length === 0) missing.push('items');
          return {
            ok: missing.length === 0,
            explanation: missing.length ? `Missing required fields: ${missing.join(', ')}` : 'All required fields present',
          };
        },
      ),
      perEntityRule(
        {
          id: 'sj-invoice-line-total',
          name: 'Invoice line items reconcile with subtotal',
          category: 'posting',
          severity: 'error',
          entityTypes: ['sale_invoice'],
          description: 'The sum of line totals must equal the invoice subtotal.',
        },
        (entity) => {
          const invoice = entity as SaleInvoice;
          if (!Array.isArray(invoice.items) || invoice.items.length === 0) return null;
          const subtotal = num(invoice.subtotal);
          if (subtotal === null) return null;
          const lineSum = invoice.items.reduce((total: number, line: LineItem) => total + (num(line.total) ?? 0), 0);
          return {
            ok: approxEqual(lineSum, subtotal, 0.05),
            explanation: `Line totals sum to ${lineSum.toFixed(2)} but subtotal is ${subtotal}`,
          };
        },
      ),
      perEntityRule(
        {
          id: 'sj-invoice-balance',
          name: 'Invoice total reconciles with subtotal and tax',
          category: 'posting',
          severity: 'error',
          entityTypes: ['sale_invoice'],
          description: 'Total must equal subtotal plus tax less any discount.',
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
            ok: approxEqual(total, expected, 0.05),
            explanation: `Total ${total} vs subtotal ${subtotal} + tax ${tax} - discount ${discount} = ${expected.toFixed(2)}`,
          };
        },
      ),
      perEntityRule(
        {
          id: 'sj-payment-party',
          name: 'Payment references a customer or supplier',
          category: 'relationship',
          severity: 'error',
          entityTypes: ['payment'],
          description: 'A payment must be linked to a customer or a supplier.',
        },
        (entity) => {
          const payment = entity as Payment;
          return {
            ok: nonEmptyString(payment.customerId) || nonEmptyString(payment.supplierId),
            explanation: 'Payment must reference a customerId or supplierId',
          };
        },
      ),
      perEntityRule(
        {
          id: 'sj-payment-amount',
          name: 'Payment requires a positive amount',
          category: 'required-field',
          severity: 'error',
          entityTypes: ['payment'],
          description: 'Stan Jay rejects payments without a positive amount.',
        },
        (entity) => {
          const amount = num((entity as Payment).amount);
          return { ok: amount !== null && amount > 0, explanation: `Payment amount is ${(entity as Payment).amount}` };
        },
      ),
      perEntityRule(
        {
          id: 'sj-credit-note-customer',
          name: 'Credit note references a customer',
          category: 'reversal',
          severity: 'information',
          entityTypes: ['credit_note'],
          description: 'Credit notes should reference the customer they reverse.',
        },
        (entity) => ({
          ok: nonEmptyString(asRecord(entity).customerId),
          explanation: 'Credit note should reference a customerId',
        }),
      ),
    ];
  }
}
