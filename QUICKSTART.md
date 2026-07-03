# TME Quickstart

This quickstart is for authorized Stan Jay Solutions developers working in the private TME repository.

Complete the company onboarding process in the internal `stanjay-foundation` repository before using this guide.

## Prerequisites

- Node.js 20+
- npm
- PostgreSQL 14+
- Redis 6+ when using the Redis queue driver
- Access to the internal shared services setup, if using the standard local workspace

## Recommended Workspace

```text
Projects/
├── setup/                # shared local services
├── tme/                  # this repository
└── stanjay-foundation/   # internal handbook, policies, onboarding, and templates
```

## Setup

Install dependencies from the repository root.

```bash
cd /path/to/tme
npm install
```

Create local environment files.

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
```

Update `apps/backend/.env` with local values for:

```text
DATABASE_URL
AUTH_JWT_SECRET
BOOTSTRAP_ADMIN_EMAIL
BOOTSTRAP_ADMIN_PASSWORD
INTEGRATION_ENCRYPTION_KEY
PIPELINE_QUEUE_DRIVER
```

Do not commit `.env` files or real credentials.

## Database

Apply the Prisma schema to the configured database.

```bash
npm run setup:db
```

## Start the Apps

Backend:

```bash
npm run dev:backend
```

Frontend:

```bash
npm run dev:frontend
```

Default local URLs:

- Backend: `http://localhost:4000`
- Frontend: `http://localhost:5173`

On Windows, `npm run dev:backend` uses `scripts/start-backend.ps1` to build the backend and discover the authenticated Redis service inside Ubuntu WSL.

## Smoke Test

Authenticate with the bootstrap admin configured in `apps/backend/.env`.

```bash
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "organizationSlug": "stan-jay",
    "email": "admin@example.com",
    "password": "replace-with-a-strong-password"
  }'
```

Use the returned `accessToken` for guarded endpoints.

```bash
curl http://localhost:4000/migration/health \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Expected response:

```json
{
  "status": "ok",
  "service": "migration"
}
```

## Quality Gates

Run these before opening a pull request.

```bash
npm run typecheck
npm run test:backend -- --runInBand
npm run build --workspace @tme/backend
npm run build --workspace @tme/frontend
```

## Troubleshooting

PostgreSQL connection errors:

- Confirm the database is running.
- Check `DATABASE_URL` in `apps/backend/.env`.
- Run `npm run setup:db`.

Authentication errors:

- Confirm `AUTH_JWT_SECRET` is at least 32 characters.
- Confirm bootstrap organization, email, and password values.
- Restart the backend after environment changes.

Port conflicts:

- Backend defaults to port `4000`.
- Frontend defaults to port `5173`.
- Stop stale local processes or change `PORT` / frontend config.

Frontend cannot reach backend:

- Confirm the backend is running.
- Confirm `VITE_API_URL` in `apps/frontend/.env`.
- Confirm `CORS_ORIGINS` in `apps/backend/.env`.

## Internal References

- Repository-specific contribution rules: [CONTRIBUTING.md](CONTRIBUTING.md)
- Architecture: [docs/architecture.md](docs/architecture.md)
- Security baseline: [docs/P0-SECURITY-BASELINE.md](docs/P0-SECURITY-BASELINE.md)
- Company-wide handbook and onboarding: internal `stanjay-foundation` repository
