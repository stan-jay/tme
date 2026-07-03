# Transaction Migration Engine

Transaction Migration Engine (TME) is a secure, API-first platform for moving business records between systems such as Excel, CSV, WooCommerce, QuickBooks, Sage, Odoo, ERPNext, Zoho Books, Shopify, and custom ERP platforms.

The project centers on Stan Jay Business Language (SJBL), a canonical transaction format that lets TME validate, map, and import data through deterministic rules and auditable migration pipelines.

## What TME does

- Imports data from CSV, Excel, APIs, and other business systems
- Maps source fields into SJBL-compatible migration records
- Validates records before migration
- Detects duplicates and missing required fields
- Tracks migration jobs, pipeline runs, and migration history
- Produces audit logs for imported records
- Supports background processing with Redis and BullMQ
- Prepares clean data for ERP, accounting, POS, and commerce destinations

## Platform model

External systems speak different business languages. TME translates those languages into a canonical, versioned representation of entities, relationships, and rules. Migration is the first operation built on that foundation.

```text
Business system or file
        |
Reader + Mapper + Knowledge Pack
        |
SJBL
        |
Validation + Trust + Decision
        |
Writer + Verification
        |
Business system, archive, or analytical destination
```

The same runtime is intended to support migration, synchronization, replication, backup, archive, comparison, validation, and monitoring workflows.

## Core concepts

### SJBL

SJBL is the canonical language for customers, suppliers, products, accounts, taxes, invoices, purchases, payments, journals, inventory, employees, and other business concepts.

### Capability plugins

A business-system plugin can independently provide reader, writer, mapper, validator, watcher, and rollback capabilities. The dashboard discovers plugin manifests and avoids embedding vendor-specific workflow logic.

### Knowledge packs

Knowledge packs are versioned deterministic rules covering posting, tax, currency, inventory, relationships, required fields, common mistakes, and reversal behavior.

### Pipelines

Pipelines are dependency graphs. Independent stages and entity partitions can execute concurrently while dependent records retain deterministic ordering.

## Current focus

- CSV and Excel import workflows
- Universal transaction format and SJBL compatibility
- Validation and knowledge-pack rules
- Migration job tracking and pipeline orchestration
- Background processing and observability
- Developer-friendly documentation and contributor workflows

## Repository layout

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

## Local development

We recommend the following parent workspace layout:

```text
Projects/
├── setup/        # shared Docker services such as Postgres and Redis
├── tme/          # this repository
├── Erp/          # optional ERP target project
└── stanjay-foundation/
    └──           # internal company handbook, policies, templates, and onboarding
```

Start the shared services from the setup workspace, then run the backend and frontend from this repository.

```bash
cd /path/to/tme
npm install
npm run setup:db
npm run dev:backend
npm run dev:frontend
```

Backend: `http://localhost:4000`  
Frontend: `http://localhost:5173`

On Windows, `npm run dev:backend` automatically starts and discovers the authenticated Redis service inside Ubuntu WSL. See [docs/REDIS-WINDOWS-SETUP.md](docs/REDIS-WINDOWS-SETUP.md).

## Current implementation

- PostgreSQL tenant-aware persistence
- Authentication, RBAC, and audit records
- Secure opaque uploads
- Guarded migration workflow
- SJBL compatibility contracts
- Capability-based plugin SDK
- Plugin and knowledge-pack registries
- Vendor-independent writer resolution
- Dependency-wave and entity-partition planning
- Durable pipeline definitions, runs, checkpoints, and retries
- BullMQ/Redis dispatch with PostgreSQL fallback
- Idempotent, per-entity execution evidence

The current migration workflow is transitional. Integration administration and the durable pipeline runtime are now implemented. Remaining P1 work moves concrete SJBL artifacts through stage handlers and adds knowledge-pack execution, watch folders, and object storage.

## Quality gates

```bash
npm run typecheck
npm run test:backend -- --runInBand
npm run build --workspace @tme/backend
npm run build --workspace @tme/frontend
```

See [docs/architecture.md](docs/architecture.md) for architectural rules and [docs/SYSTEM-RESEARCH-TEMPLATE.md](docs/SYSTEM-RESEARCH-TEMPLATE.md) while researching accounting, ERP, POS, and commerce systems.

## Contributing

This is a private Stan Jay Solutions product repository. Developers must complete the company onboarding process before receiving access.

See [CONTRIBUTING.md](CONTRIBUTING.md) for repository-specific contribution rules. The internal `stanjay-foundation` repository is the source of truth for the company handbook, legal onboarding, engineering standards, access policy, and reusable project templates.

## License

TME is proprietary commercial software. Copyright (c) 2026 Stan Jay Solutions. All rights reserved.

See [LICENSE](LICENSE) for details.
