# Contributing to Transaction Migration Engine

Transaction Migration Engine (TME) is a private Stan Jay Solutions product repository.

Contributions are accepted only from authorized Stan Jay Solutions team members, contractors, and approved collaborators who have completed the required onboarding and access process.

## Before You Contribute

Before accessing or contributing to this repository, each developer must complete the company onboarding process maintained in the internal `stan_jay_dev_program` repository.

That process should include:

- Employment, contractor, or collaborator approval
- Confidentiality obligations
- Intellectual-property assignment terms where applicable
- GitHub access approval
- Security and secrets-handling expectations
- Development environment setup

This repository does not duplicate the full company handbook. The internal `stan_jay_dev_program` repository is the source of truth for company-wide policies, legal onboarding, engineering standards, reusable templates, and developer progression.

## Repository Scope

Use this repository for TME-specific work:

- Backend API and pipeline runtime
- Frontend administration experience
- SJBL compatibility and mapping behavior
- Knowledge-pack execution
- Connector and integration behavior
- Migration workflow and audit behavior
- TME-specific documentation and tests

Company-wide standards, legal templates, onboarding checklists, and reusable project templates belong in `stan_jay_dev_program`.

## Development Workflow

1. Pull the latest `main`.
2. Create a focused branch.
3. Keep changes small enough to review clearly.
4. Add or update tests when behavior changes.
5. Open a pull request using the repository template.
6. Wait for CI and review before merging.

Recommended branch names:

```text
feat/short-description
fix/short-description
docs/short-description
chore/short-description
```

## Commit Messages

Use clear conventional-style commit messages.

Good examples:

```text
feat: add integration connection test state
fix: correct invoice validation rule
docs: update backend setup instructions
refactor: simplify pipeline stage handler
test: add knowledge-pack decision coverage
chore: update contributor workflow guardrails
```

## Quality Gates

Run the relevant checks before opening a pull request.

```bash
npm run typecheck
npm run test:backend -- --runInBand
npm run build --workspace @tme/backend
npm run build --workspace @tme/frontend
```

CI runs these checks for pull requests and pushes to `main`.

## Security and Data Rules

Do not commit:

- `.env` files
- API keys
- Customer data
- Private business records
- Production database dumps
- Access tokens
- Credentials

Use sanitized sample data in tests and documentation.

## Architecture Rules

- Keep vendor-specific behavior in connectors, plugins, or knowledge packs.
- Keep platform code vendor-neutral where possible.
- Preserve tenant isolation, RBAC, audit logging, and idempotency guarantees.
- Keep SJBL compatibility in mind when changing canonical data structures.
- Document database, migration, or pipeline compatibility impacts in the pull request.

## License and Ownership

TME is proprietary commercial software owned by Stan Jay Solutions.

By contributing, you confirm that your contribution is authorized under the applicable Stan Jay Solutions employment, contractor, collaborator, confidentiality, and intellectual-property terms.

See [LICENSE](LICENSE) for repository license terms.
