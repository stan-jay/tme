import { FormEvent, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { API_URL } from './api';
import { MigrationHistoryScreen } from './screens/MigrationHistoryScreen';
import { UploadScreen } from './screens/UploadScreen';
import { IntegrationsScreen } from './screens/IntegrationsScreen';
import { PipelinesScreen } from './screens/PipelinesScreen';
import { WorklistScreen } from './screens/WorklistScreen';

const queryClient = new QueryClient();

type UserRole = 'ADMIN' | 'REVIEWER' | 'EXECUTOR' | 'UPLOADER';
type Screen = 'upload' | 'worklist' | 'history' | 'integrations' | 'pipelines';

interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
}

interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: SessionUser;
}

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('tme_token') || '');
  const [user, setUser] = useState<SessionUser | null>(() => readStoredUser(token));
  const [currentScreen, setCurrentScreen] = useState<Screen>('upload');

  if (!token) {
    return (
      <LoginScreen
        onLogin={(session) => {
          sessionStorage.setItem('tme_token', session.accessToken);
          sessionStorage.setItem('tme_user', JSON.stringify(session.user));
          setToken(session.accessToken);
          setUser(session.user);
        }}
      />
    );
  }

  const effectiveUser = user ?? readStoredUser(token);
  const navItems = navigationFor(effectiveUser?.role ?? 'UPLOADER');
  const safeScreen = navItems.some((item) => item.screen === currentScreen)
    ? currentScreen
    : navItems[0].screen;

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">SJ</div>
            <div>
              <h2 className="brand-title">TME</h2>
              <p className="brand-subtitle">Business Language Platform</p>
            </div>
          </div>
          <div className="nav-group">
            {navItems.map((item) => (
              <button
                key={item.screen}
                className={`nav-button ${safeScreen === item.screen ? 'active' : ''}`}
                onClick={() => setCurrentScreen(item.screen)}
              >
                <span className="nav-icon">{iconFor(item.screen)}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <div className="sidebar-footer">
            {effectiveUser && (
              <div className="user-card">
                <div className="avatar">{initials(effectiveUser.name || effectiveUser.email)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {effectiveUser.name || effectiveUser.email}
                  </div>
                  <div className="muted" style={{ fontSize: '0.78rem' }}>{effectiveUser.role}</div>
                </div>
              </div>
            )}
            <button
              className="btn ghost"
              onClick={() => {
                sessionStorage.removeItem('tme_token');
                sessionStorage.removeItem('tme_user');
                queryClient.clear();
                setToken('');
                setUser(null);
                setCurrentScreen('upload');
              }}
            >
              Sign out
            </button>
          </div>
        </aside>
        <main className="main-area">
          <div className="topbar">
            <div>
              <div className="breadcrumb">Stan Jay · {navItems.find((item) => item.screen === safeScreen)?.label}</div>
            </div>
            <div className="button-row">
              <span className="badge">API {API_URL}</span>
              <span className="badge success">Secure session</span>
            </div>
          </div>
          <div className="content-frame">
            {safeScreen === 'upload' && <UploadScreen token={token} role={effectiveUser?.role ?? 'UPLOADER'} />}
            {safeScreen === 'worklist' && <WorklistScreen token={token} role={effectiveUser?.role ?? 'UPLOADER'} />}
            {safeScreen === 'history' && <MigrationHistoryScreen token={token} />}
            {safeScreen === 'integrations' && <IntegrationsScreen token={token} />}
            {safeScreen === 'pipelines' && <PipelinesScreen token={token} />}
          </div>
        </main>
      </div>
    </QueryClientProvider>
  );
}

function LoginScreen({ onLogin }: { onLogin: (session: LoginResponse) => void }) {
  const [email, setEmail] = useState('admin@example.com');
  const [organizationSlug, setOrganizationSlug] = useState('stan-jay');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationSlug, email, password }),
      });
      const body = (await response.json()) as LoginResponse | { message?: string };
      const message = 'message' in body && typeof body.message === 'string' ? body.message : 'Login failed';
      if (!response.ok) throw new Error(message);
      if (!('accessToken' in body) || !body.user) throw new Error('Login response did not include a user session');
      onLogin(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-hero">
          <div className="brand-mark" style={{ background: 'rgba(255,255,255,0.18)', marginBottom: '1.5rem' }}>SJ</div>
          <p className="eyebrow" style={{ color: '#fcd34d' }}>Stan Jay Platform</p>
          <h1 className="page-title">Move business data with confidence.</h1>
          <p style={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.75 }}>
            TME translates files, APIs and scanned documents into SJBL, validates the business meaning, and routes work through proper review and execution gates.
          </p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <div>
            <p className="eyebrow">Welcome back</p>
            <h1 style={{ margin: 0, letterSpacing: '-0.04em' }}>Sign in to TME</h1>
            <p className="muted">Use your organization workspace and role-based access.</p>
          </div>
        <label>
          Organization
          <input value={organizationSlug} onChange={(event) => setOrganizationSlug(event.target.value)} required />
        </label>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label>
          Password
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
        </label>
        <button className="btn primary" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        {error && <p className="callout danger">{error}</p>}
      </form>
      </section>
    </main>
  );
}

function navigationFor(role: UserRole): Array<{ screen: Screen; label: string }> {
  const base: Array<{ screen: Screen; label: string }> = [];
  if (role === 'ADMIN' || role === 'UPLOADER') {
    base.push({ screen: 'upload', label: 'Upload New' });
  }
  if (role === 'ADMIN' || role === 'REVIEWER' || role === 'EXECUTOR') {
    base.push({ screen: 'worklist', label: 'Worklist' });
  }
  base.push({ screen: 'history', label: 'History' });
  if (role === 'ADMIN') {
    return [
      ...base,
      { screen: 'integrations', label: 'Integrations' },
      { screen: 'pipelines', label: 'Pipelines' },
    ];
  }
  return base;
}

function readStoredUser(token: string): SessionUser | null {
  const stored = sessionStorage.getItem('tme_user');
  if (stored) {
    try {
      return JSON.parse(stored) as SessionUser;
    } catch {
      sessionStorage.removeItem('tme_user');
    }
  }
  return decodeUserFromToken(token);
}

function decodeUserFromToken(token: string): SessionUser | null {
  const [, payload] = token.split('.');
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const parsed = JSON.parse(atob(normalized)) as Partial<SessionUser>;
    if (!parsed.id || !parsed.email || !parsed.organizationId || !parsed.role) return null;
    return {
      id: parsed.id,
      email: parsed.email,
      name: parsed.name || parsed.email,
      organizationId: parsed.organizationId,
      role: parsed.role as UserRole,
    };
  } catch {
    return null;
  }
}

export default App;

function iconFor(screen: Screen): string {
  switch (screen) {
    case 'upload':
      return '↑';
    case 'worklist':
      return '✓';
    case 'history':
      return '↺';
    case 'integrations':
      return '◆';
    case 'pipelines':
      return '⇄';
  }
}

function initials(value: string): string {
  return value
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';
}
