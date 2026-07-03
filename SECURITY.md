# Security Policy

TME is a private Stan Jay Solutions product repository.

Do not report security vulnerabilities, credentials, customer data exposure, or production incidents in public issues, pull requests, screenshots, or chat threads.

## Reporting a Security Issue

Report security concerns through the internal Stan Jay Solutions security process documented in the `stan_jay_dev_program` repository.

Include:

- Affected service, route, workflow, or dependency
- Clear reproduction steps
- Impact assessment
- Relevant logs or screenshots with secrets and customer data removed
- Suggested mitigation, if known

## Sensitive Data Rules

Do not commit or share:

- API keys
- Access tokens
- `.env` files
- Customer records
- Production database dumps
- Private integration credentials
- Unredacted logs containing secrets or business data

Use sanitized fixtures for tests and documentation.

## Security Expectations

Changes touching authentication, authorization, tenant isolation, uploads, integrations, pipeline execution, audit logging, encryption, or credentials require careful review.

Pull requests in these areas should explain:

- Access-control impact
- Tenant isolation impact
- Audit-log impact
- Data-retention impact
- Failure and retry behavior
- Any new secret or configuration requirement
