# API Connector Pipeline Phases

TME is moving from a file-first migration tool into an API-to-API transaction migration engine.

## Phase 1 - Connector Surface and Pull Preview

Implemented first:

- connector categories for ecommerce, ERP, accounting, custom API and Stan Jay destinations;
- connector setup forms generated from each plugin manifest;
- WooCommerce, Odoo and QuickBooks connector manifests;
- encrypted connection storage through the existing integration service;
- connection discovery through the connector SDK `discover` capability;
- pull preview through the connector SDK `read` capability;
- pipeline run inputs for source resource, entity type, source connection and destination connection.

This phase proves the product workflow:

```text
source API connection
  -> discover resources
  -> pull records
  -> normalize to SJBL
  -> validate/review
  -> write to destination connection
```

## Phase 2 - Vendor Translators

Next, each vendor connector needs real API translators:

- WooCommerce: customers, products, orders, refunds and payments.
- Odoo: `res.partner`, `product.product`, `account.move`, `purchase.order`.
- QuickBooks: customers, vendors, items, invoices, payments, accounts and tax rates.

Each translator should convert vendor payloads into SJBL entities and convert SJBL writes back into vendor API payloads.

## Phase 3 - OAuth and Credential Flows

QuickBooks and similar platforms need full OAuth:

- connect button;
- authorization callback;
- refresh token storage;
- token refresh before pull/write;
- scope validation.

API-key systems can continue using encrypted secret fields.

## Phase 4 - Production Pipeline Controls

Before production migrations, pipelines need:

- selectable source resources from discovery;
- dry-run write simulation;
- rate-limit handling;
- retry and checkpoint resume;
- duplicate detection;
- destination reference matching;
- audit evidence for source ID to destination ID mapping.

## Phase 5 - Scheduling and Sync

After one-time migrations work reliably:

- scheduled pulls;
- incremental sync using checkpoints;
- webhooks/watchers where the vendor supports them;
- conflict review queues;
- rollback/compensation policies.
