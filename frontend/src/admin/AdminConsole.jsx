import React, { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import CampaignAnalytics from './CampaignAnalytics.jsx';

// Minimal admin console shell (Phase 3). Login → campaign list with create and
// lifecycle controls. Delivery is Phase 5; nothing here sends anything. Write
// controls are shown only to Program Admins — Researchers get read-only view,
// mirroring the backend role gating.

const PROGRAM_ADMIN = 'program_admin';

// Which lifecycle actions are offered from each status (mirrors the backend
// state machine so the UI never offers an illegal transition).
const NEXT_ACTIONS = {
  draft: [['activate', 'Activate']],
  active: [
    ['pause', 'Pause'],
    ['complete', 'Complete'],
  ],
  paused: [
    ['activate', 'Resume'],
    ['complete', 'Complete'],
  ],
  completed: [['archive', 'Archive']],
  archived: [],
};

function LoginForm({ onLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { token, admin } = await api.login(email, password);
      setToken(token);
      onLoggedIn(admin);
    } catch (err) {
      setError(err.code === 'invalid_credentials' ? 'Invalid email or password.' : 'Login failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="admin login">
      <h2>Admin sign in</h2>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

function CreateCampaign({ onCreated }) {
  const [name, setName] = useState('');
  const [phaseLabel, setPhaseLabel] = useState('');
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.createCampaign({
        name,
        phase_label: phaseLabel || undefined,
      });
      setName('');
      setPhaseLabel('');
      onCreated();
    } catch (err) {
      setError(err.code || 'create_failed');
    }
  }

  return (
    <form onSubmit={submit} aria-label="create campaign">
      <h3>New campaign</h3>
      <input
        aria-label="campaign name"
        placeholder="Campaign name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        aria-label="phase label"
        placeholder="Phase label (optional)"
        value={phaseLabel}
        onChange={(e) => setPhaseLabel(e.target.value)}
      />
      {error && <p role="alert">{error}</p>}
      <button type="submit">Create</button>
    </form>
  );
}

function CampaignList({ campaigns, canWrite, onTransition, analyticsFor, onToggleAnalytics }) {
  if (campaigns.length === 0) return <p>No campaigns yet.</p>;
  return (
    <ul>
      {campaigns.map((c) => (
        <li key={c.id} data-testid="campaign">
          <strong>{c.name}</strong>{' '}
          <span data-testid="status">[{c.status}]</span>
          {canWrite &&
            (NEXT_ACTIONS[c.status] || []).map(([action, label]) => (
              <button key={action} onClick={() => onTransition(c.id, action)}>
                {label}
              </button>
            ))}
          {/* Analytics is aggregate-only and open to any operator (researchers
              included), so the toggle is shown regardless of write access. */}
          <button
            aria-expanded={analyticsFor === c.id}
            onClick={() => onToggleAnalytics(c.id)}
          >
            {analyticsFor === c.id ? 'Hide analytics' : 'Analytics'}
          </button>
          {analyticsFor === c.id && <CampaignAnalytics campaignId={c.id} />}
        </li>
      ))}
    </ul>
  );
}

export default function AdminConsole() {
  const [admin, setAdmin] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [analyticsFor, setAnalyticsFor] = useState(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.listCampaigns();
      setCampaigns(data || []);
    } catch (err) {
      setError('Could not load campaigns.');
      throw err;
    }
  }, []);

  // If a token is already stored, restore the session.
  useEffect(() => {
    if (!getToken()) return;
    let active = true;
    (async () => {
      try {
        const { admin: me } = await api.me();
        if (!active) return;
        setAdmin(me);
        await refresh();
      } catch (_e) {
        if (active) setToken(null); // stale/expired token
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  async function handleLoggedIn(me) {
    setAdmin(me);
    setLoading(false);
    try {
      await refresh();
    } catch (_e) {
      /* surfaced via error state */
    }
  }

  function signOut() {
    setToken(null);
    setAdmin(null);
    setCampaigns([]);
    setAnalyticsFor(null);
  }

  function toggleAnalytics(id) {
    setAnalyticsFor((current) => (current === id ? null : id));
  }

  async function handleTransition(id, action) {
    try {
      await api.campaignTransition(id, action);
      await refresh();
    } catch (_e) {
      setError('Action failed.');
    }
  }

  if (loading) return <p>Loading…</p>;
  if (!admin) return <LoginForm onLoggedIn={handleLoggedIn} />;

  const canWrite = admin.role === PROGRAM_ADMIN;

  return (
    <section aria-label="admin console">
      <header>
        <h2>Campaigns</h2>
        <p>
          Signed in as <strong>{admin.email}</strong> ({admin.role}){' '}
          <button onClick={signOut}>Sign out</button>
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      {canWrite && <CreateCampaign onCreated={refresh} />}
      <CampaignList
        campaigns={campaigns}
        canWrite={canWrite}
        onTransition={handleTransition}
        analyticsFor={analyticsFor}
        onToggleAnalytics={toggleAnalytics}
      />
    </section>
  );
}
