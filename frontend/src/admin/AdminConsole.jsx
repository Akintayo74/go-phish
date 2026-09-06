import React, { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import CampaignAnalytics from './CampaignAnalytics.jsx';
import CohortPanel from './CohortPanel.jsx';
import PhaseComparison from './PhaseComparison.jsx';
import SendPanel from './SendPanel.jsx';
import { color, radius, type, layout } from '../ui/theme.js';
import { Wordmark, Card, Button, Pill, StatusDot, Field, Input, QuietNote } from '../ui/primitives.jsx';

// Admin console (Phase 3), rebuilt on the "Civic" design system's console shell
// (screen 2a): a persistent 224px sidebar plus a content column, no shadows,
// depth from the background ramp and 1px borders. Login → two management areas:
// campaigns (create, lifecycle, delivery, analytics) and cohorts & consent (the
// consent gate and the participant roster, Gap 3). Write controls are shown only
// to Program Admins — Researchers get a read-only view, mirroring the backend
// role gating. The gating here is presentation: the authorization itself lives
// on the routes (see consent.authz.guardrail).
//
// Below 920px the console is explicitly descoped by the handoff; the shell keeps
// working (the sidebar wraps above the content) rather than inventing a narrow
// layout the design does not specify.

const PROGRAM_ADMIN = 'program_admin';

// The two top-level areas. Campaigns is the default because it is where the
// day-to-day work happens; cohorts is where the consent that permits any of it
// is managed.
const VIEWS = [
  ['campaigns', 'Campaigns'],
  ['cohorts', 'Cohorts & consent'],
];

// Which lifecycle actions are offered from each status (mirrors the backend
// state machine so the UI never offers an illegal transition). The first action
// of each list is the campaign's natural next step and gets the one ink fill;
// the rest are bordered-secondary, honouring the direction rule per card.
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

// Status → dot tone + human label, used on the campaign card status line.
const STATUS_TONE = {
  draft: 'muted',
  active: 'success',
  paused: 'warning',
  completed: 'accent',
  archived: 'muted',
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
    <div style={{ background: color.surfaceRecessed, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Card
        as="form"
        onSubmit={submit}
        aria-label="admin login"
        raised
        radius={radius.outer}
        padding="30px 28px"
        style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 18 }}
      >
        <Wordmark />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 style={{ ...type.cardTitle, color: color.ink, margin: 0 }}>Admin sign in</h2>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: color.textMuted, margin: 0 }}>
            For programme administrators and researchers.
          </p>
        </div>
        <Field label="Email" htmlFor="admin-email">
          <Input id="admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password" htmlFor="admin-password">
          <Input id="admin-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error && (
          <p role="alert" style={{ color: color.danger, fontSize: 13, margin: 0 }}>{error}</p>
        )}
        <Button type="submit" variant="primary" full disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </Card>
    </div>
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
    <Card
      as="form"
      onSubmit={submit}
      aria-label="create campaign"
      raised
      style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: layout.form }}
    >
      <h3 style={{ ...type.cardTitle, color: color.ink, margin: 0 }}>New campaign</h3>
      <Input
        aria-label="campaign name"
        placeholder="Campaign name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <Input
        aria-label="phase label"
        placeholder="Phase label (optional)"
        value={phaseLabel}
        onChange={(e) => setPhaseLabel(e.target.value)}
      />
      {error && <p role="alert" style={{ color: color.danger, fontSize: 13, margin: 0 }}>{error}</p>}
      <Button type="submit" variant="primary" style={{ alignSelf: 'flex-start' }}>Create</Button>
    </Card>
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
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Clone as new phase
      </Button>
    );
  }

  return (
    <form onSubmit={submit} aria-label="clone campaign" style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
      <Input
        aria-label="clone name"
        placeholder="New campaign name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        aria-label="clone phase label"
        placeholder="Phase label (e.g. Phase II)"
        value={phaseLabel}
        onChange={(e) => setPhaseLabel(e.target.value)}
      />
      {error && <p role="alert" style={{ color: color.danger, fontSize: 13, margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Cloning…' : 'Create clone'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function CampaignCard({
  campaign: c,
  canWrite,
  onTransition,
  onCloned,
  onSent,
  analyticsFor,
  onToggleAnalytics,
  comparisonFor,
  onToggleComparison,
}) {
  const lifecycle = NEXT_ACTIONS[c.status] || [];
  return (
    <Card as="li" raised data-testid="campaign" style={{ display: 'flex', flexDirection: 'column', gap: 14, listStyle: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ ...type.rowTitle, color: color.ink }}>{c.name}</strong>
          {c.phase_label && (
            <Pill tone="neutral">
              <em data-testid="phase-label" style={{ fontStyle: 'normal' }}>{c.phase_label}</em>
            </Pill>
          )}
          {c.cloned_from_campaign_id && <Pill tone="accent">Cloned</Pill>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <StatusDot tone={STATUS_TONE[c.status] || 'muted'} ring={c.status === 'draft'} />
        <span data-testid="status" style={{ fontSize: 13, fontWeight: 500, color: color.textSecondary, textTransform: 'capitalize' }}>
          {c.status}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {canWrite &&
          lifecycle.map(([action, label], i) => (
            <Button
              key={action}
              type="button"
              variant={i === 0 && (action === 'activate') ? 'primary' : 'secondary'}
              onClick={() => onTransition(c.id, action)}
            >
              {label}
            </Button>
          ))}
        {/* Analytics and phase comparison are aggregate-only and open to any
            operator (researchers included), so their toggles are shown
            regardless of write access. Cloning is a write, so it is gated. */}
        <Button type="button" variant="secondary" aria-expanded={analyticsFor === c.id} onClick={() => onToggleAnalytics(c.id)}>
          {analyticsFor === c.id ? 'Hide analytics' : 'Analytics'}
        </Button>
        <Button type="button" variant="secondary" aria-expanded={comparisonFor === c.id} onClick={() => onToggleComparison(c.id)}>
          {comparisonFor === c.id ? 'Hide phases' : 'Compare phases'}
        </Button>
        {canWrite && <CloneCampaign campaign={c} onCloned={onCloned} />}
        {canWrite && <SendPanel campaign={c} onSent={onSent} />}
      </div>

      {analyticsFor === c.id && <CampaignAnalytics campaignId={c.id} />}
      {comparisonFor === c.id && <PhaseComparison campaignId={c.id} />}
    </Card>
  );
}

function CampaignList(props) {
  const { campaigns } = props;
  if (campaigns.length === 0) {
    return (
      <QuietNote style={{ fontSize: 14 }}>No campaigns yet. Create one to get started.</QuietNote>
    );
  }
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {campaigns.map((c) => (
        <CampaignCard key={c.id} campaign={c} {...props} />
      ))}
    </ul>
  );
}

// The persistent 224px sidebar (2a): wordmark, nav with one active item, and an
// account block pinned to the bottom.
function Sidebar({ admin, view, setView, onSignOut, counts }) {
  return (
    <aside
      style={{
        width: 224,
        flex: 'none',
        background: color.surfaceRecessed,
        borderRight: `1px solid ${color.borderSubtle}`,
        padding: '20px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        minHeight: '100vh',
      }}
    >
      <div style={{ padding: '0 8px' }}>
        {/* Leaves the console for the public landing page. The session is not
            ended — the token stays in storage, so #/admin comes straight back. */}
        <a
          href="#/"
          className="cs-focusable"
          aria-label="CAT-Sim home"
          style={{ display: 'inline-flex', textDecoration: 'none', borderRadius: radius.nav }}
        >
          <Wordmark />
        </a>
      </div>

      <nav role="group" aria-label="console section" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {VIEWS.map(([value, label]) => {
          const active = view === value;
          const badge = counts[value];
          return (
            <button
              key={value}
              type="button"
              className="cs-focusable cs-press-lg"
              aria-pressed={active}
              onClick={() => setView(value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '9px 12px',
                borderRadius: radius.nav,
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 14,
                fontWeight: active ? 500 : 400,
                background: active ? color.ink : 'transparent',
                color: active ? color.white : color.textSecondary,
                transition: 'background-color 160ms ease, color 160ms ease, transform 160ms cubic-bezier(0.23,1,0.32,1)',
              }}
            >
              <span>{label}</span>
              {badge != null && (
                <span aria-hidden="true" data-tabular style={{ fontSize: 12, color: active ? color.textOnDarkMuted : color.textMuted }}>{badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div
        style={{
          marginTop: 'auto',
          background: color.surfaceRaised,
          border: `1px solid ${color.borderSubtle}`,
          borderRadius: radius.input,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, color: color.ink, wordBreak: 'break-all' }}>{admin.email}</span>
        <Pill tone="accent" style={{ alignSelf: 'flex-start' }}>
          {admin.role === PROGRAM_ADMIN ? 'Program admin' : 'Researcher'}
        </Pill>
        <button
          type="button"
          className="cs-focusable"
          onClick={onSignOut}
          style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: color.textMuted }}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

export default function AdminConsole() {
  const [admin, setAdmin] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [analyticsFor, setAnalyticsFor] = useState(null);
  const [comparisonFor, setComparisonFor] = useState(null);
  const [view, setView] = useState('campaigns');

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
    setView('campaigns');
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

  if (loading) {
    return (
      <div style={{ background: color.surface, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: color.textMuted }}>
        <p>Loading…</p>
      </div>
    );
  }
  if (!admin) return <LoginForm onLoggedIn={handleLoggedIn} />;

  const canWrite = admin.role === PROGRAM_ADMIN;
  const counts = { campaigns: campaigns.length || null };

  return (
    <section
      aria-label="admin console"
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', background: color.surface, minHeight: '100vh', border: `1px solid ${color.borderFrame}` }}
    >
      <Sidebar admin={admin} view={view} setView={setView} onSignOut={signOut} counts={counts} />

      {/* The console has the opposite desktop problem to the public screens: the
          pane was unbounded, so on a wide display a roster row stretched across
          the whole monitor and became unscannable. It is capped at
          layout.console and centred in whatever space is left beside the
          sidebar; the padding grows with the viewport like every other screen's
          gutter. */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: `${layout.pagePadding} ${layout.gutter}`,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: '100%', maxWidth: layout.console, display: 'flex', flexDirection: 'column', gap: 22 }}>
        {error && <p role="alert" style={{ color: color.danger, fontSize: 14, margin: 0 }}>{error}</p>}

        {view === 'cohorts' ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h2 style={{ ...type.consoleH2, color: color.ink, margin: 0 }}>Cohorts &amp; consent</h2>
              <p style={{ fontSize: 14, color: color.textMuted, margin: 0 }}>
                Consent is granted per cohort and gates every delivery.
              </p>
            </div>
            <CohortPanel canWrite={canWrite} />
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <h2 style={{ ...type.consoleH2, color: color.ink, margin: 0 }}>Campaigns</h2>
                <p style={{ fontSize: 14, color: color.textMuted, margin: 0 }}>
                  Two phases in this study. Delivery is gated on cohort consent.
                </p>
              </div>
            </div>
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
          </>
        )}
        </div>
      </div>
    </section>
  );
}
