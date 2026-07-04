# TME Frontend Product Surface

This document captures the interface direction for TME so the frontend is built around the actual migration product, not just CRUD screens.

## Current Backend Contract

- Authentication: `POST /auth/login`
- Upload: `POST /migration/upload`
- Spreadsheet analysis: `POST /migration/analyze`
- Scan analysis: `POST /migration/scans/:uploadId/analyze`
- Scan draft acceptance: `POST /migration/scans/:uploadId/accept-draft`
- Mapping confirmation: `POST /migration/migrations/:id/mappings/confirm`
- Validation: `POST /migration/migrations/:id/validate`
- Simulation: `POST /migration/migrations/:id/simulate`
- Execution: `POST /migration/migrations/:id/execute`
- Worklist: `GET /migration/worklist`
- History: `GET /migration/migrations`
- Integrations: `/platform/integrations/*`
- Pipelines: `/platform/pipelines/*`

## Upload UX

The backend accepts one uploaded file per request today. The frontend should support selecting multiple files, but each file should become a separate upload and migration unless the product explicitly introduces a multi-file package model.

Multi-file package support should be considered when users need to upload related files together, for example:

- customers plus invoices plus payments
- multiple sheets exported as separate files
- source data plus supporting scanned documents
- one migration batch with shared destination and validation rules

Until then, the UI should process selected files as a queue and show per-file status.

## Analysis and Readings

The upload result should show:

- detected entity type
- row count
- column count
- mapping confidence
- low-confidence mappings
- validation health score
- blocking issue count
- simulation success estimate
- selected destination compatibility

## Graphs

Useful first graphs:

- migration status distribution
- rows processed over time
- validation issue categories
- mapping confidence by file
- pipeline stage duration and failure rate
- connector test success/failure history

These can be rendered from existing history, validation, and pipeline data first. Deeper analytics can come later.

## Connectors and SDKs

The UI should make the connector model clear:

- plugin catalog
- capabilities: reader, writer, mapper, validator, watcher, rollback
- technical approval status
- commercial approval status
- encrypted organization connections
- connection test result
- enabled/disabled state
- supported entity types

The connector SDK should remain a developer-facing package, while the UI exposes approved plugin manifests and organization connection management.

## Pages Needed

- Upload and batch queue
- Analysis detail
- Mapping review
- Validation issues
- Simulation summary
- Worklist
- Migration history with metrics
- Integrations and connector SDK admin
- Pipeline definitions and runs
- Analytics dashboard
- Settings and environment diagnostics

## Connectivity Requirements

The UI must clearly show:

- active API base URL
- backend connection failures
- request timeouts
- authentication errors
- role-based permission blockers
