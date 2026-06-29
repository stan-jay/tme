# P1 Integration Administration

Implemented on June 25, 2026.

## Platform catalogue

Installed business-system plugins synchronize their manifests into PostgreSQL.
Administrators manage independent lifecycle controls:

- technical status;
- commercial status;
- globally enabled;
- new connections allowed;
- existing connections allowed.

A plugin cannot operate until it is both `TECHNICALLY_VERIFIED` and
commercially `APPROVED`.

## Organization connections

Administrators can:

- generate configuration forms from plugin manifests;
- create multiple named connections per organization;
- test connectivity;
- enable or disable a tested connection;
- rotate configuration and secrets;
- delete disabled connections.

Pipelines reference a connection ID, not a vendor name, URL or API key.

## Secret handling

- Secret fields are separated from public configuration.
- Secrets are encrypted with AES-256-GCM before database storage.
- Encrypted envelopes include a key ID for rotation.
- Secrets are never returned through API responses.
- The UI only displays the names of configured secret fields.
- Configuration changes automatically disable a connection and require a new
  successful test.

Production should replace the local environment-held master key with a cloud
KMS or Vault envelope-encryption provider.

## API

```text
GET    /platform/integrations/catalog
PATCH  /platform/integrations/catalog/:pluginId
GET    /platform/integrations/connections
GET    /platform/integrations/available
POST   /platform/integrations/connections
PATCH  /platform/integrations/connections/:id
POST   /platform/integrations/connections/:id/test
DELETE /platform/integrations/connections/:id
```

All endpoints require the administrator role and produce audit events.
The `available` endpoint is also accessible to reviewers and executors, and
returns only operational connection identity and capability metadata.
