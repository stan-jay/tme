# P1 — Knowledge Pack Engine

Knowledge packs are the platform's deterministic reasoning layer. AI may propose
mappings and interpretations, but **versioned, deterministic rules decide
whether financial data is acceptable**. Every decision carries the pack id,
version, rule id, outcome and a human-readable explanation that serves as
evidence.

## Contracts

Defined in `packages/shared/src/knowledge.ts`:

- `KnowledgePackManifest` — id, version, system family, supported entity types,
  jurisdictions, currencies.
- `KnowledgeRule` — id, category, severity (`error` | `warning` | `information`),
  applicable entity types, description, optional source reference.
- `KnowledgeEvaluation` — issues plus per-rule, per-entity decisions.
- `KnowledgePack` — `rules()` and `evaluate(entities, context)`.

## Backend

```
apps/backend/src/platform/knowledge/
  base-knowledge-pack.ts        BaseKnowledgePack + perEntityRule/batchRule helpers
  knowledge-pack.registry.ts    vendor-neutral registry (resolve by id@version or latest)
  knowledge-engine.service.ts   evaluates N packs, aggregates evidence, reaches approval
  knowledge-bootstrap.service.ts registers the built-in packs (composition root)
  knowledge.controller.ts       GET /platform/knowledge/packs (manifests + rules)
  packs/ghana-vat.pack.ts
  packs/stan-jay-accounting.pack.ts
  packs/spreadsheet-import.pack.ts
```

The engine returns `approved = (no error-severity rule failed)`, plus error and
warning counts, the issue list and per-pack evaluations. `information`-severity
findings are advisory and never block.

## Built-in packs

- **Ghana VAT (`ghana-vat@2024.1`)** — non-negative VAT (error), total reconciles
  with subtotal + VAT − discount (error), implied VAT rate within the 10–25%
  standard band (warning), GHS currency expected in the GH jurisdiction
  (warning).
- **Stan Jay Accounting (`stan-jay-accounting@0.1.0`)** — required customer name,
  product price, invoice core fields and line items (errors); line totals
  reconcile with subtotal and total reconciles with subtotal + tax (posting
  errors); payment must reference a party and carry a positive amount (errors);
  credit note should reference a customer (information).
- **Spreadsheet Import (`spreadsheet-import@1.0.0`)** — duplicate source
  identifiers (warning), unparseable dates (error), missing currency
  (information), untrimmed names (information).

## Pipeline integration

The `decide` stage evaluates the packs attached to the pipeline definition
(`PipelineDefinition.knowledgePackIds`) plus any pack on the stage. The standard
migration pipeline attaches `spreadsheet-import` and `stan-jay-accounting` by
default; admins can attach `ghana-vat` or future packs per definition without
code changes. A rejected decision fails the stage, so a run is never reported as
successful after a blocking knowledge failure. Stage output records the
approval, counts and a capped sample of issues and evidence.

## Verification

- 25 backend tests pass, including 7 covering pack outcomes and engine
  aggregation (approval, blocking failures, warnings, duplicate detection,
  unknown packs).
- Backend type-check, production build and frontend type-check pass.

## Next

- Knowledge-pack-driven mapping suggestions (`MappingProvider`) so packs guide
  field translation, not only acceptance.
- Per-jurisdiction pack selection from the destination connection / organization
  profile.
- A QuickBooks / Odoo / WooCommerce pack per the moat strategy.
