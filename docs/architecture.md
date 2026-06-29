# Stan Jay Business Language Platform Architecture

## Architectural center

TME is no longer modeled as a collection of point-to-point connectors.

The stable center is **SJBL — Stan Jay Business Language**: a canonical,
versioned representation of business entities, rules and relationships.

```text
External business languages
        ↓
Reader + Mapper + Source Knowledge Pack
        ↓
SJBL document and relationship graph
        ↓
Trust, validation and decision layers
        ↓
Writer + Destination Knowledge Pack
        ↓
External business languages
```

Migration is one operation built on this language. The same pipeline
infrastructure can later run synchronization, replication, backup, archive,
comparison, validation and monitoring operations.

## Platform layers

```text
┌─────────────────────────────────────────────────────────────┐
│ Experiences                                                 │
│ Admin, pipeline designer, approvals, monitoring, SDK portal │
├─────────────────────────────────────────────────────────────┤
│ Operations                                                  │
│ Migration, sync, replication, backup, archive, comparison   │
├─────────────────────────────────────────────────────────────┤
│ Decision and Trust                                          │
│ Policy, approvals, verification, reconciliation, audit      │
├─────────────────────────────────────────────────────────────┤
│ SJBL                                                        │
│ Schemas, relationships, semantics, versions, invariants     │
├─────────────────────────────────────────────────────────────┤
│ Knowledge Packs                                             │
│ Tax, posting, currency, inventory and reversal behavior     │
├─────────────────────────────────────────────────────────────┤
│ Capability SDK                                              │
│ Reader, writer, mapper, validator, watcher, rollback        │
├─────────────────────────────────────────────────────────────┤
│ Runtime                                                     │
│ DAG planner, queues, checkpoints, partitions, retries       │
├─────────────────────────────────────────────────────────────┤
│ Adapters                                                    │
│ APIs, files, databases, folders, webhooks and object stores │
└─────────────────────────────────────────────────────────────┘
```

Dependencies point inward. Plugins depend on SJBL and SDK contracts. SJBL
never imports a vendor plugin, HTTP client, database driver or UI concept.

## SJBL boundaries

SJBL owns:

- canonical entities and value objects;
- relationship semantics;
- schema versions and compatibility rules;
- business identifiers and provenance;
- currency, decimal and temporal conventions;
- invariant validation.

SJBL does not own:

- vendor field names or API endpoints;
- authentication credentials;
- pipeline scheduling;
- UI forms;
- queue implementation;
- migration-specific state.

The existing `SJUTFEntity` name remains a compatibility alias. New code should
use `SJBLEntity` and `SJBLDocument`.

## Capability-based plugins

A business-system plugin is a manifest plus any subset of independent
capabilities:

- **Reader** — connects, discovers resources and streams source pages.
- **Writer** — writes SJBL entities and returns per-entity evidence.
- **Mapper** — translates source fields into SJBL semantics.
- **Validator** — applies system-specific acceptance rules.
- **Watcher** — emits changes from folders, APIs, webhooks or streams.
- **Rollback provider** — performs verified compensation where supported.

A system can therefore be read-only, write-only, validation-only or
comparison-only. The dashboard reads plugin manifests and configuration
schemas; it does not contain QuickBooks-, Odoo- or Stan-Jay-specific logic.

## Knowledge packs

Knowledge packs are versioned rule sets, independent of transport adapters.

Examples:

- QuickBooks accounting and reversal rules;
- Ghana VAT rules;
- Odoo posting-state behavior;
- WooCommerce refund and inventory behavior;
- Stan Jay required fields and account mappings.

Each decision records the pack ID, version, rule ID, outcome and explanation.
AI may propose mappings or interpretations, but deterministic knowledge rules
decide whether financial data is acceptable.

## Pipelines, elasticity and parallelism

A pipeline is a directed acyclic graph. Stages declare dependencies rather
than calling one another directly.

```text
                         ┌─ archive source ─┐
read → map → normalize ──┼─ validate ───────┼→ decide → write → verify
                         └─ profile data ───┘
```

Stages in the same dependency wave can run concurrently. SJBL entities are
partitioned by relationship level:

```text
Level 0: customers, suppliers, products, accounts
Level 1: invoices, purchase orders, inventory items
Level 2: payments, credit notes, shipments
```

P1 will execute these partitions through BullMQ with bounded concurrency.
Workers are stateless and horizontally scalable. PostgreSQL stores durable
state; object storage holds source files and artifacts; Redis carries jobs,
not authoritative business state.

## Failure model

Every stage must support:

- immutable input references;
- idempotency keys;
- durable checkpoints and cursors;
- bounded retries with classified errors;
- cancellation and timeout propagation;
- dead-letter handling;
- per-entity evidence;
- reconciliation after writes;
- compensation only where a plugin advertises and proves support.

Pipeline status is derived from stage and item outcomes. No stage may report
success merely because an exception was caught.

## Folder direction

```text
packages/shared/             SJBL and platform-neutral contracts
packages/connector-sdk/      plugin capability contracts
apps/backend/src/platform/   plugin registry, knowledge registry, pipeline runtime
apps/backend/src/engines/    reusable language/trust capabilities
apps/backend/src/connectors/ vendor plugins during the transition
apps/backend/src/migration/  one operation built on the pipeline foundation
```

Future vendor plugins should move to separate packages such as:

```text
packages/plugins/odoo/
packages/plugins/quickbooks/
packages/plugins/stan-jay/
packages/knowledge/ghana-vat/
packages/knowledge/odoo-accounting/
```

## Current transition

Implemented foundations:

- SJBL aliases and document contracts;
- capability-based SDK;
- plugin registry;
- knowledge-pack registry;
- vendor-independent execution lookup;
- tabular file reader separated from connector terminology;
- deterministic stage-wave and entity-partition planners;
- capability-backed stage handlers that flow the SJBL document through
  validation, relationship, decision and partitioned parallel write stages;
- migration executed as one pipeline operation: the orchestrator starts a
  durable pipeline run and the write stage performs dependency-level,
  bounded-parallel writes through the resolved destination writer;
- a deterministic Knowledge Pack engine: versioned packs (Ghana VAT, Stan Jay
  accounting, spreadsheet import) evaluate the SJBL document at the `decide`
  stage, recording per-rule evidence and blocking the run on error-severity
  failures. Packs are attached per pipeline definition, not hard-coded;
- a deterministic language engine: an SJBL semantic dictionary maps external
  column names to canonical fields, detects the entity type from the confirmed
  mappings (no longer forced to sale-invoice), coerces decimal/currency/date
  values, and synthesizes reconciled line items for document entities.

- a relationship engine that resolves cross-entity references by SJBL id and by
  business key (code or name) into typed edges, distinguishes genuine dangling
  references from external references that resolve in the destination, and feeds
  the `relate` stage;
- reusable mapping profiles: confirmed mappings are saved against an
  order-insensitive column fingerprint, so recurring imports of the same layout
  reuse them automatically instead of re-mapping.

Still transitional:

- the database and API still use the term `Migration` for the entry workflow;
- Stan Jay configuration still falls back to environment variables;
- read/map/normalize stages pass the SJBL document through until reader/mapper
  plugins source it directly;
- AI refinement of low-confidence mappings and knowledge-pack-driven mapping
  suggestions are not yet implemented; detection is rules-based and reproducible.

These become the next P1 workstreams.
