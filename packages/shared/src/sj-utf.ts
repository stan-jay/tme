/**
 * Legacy SJ-UTF compatibility types.
 * 
 * New platform code should use the SJBL names exported by `sjbl.ts`.
 * These interfaces remain the entity definitions while the codebase
 * transitions without breaking existing migrations and stored data.
 */

export type EntityType =
  | 'customer'
  | 'supplier'
  | 'contact'
  | 'product'
  | 'inventory_item'
  | 'sale_invoice'
  | 'purchase_order'
  | 'payment'
  | 'receipt'
  | 'expense'
  | 'credit_note'
  | 'debit_note'
  | 'journal_entry'
  | 'stock_movement'
  | 'bank_transaction'
  | 'tax_rate'
  | 'account'
  | 'project'
  | 'department'
  | 'employee'
  | 'shipment'
  | 'bank_account'
  | 'company';

export type EntityStatus =
  | 'active'
  | 'inactive'
  | 'draft'
  | 'issued'
  | 'approved'
  | 'rejected'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'pending'
  | 'received'
  | 'closed'
  | 'applied'
  | 'shipped'
  | 'in_transit'
  | 'delivered'
  | 'returned';

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  region?: string;
}

export interface ContactDetail {
  name?: string;
  email?: string;
  phone?: string;
  type?: 'billing' | 'shipping' | 'primary' | 'secondary';
  address?: Address;
}

export interface TaxDetail {
  taxCode?: string;
  taxRate?: number;
  taxAmount?: number;
  taxBase?: number;
}

export interface SJUTFEntity {
  id: string;
  type: EntityType;
  externalId?: string;
  externalSource?: string;
  organizationId?: string;
  currency?: string;
  status?: EntityStatus;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, any>;
}

export interface Customer extends SJUTFEntity {
  type: 'customer';
  name: string;
  email?: string;
  phone?: string;
  billingAddress?: Address;
  shippingAddress?: Address;
  taxId?: string;
  accountNumber?: string;
  creditLimit?: number;
  openBalance?: number;
  customerGroup?: string;
  preferredPaymentMethod?: string;
}

export interface Supplier extends SJUTFEntity {
  type: 'supplier';
  name: string;
  email?: string;
  phone?: string;
  billingAddress?: Address;
  shippingAddress?: Address;
  taxId?: string;
  supplierCode?: string;
  paymentTerms?: string;
}

export interface Contact extends SJUTFEntity {
  type: 'contact';
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  companyId?: string;
  address?: Address;
}

export interface Product extends SJUTFEntity {
  type: 'product';
  name: string;
  sku?: string;
  barcode?: string;
  description?: string;
  category?: string;
  unitPrice: number;
  unitCost?: number;
  quantity?: number;
  reorderLevel?: number;
  salesAccount?: string;
  purchaseAccount?: string;
  taxCode?: string;
}

export interface InventoryItem extends SJUTFEntity {
  type: 'inventory_item';
  productId: string;
  warehouseId?: string;
  quantity: number;
  unitCost: number;
  location?: string;
  lotNumber?: string;
  expiryDate?: string;
}

export interface LineItem {
  productId: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  tax?: number;
  total: number;
  departmentId?: string;
  projectId?: string;
}

export interface SaleInvoice extends SJUTFEntity {
  type: 'sale_invoice';
  invoiceNumber: string;
  customerId: string;
  date: string;
  dueDate?: string;
  billingAddress?: Address;
  shippingAddress?: Address;
  items: LineItem[];
  subtotal: number;
  discount?: number;
  tax: number;
  total: number;
  currency?: string;
  paymentTerms?: string;
  status: 'draft' | 'issued' | 'paid' | 'overdue' | 'cancelled';
  notes?: string;
  projectId?: string;
  departmentId?: string;
}

export interface PurchaseOrder extends SJUTFEntity {
  type: 'purchase_order';
  purchaseOrderNumber: string;
  supplierId: string;
  date: string;
  expectedDate?: string;
  items: LineItem[];
  subtotal: number;
  tax: number;
  total: number;
  currency?: string;
  status: 'draft' | 'issued' | 'received' | 'closed' | 'cancelled';
  deliveryAddress?: Address;
  paymentTerms?: string;
  notes?: string;
}

export interface Payment extends SJUTFEntity {
  type: 'payment';
  referenceNumber?: string;
  customerId?: string;
  supplierId?: string;
  relatedDocumentId?: string;
  amount: number;
  date: string;
  currency?: string;
  paymentMethod: 'cash' | 'cheque' | 'bank' | 'momo' | 'card' | 'other';
  bankAccountId?: string;
  notes?: string;
}

export interface Receipt extends SJUTFEntity {
  type: 'receipt';
  receiptNumber: string;
  sourceId?: string;
  amount: number;
  date: string;
  currency?: string;
  paymentMethod?: string;
  notes?: string;
}

export interface Expense extends SJUTFEntity {
  type: 'expense';
  expenseNumber: string;
  supplierId?: string;
  category?: string;
  date: string;
  amount: number;
  currency?: string;
  accountCode?: string;
  projectId?: string;
  departmentId?: string;
  reimbursable?: boolean;
  notes?: string;
}

export interface CreditNote extends SJUTFEntity {
  type: 'credit_note';
  creditNoteNumber: string;
  customerId: string;
  date: string;
  items: LineItem[];
  subtotal: number;
  tax: number;
  total: number;
  reason?: string;
  status?: 'draft' | 'issued' | 'applied' | 'cancelled';
}

export interface DebitNote extends SJUTFEntity {
  type: 'debit_note';
  debitNoteNumber: string;
  supplierId: string;
  date: string;
  items: LineItem[];
  subtotal: number;
  tax: number;
  total: number;
  reason?: string;
  status?: 'draft' | 'issued' | 'applied' | 'cancelled';
}

export interface JournalLine {
  accountCode: string;
  debit?: number;
  credit?: number;
  description?: string;
  departmentId?: string;
  projectId?: string;
}

export interface JournalEntry extends SJUTFEntity {
  type: 'journal_entry';
  referenceNumber: string;
  date: string;
  description: string;
  lines: JournalLine[];
  total: number;
  currency?: string;
}

export interface StockMovement extends SJUTFEntity {
  type: 'stock_movement';
  productId: string;
  fromLocation?: string;
  toLocation?: string;
  quantity: number;
  unitCost?: number;
  movementType?: 'receipt' | 'issue' | 'transfer' | 'adjustment';
  referenceNumber?: string;
  date: string;
  warehouseId?: string;
}

export interface BankTransaction extends SJUTFEntity {
  type: 'bank_transaction';
  transactionNumber: string;
  accountId: string;
  date: string;
  amount: number;
  currency?: string;
  transactionType?: 'deposit' | 'withdrawal' | 'transfer' | 'fee';
  description?: string;
}

export interface TaxRate extends SJUTFEntity {
  type: 'tax_rate';
  code: string;
  name: string;
  rate: number;
  jurisdiction?: string;
}

export interface BankAccount extends SJUTFEntity {
  type: 'bank_account';
  accountNumber: string;
  bankName: string;
  currency?: string;
  branch?: string;
  routingNumber?: string;
}

export interface Account extends SJUTFEntity {
  type: 'account';
  code: string;
  name: string;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  description?: string;
}

export interface Project extends SJUTFEntity {
  type: 'project';
  name: string;
  code?: string;
  managerId?: string;
  startDate?: string;
  endDate?: string;
}

export interface Department extends SJUTFEntity {
  type: 'department';
  name: string;
  code?: string;
}

export interface Employee extends SJUTFEntity {
  type: 'employee';
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  employeeId?: string;
  departmentId?: string;
  managerId?: string;
}

export interface Shipment extends SJUTFEntity {
  type: 'shipment';
  shipmentNumber: string;
  carrier?: string;
  trackingNumber?: string;
  shippedDate?: string;
  expectedDeliveryDate?: string;
  deliveryAddress?: Address;
  status?: 'pending' | 'shipped' | 'in_transit' | 'delivered' | 'returned';
}

export interface Company extends SJUTFEntity {
  type: 'company';
  name: string;
  registrationNumber?: string;
  taxId?: string;
  address?: Address;
  phone?: string;
  email?: string;
  website?: string;
}

export interface MigrationBatch {
  id: string;
  name: string;
  source: string;
  sourceType: 'excel' | 'csv' | 'pdf' | 'api' | 'other';
  destination: string;
  destinationType: string;
  entities: SJUTFEntity[];
  status:
    | 'pending'
    | 'analyzing'
    | 'mapping'
    | 'validating'
    | 'simulating'
    | 'executing'
    | 'completed'
    | 'failed'
    | 'rolled_back';
  createdAt: string;
  executedAt?: string;
  rolledBackAt?: string;
}
 
