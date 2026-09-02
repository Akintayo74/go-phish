import React, { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import CampaignAnalytics from './CampaignAnalytics.jsx';
import PhaseComparison from './PhaseComparison.jsx';
import SendPanel from './SendPanel.jsx';

// Minimal admin console shell (Phase 3). Login → campaign list with create,
// lifecycle, delivery and analytics controls. Write controls (create, clone,
// lifecycle, send) are shown only to Program Admins — Researchers get a
// read-only view, mirroring the backend role gating.

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

// Clone-as-new-phase control (Phase 10). Program Admin only. Reveals a small
// form pre-filled with the source name; the admin sets a phase label for the
// re-test (e.g. "Phase II") and creates a fresh draft campaign linked back to
// this one. Sending happens later through the normal delivery flow.
function CloneCampaign({ campaign, onCloned }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(campaign.name);
  const [phaseLabel, setPhaseLabel] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.cloneCampaign(campaign.id, {
        name: name.trim() || undefined,
        phase_label: phaseLabel.trim() || undefined,
      });
      setOpen(false);
      setPhaseLabel('');
      onCloned();
    } catch (err) {
      setError(err.code || 'clone_failed');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Clone as new phase
      </button>
    );
  }

  return (
    <form onSubmit={submit} aria-label="clone campaign">
      <input
        aria-label="clone name"
        placeholder="New campaign name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        aria-label="clone phase label"
        placeholder="Phase label (e.g. Phase II)"
        value={phaseLabel}
        onChange={(e) => setPhaseLabel(e.target.value)}
      />
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? 'Cloning…' : 'Create clone'}
      </button>
      <button type="button" onClick={() => setOpen(false)} disabled={busy}>
        Cancel
      </button>
    </form>
  );
}

function CampaignList({
  campaigns,
  canWrite,
  onTransition,
  onCloned,
  onSent,
  analyticsFor,
  onToggleAnalytics,
  comparisonFor,
  onToggleComparison,
}) {
  if (campaigns.length === 0) return <p>No campaigns yet.</p>;
  return (
    <ul>
      {campaigns.map((c) => (
        <li key={c.id} data-testid="campaign">
          <strong>{c.name}</strong>{' '}
          {c.phase_label && <em data-testid="phase-label">{c.phase_label}</em>}{' '}
          <span data-testid="status">[{c.status}]</span>
          {canWrite &&
            (NEXT_ACTIONS[c.status] || []).map(([action, label]) => (
              <button key={action} onClick={() => onTransition(c.id, action)}>
                {label}
              </button>
            ))}
          {/* Analytics and phase comparison are aggregate-only and open to any
              operator (researchers included), so their toggles are shown
              regardless of write access. Cloning is a write, so it is gated. */}
          <button
            aria-expanded={analyticsFor === c.id}
            onClick={() => onToggleAnalytics(c.id)}
          >
            {analyticsFor === c.id ? 'Hide analytics' : 'Analytics'}
          </button>
          <button
            aria-expanded={comparisonFor === c.id}
            onClick={() => onToggleComparison(c.id)}
          >
            {comparisonFor === c.id ? 'Hide phases' : 'Compare phases'}
          </button>
          {canWrite && <CloneCampaign campaign={c} onCloned={onCloned} />}
          {canWrite && <SendPanel campaign={c} onSent={onSent} />}
          {analyticsFor === c.id && <CampaignAnalytics campaignId={c.id} />}
          {comparisonFor === c.id && <PhaseComparison campaignId={c.id} />}
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
  const [comparisonFor, setComparisonFor] = useState(null);

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
    setComparisonFor(null);
  }

  function toggleAnalytics(id) {
    setAnalyticsFor((current) => (current === id ? null : id));
  }

  function toggleComparison(id) {
    setComparisonFor((current) => (current === id ? null : id));
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
        onCloned={refresh}
        onSent={refresh}
        analyticsFor={analyticsFor}
        onToggleAnalytics={toggleAnalytics}
        comparisonFor={comparisonFor}
        onToggleComparison={toggleComparison}
      />
    </section>
  );
}
