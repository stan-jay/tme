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

      <h2>Plugin catalogue</h2>
      <div className="grid three">
        {(catalog.data || []).map((plugin) => (
          <article key={plugin.id} className="card">
            <div className="card-body form-grid">
            <h3 style={{ marginTop: 0 }}>{plugin.name}</h3>
            <p><span className="badge">{plugin.category}</span> {plugin.manifest.capabilities.map((capability) => <span key={capability} className="badge">{capability}</span>)}</p>
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
  const test = useMutation({
    mutationFn: () => apiFetch<{ connected: boolean; message: string }>(`/platform/integrations/connections/${connection.id}/test`, token, { method: 'POST' }),
    onSuccess: onChanged,
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
      <p><span className="badge">{connection.plugin.name}</span> <span className={`badge ${connection.enabled ? 'success' : 'warning'}`}>{connection.status}</span></p>
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
