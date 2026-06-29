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
