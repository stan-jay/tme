import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api';

interface PipelineStage {
  id: string;
  key: string;
  kind: string;
  dependsOn: string[];
}

interface PipelineDefinition {
  id: string;
  name: string;
  operation: string;
  status: string;
  version: number;
  stages: PipelineStage[];
}

interface PipelineStageRun {
  id: string;
  stageKey: string;
  status: string;
  attemptCount: number;
  errorMessage?: string;
}

interface PipelineRun {
  id: string;
  status: string;
  totalStages: number;
  completedStages: number;
  failedStages: number;
  createdAt: string;
  pipelineDefinition: { name: string };
  stageRuns: PipelineStageRun[];
}

interface AvailableConnection {
  id: string;
  name: string;
  pluginName: string;
  capabilities: string[];
  supportedEntityTypes: string[];
}

export function PipelinesScreen({ token }: { token: string }) {
  const client = useQueryClient();
  const [name, setName] = useState('Standard migration pipeline');
  const [sourceConnectionId, setSourceConnectionId] = useState('');
  const [destinationConnectionId, setDestinationConnectionId] = useState('');
  const definitions = useQuery({
    queryKey: ['pipeline-definitions', token],
    queryFn: () => apiFetch<PipelineDefinition[]>('/platform/pipelines', token),
  });
  const connections = useQuery({
    queryKey: ['available-integrations', token],
    queryFn: () => apiFetch<AvailableConnection[]>('/platform/integrations/available', token),
  });
  const runs = useQuery({
    queryKey: ['pipeline-runs', token],
    queryFn: () => apiFetch<PipelineRun[]>('/platform/pipelines/runs/history', token),
    refetchInterval: 1500,
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['pipeline-definitions'] }),
      client.invalidateQueries({ queryKey: ['pipeline-runs'] }),
    ]);
  };

  const createTemplate = useMutation({
    mutationFn: () =>
      apiFetch('/platform/pipelines/templates/migration', token, {
        method: 'POST',
        body: JSON.stringify({
          name,
          sourceConnectionId: sourceConnectionId || undefined,
          destinationConnectionId: destinationConnectionId || undefined,
        }),
      }),
    onSuccess: refresh,
  });
  const activate = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/platform/pipelines/${id}/status`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ACTIVE' }),
      }),
    onSuccess: refresh,
  });
  const start = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/platform/pipelines/${id}/runs`, token, {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), input: {} }),
      }),
    onSuccess: refresh,
  });
  const cancel = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/platform/pipelines/runs/${id}/cancel`, token, { method: 'POST' }),
    onSuccess: refresh,
  });

  const error = [createTemplate.error, activate.error, start.error, cancel.error].find(Boolean);
  const loadError = definitions.error || connections.error || runs.error;
  const loading = definitions.isPending || connections.isPending || runs.isPending;
  const readers = (connections.data || []).filter((connection) => connection.capabilities.includes('read'));
  const writers = (connections.data || []).filter((connection) => connection.capabilities.includes('write'));

  return (
    <main className="page wide">
      <header className="page-header">
        <div>
          <p className="eyebrow">Runtime</p>
          <h1 className="page-title">Pipeline runtime</h1>
          <p className="page-copy">Build and run source-to-destination flows.</p>
        </div>
        <span className="badge success">Elastic-ready</span>
      </header>

      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          createTemplate.mutate();
        }}
        className="card form-inline"
        style={{ padding: '1rem', marginBottom: 24 }}
      >
        <input value={name} onChange={(event) => setName(event.target.value)} required />
        <select value={sourceConnectionId} onChange={(event) => setSourceConnectionId(event.target.value)}>
          <option value="">Manual/file source</option>
          {readers.map((connection) => (
            <option key={connection.id} value={connection.id}>
              {connection.name} — {connection.pluginName}
            </option>
          ))}
        </select>
        <select value={destinationConnectionId} onChange={(event) => setDestinationConnectionId(event.target.value)}>
          <option value="">No default destination</option>
          {writers.map((connection) => (
            <option key={connection.id} value={connection.id}>
              {connection.name} — {connection.pluginName}
            </option>
          ))}
        </select>
        <button className="btn primary" disabled={createTemplate.isPending}>Create pipeline template</button>
      </form>
      {error && <p className="callout danger">{error instanceof Error ? error.message : 'Pipeline request failed'}</p>}
      {loading && <p className="callout">Loading pipeline definitions, connections and runs…</p>}
      {loadError && <p className="callout danger">{loadError.message}</p>}
      {connections.isSuccess && !writers.length && (
        <p className="callout warning">No enabled writer connection is available. Create and test a destination connection under Integrations before running imports.</p>
      )}

      <h2>Definitions</h2>
      {definitions.isSuccess && definitions.data.length === 0 && (
        <p className="callout">No pipeline definitions yet. Create the standard migration template above, then activate it.</p>
      )}
      <div className="grid">
        {(definitions.data || []).map((definition) => (
          <article key={definition.id} className="card">
            <div className="card-body">
            <h3>{definition.name}</h3>
            <p>
              <span className="badge">{definition.operation}</span>{' '}
              <span className={`badge ${definition.status === 'ACTIVE' ? 'success' : 'warning'}`}>{definition.status}</span>{' '}
              <span className="badge">v{definition.version}</span>
            </p>
            <p className="muted">{definition.stages.map((stage) => stage.key).join(' → ')}</p>
            <div className="button-row">
              {definition.status !== 'ACTIVE' && <button className="btn secondary" onClick={() => activate.mutate(definition.id)}>Activate</button>}
              <button className="btn primary" disabled={definition.status !== 'ACTIVE'} onClick={() => start.mutate(definition.id)}>Start run</button>
            </div>
            </div>
          </article>
        ))}
      </div>

      <h2 style={{ marginTop: 32 }}>Runs</h2>
      {runs.isSuccess && runs.data.length === 0 && (
        <p className="callout">No pipeline runs yet. Runs will appear here with stage progress, retries and failures.</p>
      )}
      <div className="grid">
        {(runs.data || []).map((run) => (
          <article key={run.id} className="card">
            <div className="card-body">
            <h3>{run.pipelineDefinition.name}</h3>
            <p><span className="badge">{run.status}</span> {run.completedStages}/{run.totalStages} stages · {run.failedStages} failed</p>
            <ol>
              {run.stageRuns.map((stage) => (
                <li key={stage.id}>{stage.stageKey}: {stage.status} (attempts {stage.attemptCount}) {stage.errorMessage || ''}</li>
              ))}
            </ol>
            {['QUEUED', 'RUNNING'].includes(run.status) && <button className="btn danger" onClick={() => cancel.mutate(run.id)}>Cancel run</button>}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
