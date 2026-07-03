# Transaction Migration Engine

Transaction Migration Engine (TME) is an AI-assisted data migration platform for moving business records between systems such as Excel, CSV, WooCommerce, QuickBooks, Sage, Odoo, ERPNext, Zoho Books, Shopify, and custom ERP systems.

The goal is to help businesses migrate customers, suppliers, products, invoices, purchases, payments, journals, inventory records, and opening balances with better validation, audit trails, and error reporting.

TME is designed to handle real-world messy data and provide mappings, validation, and an auditable pipeline to import clean data into destination systems.

## What TME does

- Imports data from CSV, Excel, APIs, and other business systems
- Maps source fields to a universal migration format
- Validates records before migration
- Detects duplicates and missing required fields
- Tracks migration jobs and migration history
- Provides audit logs for every imported record
- Supports background processing for large migration jobs
- Prepares clean data for ERP, accounting, POS, and e-commerce systems

## Current focus

This project is currently focused on:

- CSV and Excel import
- Universal transaction format
- Validation rules
- Migration job tracking
- Background processing with Redis/BullMQ
- API-first architecture
- Developer-friendly documentation

## Local development workspace

We recommend the following parent workspace layout:

```
Projects/
├── setup/        # shared Docker services (Postgres, Redis, etc.)
├── tme/          # this repository
└── Erp/          # optional ERP target project
```

Start shared services from the `setup/` repository, then run the TME services from the `tme/` folder.

## Contributing

See CONTRIBUTING.md for contribution guidelines, commit format, and onboarding steps.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
# Stan Jay Business Language Platform

TME is a secure business-data pipeline platform centered on **SJBL — Stan Jay
Business Language**.

External systems speak different business languages. TME translates those
languages into a canonical, versioned representation of entities,
relationships and rules. Migration is the first operation built on that
foundation.

```text
Business system or file
        ↓
Reader + Mapper + Knowledge Pack
        ↓
SJBL
        ↓
Validation + Trust + Decision
        ↓
Writer + Verification
        ↓
Business system, archive or analytical destination
```

## Platform direction

The same runtime is intended to support:

- migration;
- synchronization;
- replication;
- backup and archive;
- comparison;
- validation;
- monitoring.

## Core concepts

### SJBL

The canonical language for customers, suppliers, products, accounts, taxes,
invoices, purchases, payments, journals, inventory, employees and other
business concepts.

### Capability plugins

A business-system plugin can independently provide:

- reader;
- writer;
- mapper;
- validator;
- watcher;
- rollback/compensation.

The dashboard discovers plugin manifests. It does not contain vendor-specific
workflow logic.

### Knowledge packs

Versioned deterministic rules covering posting, tax, currency, inventory,
relationships, required fields, common mistakes and reversal behavior.

### Pipelines

Pipelines are dependency graphs. Independent stages and entity partitions can
execute concurrently while dependent records retain deterministic ordering.

## Repository

```text
apps/
  backend/                 NestJS API and pipeline runtime
  frontend/                React administration experience
  worker/                  Transitional Python processing worker
packages/
  shared/                  SJBL and platform-neutral contracts
  connector-sdk/           Capability-based plugin SDK
docs/
  architecture.md          Target architecture and boundaries
  SYSTEM-RESEARCH-TEMPLATE.md
  P0-SECURITY-BASELINE.md
```

## Current implementation

- PostgreSQL tenant-aware persistence;
- authentication, RBAC and audit records;
- secure opaque uploads;
- guarded migration workflow;
- SJBL compatibility contracts;
- capability-based plugin SDK;
- plugin and knowledge-pack registries;
- vendor-independent writer resolution;
- dependency-wave and entity-partition planning;
- durable pipeline definitions, runs, checkpoints and retries;
- BullMQ/Redis dispatch with PostgreSQL fallback;
- idempotent, per-entity execution evidence.

The current migration workflow is transitional. Integration administration
and the durable pipeline runtime are now implemented. Remaining P1 work moves
concrete SJBL artifacts through stage handlers and adds knowledge-pack
execution, watch folders and object storage.

## Local development

```bash
npm install
npm run setup:db
npm run dev:backend
npm run dev:frontend
```

Backend: `http://localhost:4000`  
Frontend: `http://localhost:5173`

On Windows, `npm run dev:backend` automatically starts and discovers the
authenticated Redis service inside Ubuntu WSL. See
[docs/REDIS-WINDOWS-SETUP.md](docs/REDIS-WINDOWS-SETUP.md).

## Quality gates

```bash
npm run typecheck
npm run test:backend -- --runInBand
npm run build --workspace @tme/backend
npm run build --workspace @tme/frontend
```

See [docs/architecture.md](docs/architecture.md) for architectural rules and
[docs/SYSTEM-RESEARCH-TEMPLATE.md](docs/SYSTEM-RESEARCH-TEMPLATE.md) while
researching accounting, ERP, POS and commerce systems.
