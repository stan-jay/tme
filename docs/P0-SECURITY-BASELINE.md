# TME P0 Security and Reliability Baseline

Implemented on June 25, 2026.

## Included

- PostgreSQL database `sj_tme` with a versioned Prisma migration.
- Organization-scoped users, roles and migration ownership.
- Signed bearer authentication and scrypt password hashing.
- Admin, reviewer, executor and uploader role checks.
- Opaque upload IDs; clients never provide server filesystem paths.
- CSV/XLS/XLSX extension and signature checks, 25 MiB limit and retention metadata.
- Tenant-specific upload directories and SHA-256 file hashes.
- Strict request DTO validation and rejection of unknown request fields.
- Restricted CORS, security headers and IP rate limiting.
- Guarded migration state flow:
  `ANALYZED -> MAPPED -> VALIDATED -> SIMULATED -> EXECUTING`.
- Runtime validation of SJ-UTF before destination writes.
- Per-entity idempotency keys, request hashes and execution records.
- Destination timeouts and honest completed/partial/failed status reporting.
- Immutable application audit events for uploads, workflow changes, login-sensitive changes and execution.
- Explicit `ROLLBACK_UNAVAILABLE` behavior until a destination implements verified compensation.
- Production-oriented containers using migrations, health checks, non-root backend execution and an Nginx frontend.

## Local bootstrap account

- Organization slug: `stan-jay`
- Email: `admin@tme.local`
- Password: stored only in ignored local `.env` files

Change the bootstrap password immediately through:

```http
POST /auth/change-password
Authorization: Bearer <token>

{
  "currentPassword": "...",
  "newPassword": "..."
}
```

Remove `BOOTSTRAP_ADMIN_PASSWORD` from the runtime environment after the administrator exists.

## Required before real destination execution

1. Set a valid `STAN_JAY_API_URL` and `STAN_JAY_API_KEY`.
2. Confirm the Stan Jay API honors the `Idempotency-Key` request header.
3. Define and implement connector-specific compensation APIs before enabling rollback.
4. Add an external malware scanner such as ClamAV or a managed scanning service before accepting untrusted public uploads.

## Verified

- PostgreSQL migration applied successfully.
- Backend and frontend TypeScript checks pass.
- Backend and frontend production builds pass.
- Backend unit tests pass.
- Production dependency audit reports zero known vulnerabilities.
- Live smoke test confirmed authentication, upload, analysis, ownership, workflow blocking and validation rejection.
