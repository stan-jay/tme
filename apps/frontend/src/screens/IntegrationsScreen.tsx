import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api';

interface ConfigurationField {
  key: string;
  label: string;
  type: 'text' | 'secret' | 'url' | 'number' | 'boolean' | 'select';
  required: boolean;
  secret?: boolean;
  options?: Array<{ label: string; value: string }>;
  description?: string;
}

interface PluginCatalog {
  id: string;
  name: string;
  version: string;
  category: string;
  manifest: {
    capabilities: string[];
    configurationSchema: ConfigurationField[];
  };
  technicalStatus: string;
  commercialStatus: string;
  globalEnabled: boolean;
  newConnectionsAllowed: boolean;
  existingConnectionsAllowed: boolean;
}

interface DiscoveryResource {
  id: string;
  name: string;
  entityTypes: string[];
  estimatedCount?: number;
}

interface DiscoveryResult {
  resources: DiscoveryResource[];
}

interface PullResult {
  records: Array<Record<string, unknown>>;
  nextCursor?: string;
  checkpoint?: string;
  complete: boolean;
}

export interface IntegrationConnection {
  id: string;
  pluginId: string;
  name: string;
  status: string;
  enabled: boolean;
  publicConfiguration: Record<string, unknown>;
  configuredSecretFields: string[];
  lastTestSucceeded?: boolean;
  lastTestMessage?: string;
  plugin: {
    id: string;
    name: string;
    category: string;
    manifest: {
      capabilities: string[];
      configurationSchema: ConfigurationField[];
    };
  };
}

export function IntegrationsScreen({ token }: { token: string }) {
  const client = useQueryClient();
  const [selectedPluginId, setSelectedPluginId] = useState('');
  const catalog = useQuery({
    queryKey: ['integration-catalog', token],
    queryFn: () => apiFetch<PluginCatalog[]>('/platform/integrations/catalog', token),
  });
  const connections = useQuery({
    queryKey: ['integration-connections', token],
    queryFn: () =>
      apiFetch<IntegrationConnection[]>('/platform/integrations/connections', token),
  });

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['integration-catalog'] }),
      client.invalidateQueries({ queryKey: ['integration-connections'] }),
    ]);
  };

  const updateCatalog = useMutation({
    mutationFn: ({
      id,
      changes,
    }: {
      id: string;
      changes: Record<string, unknown>;
    }) =>
      apiFetch(`/platform/integrations/catalog/${id}`, token, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      }),
    onSuccess: refresh,
  });

  const selectedPlugin = catalog.data?.find((plugin) => plugin.id === selectedPluginId);
  const loading = catalog.isPending || connections.isPending;
  const loadError = catalog.error || connections.error;
  const enabledPlugins = (catalog.data || []).filter((plugin) => plugin.globalEnabled).length;
  const sourcePlugins = (catalog.data || []).filter((plugin) => plugin.manifest.capabilities.includes('read')).length;
  const writerConnections = (connections.data || []).filter((connection) =>
    connection.plugin.manifest.capabilities.includes('write'),
  ).length;
  const categories = Array.from(new Set((catalog.data || []).map((plugin) => plugin.category))).sort();

  return (
    <main className="page wide">
      <header className="page-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="page-title">Integrations</h1>
          <p className="page-copy">Approve plugins and manage encrypted connections.</p>
        </div>
        <span className="badge success">Secrets encrypted</span>
      </header>

      <div className="grid four" style={{ marginBottom: 16 }}>
        <div className="metric-card"><div className="metric-label">Plugins</div><p className="metric-value">{catalog.data?.length || 0}</p></div>
        <div className="metric-card"><div className="metric-label">Enabled</div><p className="metric-value">{enabledPlugins}</p></div>
        <div className="metric-card"><div className="metric-label">Reader plugins</div><p className="metric-value">{sourcePlugins}</p></div>
        <div className="metric-card"><div className="metric-label">Writers</div><p className="metric-value">{writerConnections}</p></div>
      </div>

      <section className="card" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <p className="eyebrow">Connector SDK</p>
          <h2 style={{ marginTop: 0 }}>Capability-based integrations</h2>
          <p className="page-copy">
            Connectors are grouped by business system category. Reader connectors pull source records,
            writer connectors push clean SJBL records to destinations, and bidirectional connectors can do both.
            Credentials stay encrypted while the UI exposes only approved sources and destinations to pipelines.
          </p>
          <div className="button-row" style={{ marginTop: 12 }}>
            {categories.map((category) => (
              <span className="badge" key={category}>{category}</span>
            ))}
          </div>
        </div>
      </section>

      <h2>Plugin catalogue</h2>
      {loading && <p className="callout">Loading plugins and organization connections…</p>}
      {loadError && <p className="callout danger">{loadError.message}</p>}
      {catalog.isSuccess && catalog.data.length === 0 && (
        <p className="callout warning">No plugins are registered yet. Add connector manifests in the backend plugin registry before creating connections.</p>
      )}
      <div className="grid three">
        {(catalog.data || []).map((plugin) => (
          <article key={plugin.id} className="card">
            <div className="card-body form-grid">
            <h3 style={{ marginTop: 0 }}>{plugin.name}</h3>
            <p>
              <span className="badge">{plugin.category}</span>{' '}
              {plugin.manifest.capabilities.map((capability) => <span key={capability} className="badge">{capability}</span>)}
            </p>
            <p className="muted" style={{ marginTop: 0 }}>
              Handles {plugin.manifest.configurationSchema.length} setup field(s). Supports {(plugin.manifest as { supportedEntityTypes?: string[] }).supportedEntityTypes?.join(', ') || 'configured records'}.
            </p>
            <label>
              Technical status
              <select
                value={plugin.technicalStatus}
                onChange={(event) =>
                  updateCatalog.mutate({ id: plugin.id, changes: { technicalStatus: event.target.value } })
                }
              >
                {['RESEARCHING', 'SANDBOX_AVAILABLE', 'IN_DEVELOPMENT', 'TECHNICALLY_VERIFIED', 'SUSPENDED', 'DEPRECATED'].map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>
              Commercial status
              <select
                value={plugin.commercialStatus}
                onChange={(event) =>
                  updateCatalog.mutate({ id: plugin.id, changes: { commercialStatus: event.target.value } })
                }
              >
                {['NOT_STARTED', 'IN_DISCUSSION', 'APPROVED', 'REJECTED', 'EXPIRED'].map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <Toggle label="Globally enabled" checked={plugin.globalEnabled} onChange={(value) => updateCatalog.mutate({ id: plugin.id, changes: { globalEnabled: value } })} />
            <Toggle label="Allow new connections" checked={plugin.newConnectionsAllowed} onChange={(value) => updateCatalog.mutate({ id: plugin.id, changes: { newConnectionsAllowed: value } })} />
            <Toggle label="Allow existing connections" checked={plugin.existingConnectionsAllowed} onChange={(value) => updateCatalog.mutate({ id: plugin.id, changes: { existingConnectionsAllowed: value } })} />
            </div>
          </article>
        ))}
      </div>

      <h2 style={{ marginTop: 32 }}>Organization connections</h2>
      {connections.isSuccess && connections.data.length === 0 && (
        <p className="callout">No organization connections yet. Approve a plugin, create a connection, test it, then enable it for pipeline and import destinations.</p>
      )}
      <label>
        Add connection
        <select value={selectedPluginId} onChange={(event) => setSelectedPluginId(event.target.value)}>
          <option value="">Select an approved plugin</option>
          {(catalog.data || [])
            .filter((plugin) => plugin.globalEnabled && plugin.newConnectionsAllowed)
            .map((plugin) => <option key={plugin.id} value={plugin.id}>{plugin.name}</option>)}
        </select>
      </label>

      {selectedPlugin && (
        <ConnectionForm
          plugin={selectedPlugin}
          token={token}
          onSaved={async () => {
            setSelectedPluginId('');
            await refresh();
          }}
        />
      )}

      <div className="grid" style={{ marginTop: 24 }}>
        {(connections.data || []).map((connection) => (
          <ConnectionCard key={connection.id} connection={connection} token={token} onChanged={refresh} />
        ))}
      </div>
    </main>
  );
}

function ConnectionForm({
  plugin,
  token,
  onSaved,
}: {
  plugin: PluginCatalog;
  token: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState(`${plugin.name} connection`);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const create = useMutation({
    mutationFn: () => {
      const publicConfiguration: Record<string, unknown> = {};
      const secrets: Record<string, unknown> = {};
      for (const field of plugin.manifest.configurationSchema) {
        (field.secret || field.type === 'secret' ? secrets : publicConfiguration)[field.key] = values[field.key];
      }
      return apiFetch('/platform/integrations/connections', token, {
        method: 'POST',
        body: JSON.stringify({ name, pluginId: plugin.id, publicConfiguration, secrets }),
      });
    },
    onSuccess: onSaved,
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
      className="card form-grid"
      style={{ marginTop: 16, padding: 20 }}
    >
      <h3>Configure {plugin.name}</h3>
      <label>Connection name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
      {plugin.manifest.configurationSchema.map((field) => (
        <DynamicField key={field.key} field={field} value={values[field.key]} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} />
      ))}
      <button className="btn primary" disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Save encrypted connection'}</button>
      {create.error && <p className="callout danger">{create.error.message}</p>}
    </form>
  );
}

function ConnectionCard({
  connection,
  token,
  onChanged,
}: {
  connection: IntegrationConnection;
  token: string;
  onChanged: () => void;
}) {
  const [resourceId, setResourceId] = useState('');
  const [entityType, setEntityType] = useState('');
  const [pullResult, setPullResult] = useState<PullResult | null>(null);
  const isReader = connection.plugin.manifest.capabilities.includes('read');
  const test = useMutation({
    mutationFn: () => apiFetch<{ connected: boolean; message: string }>(`/platform/integrations/connections/${connection.id}/test`, token, { method: 'POST' }),
    onSuccess: onChanged,
  });
  const discover = useQuery({
    queryKey: ['integration-discovery', connection.id, token],
    queryFn: () => apiFetch<DiscoveryResult>(`/platform/integrations/connections/${connection.id}/discover`, token),
    enabled: isReader && connection.enabled && connection.status === 'CONNECTED',
  });
  const pull = useMutation({
    mutationFn: () => apiFetch<PullResult>(`/platform/integrations/connections/${connection.id}/pull`, token, {
      method: 'POST',
      body: JSON.stringify({
        resourceId: resourceId || undefined,
        entityTypes: entityType ? [entityType] : undefined,
        pageSize: 10,
      }),
    }),
    onSuccess: setPullResult,
  });
  const update = useMutation({
    mutationFn: (enabled: boolean) => apiFetch(`/platform/integrations/connections/${connection.id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),
    onSuccess: onChanged,
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`/platform/integrations/connections/${connection.id}`, token, {
      method: 'DELETE',
    }),
    onSuccess: onChanged,
  });

  return (
    <article className="card">
      <div className="card-body">
      <h3>{connection.name}</h3>
      <p>
        <span className="badge">{connection.plugin.name}</span>{' '}
        <span className="badge">{connection.plugin.category}</span>{' '}
        {connection.plugin.manifest.capabilities.map((capability) => <span key={capability} className="badge">{capability}</span>)}{' '}
        <span className={`badge ${connection.enabled ? 'success' : 'warning'}`}>{connection.status}</span>
      </p>
      <p>Secrets configured: {connection.configuredSecretFields.join(', ') || 'none'}</p>
      {connection.lastTestMessage && <p>Last test: {connection.lastTestMessage}</p>}
      <div className="button-row">
        <button className="btn secondary" onClick={() => test.mutate()} disabled={test.isPending}>Test connection</button>
        <button
          className="btn primary"
          onClick={() => update.mutate(!connection.enabled)}
          disabled={update.isPending || (!connection.enabled && !connection.lastTestSucceeded)}
        >
          {connection.enabled ? 'Disable' : 'Enable'}
        </button>
        <button className="btn danger" onClick={() => remove.mutate()} disabled={connection.enabled || remove.isPending}>
          Delete
        </button>
      </div>
      {(test.error || update.error || remove.error) && <p className="callout danger">{(test.error || update.error || remove.error)?.message}</p>}
      {isReader && connection.enabled && connection.status === 'CONNECTED' && (
        <div className="pull-panel">
          <div>
            <p className="eyebrow">Pull records</p>
            <h4>Preview source data before building a migration</h4>
          </div>
          <div className="form-inline compact">
            <select value={resourceId} onChange={(event) => setResourceId(event.target.value)}>
              <option value="">All resources</option>
              {(discover.data?.resources || []).map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name} {resource.estimatedCount ? `(${resource.estimatedCount})` : ''}
                </option>
              ))}
            </select>
            <select value={entityType} onChange={(event) => setEntityType(event.target.value)}>
              <option value="">All entity types</option>
              {Array.from(new Set((discover.data?.resources || []).flatMap((resource) => resource.entityTypes))).map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <button className="btn secondary" onClick={() => pull.mutate()} disabled={pull.isPending || discover.isPending}>
              {pull.isPending ? 'Pulling...' : 'Pull preview'}
            </button>
          </div>
          {discover.error && <p className="callout danger">{discover.error.message}</p>}
          {pull.error && <p className="callout danger">{pull.error.message}</p>}
          {pullResult && (
            <div className="table-card">
              <table>
                <thead>
                  <tr><th>Type</th><th>ID</th><th>Source</th><th>Preview</th></tr>
                </thead>
                <tbody>
                  {pullResult.records.map((record, index) => (
                    <tr key={`${String(record.id || index)}-${index}`}>
                      <td>{String(record.type || 'record')}</td>
                      <td>{String(record.id || '-')}</td>
                      <td>{String(record.externalSource || '-')}</td>
                      <td>{JSON.stringify(record).slice(0, 180)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      </div>
    </article>
  );
}

function DynamicField({
  field,
  value,
  onChange,
}: {
  field: ConfigurationField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.type === 'boolean') {
    return <Toggle label={field.label} checked={Boolean(value)} onChange={onChange} />;
  }
  if (field.type === 'select') {
    return (
      <label>{field.label}
        <select value={String(value || '')} onChange={(event) => onChange(event.target.value)} required={field.required}>
          <option value="">Select</option>
          {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    );
  }
  return (
    <label>{field.label}
      <input
        type={field.secret || field.type === 'secret' ? 'password' : field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'}
        value={String(value || '')}
        onChange={(event) => onChange(field.type === 'number' ? Number(event.target.value) : event.target.value)}
        required={field.required}
      />
      {field.description && <small>{field.description}</small>}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 750 }}><input style={{ width: 'auto' }} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> {label}</label>;
}
