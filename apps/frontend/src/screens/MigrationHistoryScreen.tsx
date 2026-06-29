import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api';

interface Migration {
  id: string;
  name: string;
  sourceType: string;
  destination?: string;
  status: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  createdAt: string;
}

export function MigrationHistoryScreen({ token }: { token: string }) {
  const query = useQuery({
    queryKey: ['migrations', token],
    queryFn: () => apiFetch<Migration[]>('/migration/migrations', token),
  });

  if (query.isPending) return <p className="callout">Loading migration history...</p>;
  if (query.isError) return <p className="callout danger">{query.error.message}</p>;

  return (
    <main className="page wide">
      <header className="page-header">
        <div>
          <p className="eyebrow">History</p>
          <h1 className="page-title">Migration history</h1>
          <p className="page-copy">Imports, destinations and outcomes.</p>
        </div>
        <span className="badge">{query.data.length} records</span>
      </header>
      <div className="table-card">
      <table>
        <thead>
          <tr><th>Name</th><th>Source</th><th>Destination</th><th>Status</th><th>Rows</th><th>Success</th><th>Created</th></tr>
        </thead>
        <tbody>
          {query.data.map((migration) => (
            <tr key={migration.id}>
              <td>{migration.name}</td>
              <td>{migration.sourceType}</td>
              <td>{migration.destination || 'Not selected'}</td>
              <td><span className={`badge ${badgeClass(migration.status)}`}>{migration.status}</span></td>
              <td>{migration.totalRows}</td>
              <td>{migration.successRows}/{migration.totalRows}</td>
              <td>{new Date(migration.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </main>
  );
}

function badgeClass(status: string): string {
  if (status.includes('COMPLETED')) return 'success';
  if (status.includes('FAILED') || status.includes('ROLLBACK')) return 'danger';
  if (['ANALYZED', 'MAPPED', 'VALIDATED', 'SIMULATED', 'EXECUTING'].includes(status)) return 'warning';
  return '';
}
