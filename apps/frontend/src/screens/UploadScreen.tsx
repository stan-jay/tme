import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '../api';

interface Mapping {
  sourceColumn: string;
  targetField: string;
  confidence: number;
  suggestedType?: string;
}

interface Analysis {
  migrationId: string;
  status: string;
  rows: number;
  columns: string[];
  entityType?: string;
  suggestedMappings: Mapping[];
}

interface ScanAnalysis {
  uploadId: string;
  sourceKind: 'pdf' | 'image';
  extractionMode: 'embedded-text' | 'ocr' | 'ocr-required';
  ocr?: {
    provider: string;
    status: 'available' | 'unavailable';
    averageConfidence: number;
    blockCount: number;
  };
  confidence: number;
  entities: Array<{ id: string; type: string; [key: string]: unknown }>;
  evidence: Array<{ field: string; value: unknown; confidence: number; source: string; note: string }>;
  warnings: string[];
}

type UserRole = 'ADMIN' | 'REVIEWER' | 'EXECUTOR' | 'UPLOADER';
type UploadResult = Analysis | ScanAnalysis;

interface BatchItem {
  id: string;
  name: string;
  size: number;
  status: 'queued' | 'processing' | 'analyzed' | 'failed';
  message: string;
}

export function UploadScreen({ token, role }: { token: string; role: UserRole }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [mappingsConfirmed, setMappingsConfirmed] = useState(false);
  const [destinationConnectionId, setDestinationConnectionId] = useState('');
  const [automationMessage, setAutomationMessage] = useState('');
  const [scanAnalysis, setScanAnalysis] = useState<ScanAnalysis | null>(null);
  const [scanMigration, setScanMigration] = useState<{
    migrationId: string;
    status: string;
    validation?: { healthScore: number; readyToImport: boolean; issues: Array<{ type: string; message: string }> };
    simulation?: { estimatedSuccess: number } | null;
  } | null>(null);
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const connections = useQuery({
    queryKey: ['available-integrations', token],
    queryFn: () => apiFetch<Array<{
      id: string;
      name: string;
      pluginName: string;
      capabilities: string[];
      supportedEntityTypes: string[];
    }>>('/platform/integrations/available', token),
    enabled: role === 'ADMIN' || role === 'REVIEWER' || role === 'EXECUTOR',
  });
  const writers = (connections.data || []).filter(
    (connection) => connection.capabilities.includes('write'),
  );
  const selectedWriter = writers.find((connection) => connection.id === destinationConnectionId);
  const detectedEntityType = analysis?.entityType || analysis?.suggestedMappings.find((mapping) => mapping.suggestedType)?.suggestedType;
  const destinationSupportsEntity =
    !selectedWriter ||
    !detectedEntityType ||
    selectedWriter.supportedEntityTypes.length === 0 ||
    selectedWriter.supportedEntityTypes.includes(detectedEntityType);
  const canConfirmMappings = role === 'ADMIN' || role === 'REVIEWER';
  const canImport = role === 'ADMIN' || role === 'EXECUTOR';

  const upload = useMutation({
    mutationFn: async (file: File): Promise<UploadResult> => {
      const form = new FormData();
      form.append('file', file);
      const stored = await apiFetch<{ uploadId: string }>('/migration/upload', token, {
        method: 'POST',
        body: form,
      });
      const lowerName = file.name.toLowerCase();
      if (/\.(pdf|png|jpe?g|tiff?)$/.test(lowerName)) {
        return apiFetch<ScanAnalysis>(`/migration/scans/${stored.uploadId}/analyze`, token, {
          method: 'POST',
        });
      }
      const sourceType = lowerName.endsWith('.csv') ? 'csv' : 'excel';
      return apiFetch<Analysis>('/migration/analyze', token, {
        method: 'POST',
        body: JSON.stringify({ uploadId: stored.uploadId, sourceType }),
      });
    },
    onSuccess: (data) => {
      if ('extractionMode' in data) {
        setScanAnalysis(data);
        setAnalysis(null);
      } else {
        setAnalysis(data);
        setScanAnalysis(null);
      }
      setMappingsConfirmed(false);
      setDestinationConnectionId('');
      setAutomationMessage('');
      validate.reset();
      simulate.reset();
      execute.reset();
      acceptScanDraft.reset();
      setScanMigration(null);
    },
  });

  async function processFiles(files: FileList | null) {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    const nextBatch = selected.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      name: file.name,
      size: file.size,
      status: 'queued' as const,
      message: 'Waiting for upload',
    }));
    setBatch(nextBatch);

    for (const file of selected) {
      const id = `${file.name}-${file.size}-${file.lastModified}`;
      setBatch((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: 'processing', message: 'Uploading and analyzing' } : item,
        ),
      );
      try {
        const result = await upload.mutateAsync(file);
        const message =
          'extractionMode' in result
            ? `${result.sourceKind.toUpperCase()} extraction · ${Math.round(result.confidence * 100)}% confidence`
            : `${result.rows} rows · ${result.columns.length} columns`;
        setBatch((current) =>
          current.map((item) =>
            item.id === id ? { ...item, status: 'analyzed', message } : item,
          ),
        );
      } catch (caught) {
        setBatch((current) =>
          current.map((item) =>
            item.id === id
              ? { ...item, status: 'failed', message: caught instanceof Error ? caught.message : 'Upload failed' }
              : item,
          ),
        );
      }
    }
  }

  const acceptScanDraft = useMutation({
    mutationFn: () =>
      apiFetch<{
        migrationId: string;
        status: string;
        validation: { healthScore: number; readyToImport: boolean; issues: Array<{ type: string; message: string }> };
        simulation: { estimatedSuccess: number } | null;
      }>(`/migration/scans/${scanAnalysis!.uploadId}/accept-draft`, token, {
        method: 'POST',
        body: JSON.stringify({
          entities: scanAnalysis!.entities,
          evidence: scanAnalysis!.evidence,
        }),
      }),
    onSuccess: (result) => {
      setScanMigration(result);
      setAutomationMessage('Scan draft accepted. Validation and simulation have been run under the governed migration flow.');
    },
  });

  const confirm = useMutation({
    mutationFn: () =>
      apiFetch(`/migration/migrations/${analysis!.migrationId}/mappings/confirm`, token, {
        method: 'POST',
        body: JSON.stringify({ mappings: analysis!.suggestedMappings }),
      }),
    onSuccess: async () => {
      setMappingsConfirmed(true);
      setAutomationMessage('Mappings confirmed. Running validation and simulation…');
      const validation = await validate.mutateAsync();
      if (validation.readyToImport) {
        await simulate.mutateAsync();
        setAutomationMessage('Validation and simulation completed. Review the result, then import.');
      } else {
        setAutomationMessage('Validation found blocking issues. Fix the source data or mappings before import.');
      }
    },
  });

  const validate = useMutation({
    mutationFn: () =>
      apiFetch<{ healthScore: number; issues: Array<{ type: string; message: string }>; readyToImport: boolean }>(
        `/migration/migrations/${analysis!.migrationId}/validate`,
        token,
        { method: 'POST' },
      ),
  });

  const simulate = useMutation({
    mutationFn: () =>
      apiFetch<{ estimatedSuccess: number }>(
        `/migration/migrations/${analysis!.migrationId}/simulate`,
        token,
        { method: 'POST' },
      ),
  });

  const execute = useMutation({
    mutationFn: () =>
      apiFetch<{ status: string; success: number; failed: number; skipped: number }>(
        `/migration/migrations/${analysis!.migrationId}/execute`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            destinationConnectionId,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      ),
  });

  const error = [upload, confirm, validate, simulate, execute, acceptScanDraft]
    .map((mutation) => mutation.error)
    .find(Boolean);

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Ingestion</p>
          <h1 className="page-title">Upload business data</h1>
          <p className="page-copy">
            Upload spreadsheets, PDFs or scans. TME validates and routes the import.
          </p>
        </div>
        <span className="badge success">Encrypted · Audited</span>
      </header>

      <section className="card">
        <div className="card-body">
          <div className="dropzone">
            <div className="dropzone-icon">↑</div>
            <div>
              <h2 style={{ margin: 0 }}>Choose one or more files</h2>
              <p className="muted">Each file becomes its own governed migration. Supported: .xlsx, .xls, .csv, .pdf, .png, .jpg, .jpeg, .tif, .tiff</p>
            </div>
            <input
              className="file-input"
              type="file"
              multiple
              accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.tif,.tiff"
              onChange={(event) => void processFiles(event.target.files)}
            />
          </div>
        </div>
      </section>
      {upload.isPending && <p className="callout">Uploading and analyzing…</p>}
      {error && <p className="callout danger">{error instanceof Error ? error.message : 'Request failed'}</p>}

      {batch.length > 0 && (
        <section className="card" style={{ marginTop: '1rem' }}>
          <div className="card-body">
            <p className="eyebrow">Batch</p>
            <h2 style={{ marginTop: 0 }}>Upload queue</h2>
            <div className="table-card">
              <table>
                <thead><tr><th>File</th><th>Size</th><th>Status</th><th>Result</th></tr></thead>
                <tbody>
                  {batch.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{formatBytes(item.size)}</td>
                      <td><span className={`badge ${badgeForBatchStatus(item.status)}`}>{item.status}</span></td>
                      <td>{item.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {scanAnalysis && (
        <section className="card" style={{ marginTop: '1rem' }}>
          <div className="card-body">
          <p className="eyebrow">Document intelligence</p>
          <h2 style={{ marginTop: 0 }}>Scan / document extraction</h2>
          <p>
            <span className="badge">{scanAnalysis.sourceKind}</span>{' '}
            <span className="badge warning">{scanAnalysis.extractionMode}</span>{' '}
            <span className="badge success">{Math.round(scanAnalysis.confidence * 100)}% confidence</span>
          </p>
          {scanAnalysis.ocr && (
            <p className="muted">
              OCR: {scanAnalysis.ocr.provider} · {scanAnalysis.ocr.status} · average confidence{' '}
              {Math.round(scanAnalysis.ocr.averageConfidence * 100)}% · {scanAnalysis.ocr.blockCount} text blocks
            </p>
          )}
          {scanAnalysis.extractionMode === 'ocr-required' && (
            <p className="callout warning">
              This document needs OCR before it can become a trusted import. The platform seam is ready; an OCR worker/provider should be attached next.
            </p>
          )}
          {scanAnalysis.warnings.length > 0 && (
            <ul>
              {scanAnalysis.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          )}
          <h3>Draft SJBL entities</h3>
          <pre className="callout">
            {JSON.stringify(scanAnalysis.entities, null, 2)}
          </pre>
          <h3>Extraction evidence</h3>
          <div className="table-card">
          <table>
            <thead><tr><th>Field</th><th>Value</th><th>Confidence</th><th>Source</th></tr></thead>
            <tbody>
              {scanAnalysis.evidence.map((item, index) => (
                <tr key={`${item.field}-${index}`}>
                  <td>{item.field}</td>
                  <td>{String(item.value)}</td>
                  <td>{Math.round(item.confidence * 100)}%</td>
                  <td>{item.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="button-row" style={{ marginTop: 16 }}>
            <button
              className="btn primary"
              disabled={!canConfirmMappings || acceptScanDraft.isPending || scanAnalysis.extractionMode === 'ocr-required'}
              onClick={() => acceptScanDraft.mutate()}
              title={!canConfirmMappings ? 'A reviewer or admin must accept scan drafts' : undefined}
            >
              Accept reviewed draft and run checks
            </button>
            {scanAnalysis.extractionMode === 'ocr-required' && (
              <p className="callout warning">Attach/enable OCR before this scan can be accepted into the migration flow.</p>
            )}
          </div>
          {scanMigration && (
            <div className="callout" style={{ marginTop: 16 }}>
              <h3>Governed migration created</h3>
              <p>Migration: {scanMigration.migrationId} · status {scanMigration.status}</p>
              {scanMigration.validation && (
                <p>
                  Validation: {scanMigration.validation.healthScore}% ·{' '}
                  {scanMigration.validation.readyToImport ? 'ready after simulation' : 'blocked'}
                </p>
              )}
              {scanMigration.simulation && (
                <p>Estimated success: {Math.round(scanMigration.simulation.estimatedSuccess * 100)}%</p>
              )}
            </div>
          )}
          </div>
        </section>
      )}

      {analysis && (
        <section className="card" style={{ marginTop: '1rem' }}>
          <div className="card-body">
          <p className="eyebrow">Spreadsheet analysis</p>
          <h2 style={{ marginTop: 0 }}>Analysis</h2>
          <p>
            {analysis.rows} rows and {analysis.columns.length} columns detected
            {detectedEntityType ? ` · SJBL entity: ${detectedEntityType}` : ''}.
          </p>
          <div className="table-card">
          <table>
            <thead><tr><th>Source</th><th>Target</th><th>Confidence</th></tr></thead>
            <tbody>
              {analysis.suggestedMappings.map((mapping) => (
                <tr key={mapping.sourceColumn}>
                  <td>{mapping.sourceColumn}</td>
                  <td>{mapping.targetField}</td>
                  <td>{Math.round(mapping.confidence * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <div className="button-row" style={{ marginTop: 20 }}>
            <label>
              Destination
              <select
                value={destinationConnectionId}
                onChange={(event) => setDestinationConnectionId(event.target.value)}
              >
                <option value="">Select destination</option>
                {writers.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.name} — {connection.pluginName}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn primary"
              onClick={() => confirm.mutate()}
              disabled={!canConfirmMappings || mappingsConfirmed || confirm.isPending || validate.isPending || simulate.isPending}
              title={!canConfirmMappings ? 'A reviewer or admin must confirm mappings' : undefined}
            >
              {mappingsConfirmed ? 'Mappings confirmed' : 'Confirm mappings and auto-check'}
            </button>
            <button
              className="btn secondary"
              onClick={() => execute.mutate()}
              disabled={
                !canImport ||
                !simulate.isSuccess ||
                !destinationConnectionId ||
                !destinationSupportsEntity ||
                execute.isPending
              }
              title={!canImport ? 'An executor or admin must perform the final import' : undefined}
            >
              Import
            </button>
          </div>

          {!canConfirmMappings && (
            <p className="callout warning">A reviewer or admin must confirm mappings before this file can proceed.</p>
          )}
          {role === 'UPLOADER' && (
            <p className="callout warning">Upload is complete. A reviewer and executor will handle approval and import gates.</p>
          )}
          {automationMessage && <p className="callout">{automationMessage}</p>}
          {selectedWriter && !destinationSupportsEntity && (
            <p className="callout danger">
              {selectedWriter.name} cannot accept {detectedEntityType} records. Choose a compatible destination before import.
            </p>
          )}
          {!writers.length && connections.isSuccess && canImport && (
            <p className="callout warning">No connected writer destination is available. Ask an admin to enable one.</p>
          )}

          {validate.data && (
            <div>
              <h3>Validation: {validate.data.healthScore}%</h3>
              <p>{validate.data.readyToImport ? 'Ready after simulation.' : 'Blocked until validation errors are fixed.'}</p>
              <ul>{validate.data.issues.slice(0, 20).map((issue, index) => <li key={index}>{issue.type}: {issue.message}</li>)}</ul>
            </div>
          )}
          {simulate.data && <p>Estimated success: {Math.round(simulate.data.estimatedSuccess * 100)}%</p>}
          {execute.data && (
            <p className="callout">
              Status: {execute.data.status}; succeeded {execute.data.success}, failed {execute.data.failed},
              idempotently skipped {execute.data.skipped}.
            </p>
          )}
          </div>
        </section>
      )}
    </main>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function badgeForBatchStatus(status: BatchItem['status']): string {
  if (status === 'analyzed') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'processing') return 'warning';
  return '';
}
