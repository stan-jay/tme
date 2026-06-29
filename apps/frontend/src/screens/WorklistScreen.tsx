import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '../api';

type UserRole = 'ADMIN' | 'REVIEWER' | 'EXECUTOR' | 'UPLOADER';

interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  confidence: number;
}

interface WorkItem {
  id: string;
  name: string;
  sourceType: string;
  destination?: string;
  status: 'ANALYZED' | 'MAPPED' | 'VALIDATED' | 'SIMULATED';
  totalRows: number;
  createdAt: string;
  gate: 'review' | 'execute';
  nextAction: 'confirm_mappings' | 'validate' | 'simulate' | 'import';
  upload?: { originalName: string; extension: string; sizeBytes: number };
  columnMappings: ColumnMapping[];
  validationIssues: Array<{ type: string; message: string; rowNumber?: number; column?: string }>;
}

interface AvailableConnection {
  id: string;
  name: string;
  pluginName: string;
  capabilities: string[];
  supportedEntityTypes: string[];
}

export function WorklistScreen({ token, role }: { token: string; role: UserRole }) {
  const client = useQueryClient();
  const [destinationByMigration, setDestinationByMigration] = useState<Record<string, string>>({});
  const worklist = useQuery({
    queryKey: ['migration-worklist', token],
    queryFn: () => apiFetch<WorkItem[]>('/migration/worklist', token),
    refetchInterval: 5000,
  });
  const connections = useQuery({
    queryKey: ['available-integrations', token],
    queryFn: () => apiFetch<AvailableConnection[]>('/platform/integrations/available', token),
    enabled: role === 'ADMIN' || role === 'EXECUTOR',
  });
  const writers = (connections.data || []).filter((connection) => connection.capabilities.includes('write'));
  const refresh = () => client.invalidateQueries({ queryKey: ['migration-worklist'] });

  const confirm = useMutation({
    mutationFn: (item: WorkItem) =>
      apiFetch(`/migration/migrations/${item.id}/mappings/confirm`, token, {
        method: 'POST',
        body: JSON.stringify({ mappings: item.columnMappings }),
      }),
    onSuccess: refresh,
  });
  const validate = useMutation({
    mutationFn: (id: string) => apiFetch(`/migration/migrations/${id}/validate`, token, { method: 'POST' }),
    onSuccess: refresh,
  });
  const simulate = useMutation({
    mutationFn: (id: string) => apiFetch(`/migration/migrations/${id}/simulate`, token, { method: 'POST' }),
    onSuccess: refresh,
  });
  const execute = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/migration/migrations/${id}/execute`, token, {
        method: 'POST',
        body: JSON.stringify({
          destinationConnectionId: destinationByMigration[id],
          idempotencyKey: crypto.randomUUID(),
        }),
      }),
    onSuccess: refresh,
  });
  const error = [confirm.error, validate.error, simulate.error, execute.error].find(Boolean);

  if (worklist.isPending) return <p className="callout">Loading worklist...</p>;
  if (worklist.isError) return <p className="callout danger">{worklist.error.message}</p>;

  return (
    <main className="page wide">
      <header className="page-header">
        <div>
          <p className="eyebrow">Queue</p>
          <h1 className="page-title">Worklist</h1>
          <p className="page-copy">Review, validate, simulate, import.</p>
        </div>
        <span className="badge warning">{worklist.data.length} pending</span>
      </header>

      {error && <p className="callout danger">{error instanceof Error ? error.message : 'Worklist action failed'}</p>}
      {!worklist.data.length && <p className="callout">No pending work for your role. A clean queue is a beautiful thing.</p>}

      <div className="grid">
        {worklist.data.map((item) => (
          <article key={item.id} className="card">
            <div className="card-body">
              <div className="page-header" style={{ marginBottom: '0.75rem' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{item.name}</h3>
                  <p className="muted">
                    {item.sourceType} · {item.totalRows} record(s) · {item.upload?.originalName || 'canonical payload'}
                  </p>
                </div>
                <div className="button-row">
                  <span className={`badge ${item.gate === 'execute' ? 'success' : 'warning'}`}>{item.gate}</span>
                  <span className="badge">{item.status}</span>
                </div>
              </div>

              <p className="callout">
                Next action: <strong>{labelForAction(item.nextAction)}</strong>
              </p>

              {item.columnMappings.length > 0 && (
                <details>
                  <summary>Mappings ({item.columnMappings.length})</summary>
                  <div className="table-card" style={{ marginTop: 8 }}>
                    <table>
                      <thead><tr><th>Source</th><th>Target</th><th>Confidence</th></tr></thead>
                      <tbody>
                        {item.columnMappings.map((mapping) => (
                          <tr key={mapping.sourceColumn}>
                            <td>{mapping.sourceColumn}</td>
                            <td>{mapping.targetField}</td>
                            <td>{Math.round(mapping.confidence * 100)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              {item.validationIssues.length > 0 && (
                <details>
                  <summary>Validation issues ({item.validationIssues.length})</summary>
                  <ul>
                    {item.validationIssues.map((issue, index) => (
                      <li key={index}>{issue.type}: {issue.message}</li>
                    ))}
                  </ul>
                </details>
              )}

              {item.nextAction === 'import' && (
                <label style={{ marginTop: 12 }}>
                  Destination
                  <select
                    value={destinationByMigration[item.id] || ''}
                    onChange={(event) =>
                      setDestinationByMigration((current) => ({ ...current, [item.id]: event.target.value }))
                    }
                  >
                    <option value="">Select destination</option>
                    {writers.map((connection) => (
                      <option key={connection.id} value={connection.id}>
                        {connection.name} - {connection.pluginName}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="button-row" style={{ marginTop: 12 }}>
                {item.nextAction === 'confirm_mappings' && (
                  <button className="btn primary" onClick={() => confirm.mutate(item)} disabled={confirm.isPending}>
                    Confirm mappings
                  </button>
                )}
                {item.nextAction === 'validate' && (
                  <button className="btn primary" onClick={() => validate.mutate(item.id)} disabled={validate.isPending}>
                    Run validation
                  </button>
                )}
                {item.nextAction === 'simulate' && (
                  <button className="btn primary" onClick={() => simulate.mutate(item.id)} disabled={simulate.isPending}>
                    Run simulation
                  </button>
                )}
                {item.nextAction === 'import' && (
                  <button
                    className="btn primary"
                    onClick={() => execute.mutate(item.id)}
                    disabled={execute.isPending || !destinationByMigration[item.id]}
                  >
                    Import
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}

function labelForAction(action: WorkItem['nextAction']): string {
  switch (action) {
    case 'confirm_mappings':
      return 'Confirm mappings';
    case 'validate':
      return 'Run validation';
    case 'simulate':
      return 'Run simulation';
    case 'import':
      return 'Import to destination';
  }
}
