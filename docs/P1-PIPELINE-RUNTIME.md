# P1 Durable Pipeline Runtime

Implemented on June 25, 2026.

## Durable state

PostgreSQL stores:

- versioned pipeline definitions;
- normalized stage definitions and dependencies;
- idempotent pipeline runs;
- stage attempts, checkpoints, output and errors;
- entity partitions and dependency levels;
- cancellation and completion evidence.

Redis is not authoritative. Losing Redis does not lose pipeline state.

## Dispatch modes

### Redis/BullMQ

Set:

```env
PIPELINE_QUEUE_DRIVER=redis
REDIS_URL=redis://localhost:6379
```

This is the production path for horizontally scaled workers. Redis 7.0.15
inside Ubuntu WSL was live-tested locally with authenticated BullMQ jobs.

### PostgreSQL dispatcher

Set:

```env
PIPELINE_QUEUE_DRIVER=database
```

This durable fallback atomically claims queued stages and is suitable for
local development and low-volume recovery. It was used for the live tests
because Redis was unavailable locally.

## Execution model

- Stage graphs are validated as DAGs.
- Root stages queue immediately.
- Dependent stages remain blocked until every prerequisite completes.
- Independent stages release concurrently.
- Stage claims are atomic.
- Retries use exponential backoff with configured limits.
- Stale running stages are recovered after interrupted workers.
- Idempotency keys prevent duplicate runs.
- Checkpoints and outputs are stored after every successful stage.
- Queued and blocked work can be cancelled.

Running handlers currently finish cooperatively before the run settles as
cancelled. Handler-specific abort signals are a subsequent refinement.

## Entity partitions

When `input.entities` contains SJBL entities, write stages persist partitions
by dependency level. Partitions at one level execute with bounded concurrency;
the next level waits.

Example:

```text
Level 0: customer, supplier, product
Level 1: invoice, purchase order
Level 2: payment, shipment
```

## Migration template

The standard migration operation is now available as a pipeline template:

```text
read
├── archive
└── map → normalize
              ├── validate
              └── relate
                    ↓
                  decide → write → verify
```

The existing `/migration` workflow remains available during transition.
Future work will route its concrete ingestion and SJBL artifacts through these
stage handlers.

## Verified

- Authenticated Redis/BullMQ dispatch completed successfully.
- BullMQ retry/backoff succeeded on attempt two.
- Redis append-only persistence is enabled and healthy.
- Nine-stage migration template completed successfully.
- Parallel dependency release completed correctly.
- Retry/backoff succeeded on attempt two.
- Cancellation reached a durable cancelled state.
- Pipeline definition and run idempotency persisted in PostgreSQL.
- Backend/frontend type checks and production builds passed.
