import { useQuery } from '@tanstack/react-query';
import { API_URL, apiFetch } from '../api';

type UserRole = 'ADMIN' | 'REVIEWER' | 'EXECUTOR' | 'UPLOADER';

interface Migration {
  id: string;
  status: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
}

interface WorkItem {
  id: string;
  gate: 'review' | 'execute';
  nextAction: string;
}

interface AvailableConnection {
  id: string;
  capabilities: string[];
}

export function DashboardScreen({ token, role }: { token: string; role: UserRole }) {
  const health = useQuery({
    queryKey: ['backend-health', token],
    queryFn: () => apiFetch<{ status: string; service: string }>('/migration/health', token),
    refetchInterval: 15000,
  });
  const migrations = useQuery({
    queryKey: ['dashboard-migrations', token],
    queryFn: () => apiFetch<Migration[]>('/migration/migrations', token),
  });
  const worklist = useQuery({
    queryKey: ['dashboard-worklist', token],
    queryFn: () => apiFetch<WorkItem[]>('/migration/worklist', token),
    enabled: role === 'ADMIN' || role === 'REVIEWER' || role === 'EXECUTOR',
  });
  const connections = useQuery({
    queryKey: ['dashboard-connections', token],
    queryFn: () => apiFetch<AvailableConnection[]>('/platform/integrations/available', token),
    enabled: role === 'ADMIN' || role === 'REVIEWER' || role === 'EXECUTOR',
  });

  const migrationRows = (migrations.data || []).reduce(
    (current, migration) => ({
      total: current.total + migration.totalRows,
      success: current.success + migration.successRows,
      failed: current.failed + migration.failedRows,
    }),
    { total: 0, success: 0, failed: 0 },
  );
  const pendingReview = (worklist.data || []).filter((item) => item.gate === 'review').length;
  const pendingExecution = (worklist.data || []).filter((item) => item.gate === 'execute').length;
  const writerCount = (connections.data || []).filter((connection) => connection.capabilities.includes('write')).length;
  const hasConnectionError = health.error || migrations.error || worklist.error || connections.error;

  return (
    <main className="page wide">
      <header className="page-header">
        <div>
          <p className="eyebrow">Control room</p>
          <h1 className="page-title">Transaction Migration Engine</h1>
          <p className="page-copy">
            Monitor backend connectivity, migration work, connector readiness and governed import flow from one place.
          </p>
        </div>
        <span className={`badge ${health.data?.status === 'ok' ? 'success' : health.isError ? 'danger' : 'warning'}`}>
          Backend {health.data?.status || (health.isPending ? 'checking' : 'unavailable')}
        </span>
      </header>

      {hasConnectionError && (
        <p className="callout danger">
          {(hasConnectionError as Error).message}
        </p>
      )}

      <div className="grid four">
        <div className="metric-card">
          <div className="metric-label">API target</div>
          <p className="metric-value compact">{API_URL}</p>
        </div>
        <div className="metric-card">
          <div className="metric-label">Migrations</div>
          <p className="metric-value">{migrations.data?.length || 0}</p>
        </div>
        <div className="metric-card">
          <div className="metric-label">Pending review</div>
          <p className="metric-value">{pendingReview}</p>
        </div>
        <div className="metric-card">
          <div className="metric-label">Writer connections</div>
          <p className="metric-value">{writerCount}</p>
        </div>
      </div>

      <div className="grid two" style={{ marginTop: 16 }}>
        <section className="card">
          <div className="card-body">
            <p className="eyebrow">Readings</p>
            <h2 style={{ marginTop: 0 }}>Migration health</h2>
            <div className="bar-list">
              <MetricBar label="Rows processed" value={migrationRows.total} max={Math.max(1, migrationRows.total)} />
              <MetricBar label="Successful rows" value={migrationRows.success} max={Math.max(1, migrationRows.total)} tone="success" />
              <MetricBar label="Failed rows" value={migrationRows.failed} max={Math.max(1, migrationRows.total)} tone="danger" />
              <MetricBar label="Ready to execute" value={pendingExecution} max={Math.max(1, (worklist.data || []).length)} tone="warning" />
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-body">
            <p className="eyebrow">Flow</p>
            <h2 style={{ marginTop: 0 }}>Governed import path</h2>
            <ol className="flow-list">
              <li><strong>Ingest</strong><span>Upload spreadsheet, CSV, PDF or scan.</span></li>
              <li><strong>Analyze</strong><span>Detect columns, entity type, mappings and scan evidence.</span></li>
              <li><strong>Review</strong><span>Confirm mappings and resolve validation issues.</span></li>
              <li><strong>Simulate</strong><span>Estimate success before touching a destination system.</span></li>
              <li><strong>Execute</strong><span>Write through an approved connector with audit evidence.</span></li>
            </ol>
          </div>
        </section>
      </div>
    </main>
  );
}

function MetricBar({
  label,
  value,
  max,
  tone = '',
}: {
  label: string;
  value: number;
  max: number;
  tone?: 'success' | 'warning' | 'danger' | '';
}) {
  const width = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div className="metric-bar">
      <div className="metric-bar-head">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="metric-track">
        <div className={`metric-fill ${tone}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
