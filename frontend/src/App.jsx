import React, { useEffect, useState } from 'react';
import AdminConsole from './admin/AdminConsole.jsx';
import LearningSite from './learn/LearningSite.jsx';
import EnrollView from './enroll/EnrollView.jsx';
import { color, radius, type } from './ui/theme.js';
import { Wordmark, Card, Note, Field, Input, Select, Button, QuietLink, Eyebrow } from './ui/primitives.jsx';

// App shell. A tiny hash-based switch (no router dependency yet) selects between
// the public landing view, the Phase 3 admin console at #/admin, and the public
// CAT learning site at #/learn (Phase 6). The design system (the "Civic"
// direction) is applied across every one of these surfaces.
function useHashRoute() {
  const [hash, setHash] = useState(() =>
    typeof window !== 'undefined' ? window.location.hash : ''
  );
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

// Screen `2h` — the enrolment & training landing. The first screen a
// participant sees: enrol with a work email, or leave to read the lessons
// without enrolling. It also carries the load-bearing disclosure that
// simulations happen and are not scored against the individual. Five blocks
// enter on a 40ms omRise stagger.
function Landing() {
  const [health, setHealth] = useState('checking…');

  useEffect(() => {
    let active = true;
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => active && setHealth(data.status || 'unknown'))
      .catch(() => active && setHealth('unreachable'));
    return () => {
      active = false;
    };
  }, []);

  // 40ms increments between blocks (handoff: enrolment page stagger).
  const rise = (i) => ({ ['--cs-rise-delay']: `${i * 40}ms` });

  return (
    <div
      style={{
        background: color.surfaceRecessed,
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        padding: '26px 20px 30px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* 1 — header row */}
        <header className="cs-rise" style={rise(0)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Wordmark as="h1" />
            {/* The quiet door: the console is reachable but visually subordinate. */}
            <QuietLink href="#/admin">Administrator sign-in</QuietLink>
          </div>
        </header>

        {/* 2 — hero */}
        <section className="cs-rise" style={{ ...rise(1), display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ ...type.display, color: color.ink, maxWidth: '22ch', margin: 0 }}>
            Phishing awareness training for public service staff.
          </h2>
          <p style={{ ...type.lead, color: color.textSecondary, maxWidth: '56ch', margin: 0 }}>
            Enrol once with your work email. You will get five short lessons, and at some point in
            the next few months a simulated phishing message you are not told about in advance.
          </p>
        </section>

        {/* 3 — enrolment card */}
        <Card
          as="section"
          className="cs-rise"
          radius={radius.outer}
          padding="24px 22px"
          style={{ ...rise(2), display: 'flex', flexDirection: 'column', gap: 18 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h3 style={{ ...type.cardTitle, color: color.ink, margin: 0 }}>Enrol in training</h3>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: color.textMuted, margin: 0 }}>
              Takes about a minute. Your organisation must already run CAT-Sim.
            </p>
          </div>
          <EnrolForm />
          <Note>
            <strong style={{ fontWeight: 600 }}>Simulations are never scored against you.</strong>{' '}
            Results are reported by cohort, not by person. Your manager does not see whether you
            clicked, and nothing you type into a simulated form is ever stored.
          </Note>
          <p style={{ textAlign: 'center', fontSize: 13, lineHeight: 1.5, color: color.textMuted, margin: 0 }}>
            By enrolling you accept the{' '}
            <a href="#/learn">participation notice</a>.
          </p>
        </Card>

        {/* 4 — what happens after you enrol */}
        <section className="cs-rise" style={{ ...rise(3), display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Eyebrow>What happens after you enrol</Eyebrow>
          <div
            style={{
              background: color.borderSubtle,
              borderRadius: radius.card,
              padding: 6,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 2,
            }}
          >
            {[
              ['01', 'The lessons open immediately — take them in any order.'],
              ['02', 'A simulated message arrives later, unannounced.'],
              ['03', 'Either way you land on a page explaining what it was.'],
            ].map(([num, text]) => (
              <div key={num} style={{ background: color.surface, borderRadius: radius.nested, padding: '15px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span data-tabular style={{ fontSize: 13, fontWeight: 500, color: color.accent }}>{num}</span>
                <span style={{ fontSize: 14, lineHeight: 1.5, color: color.textBody }}>{text}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 5 — footer */}
        <footer
          className="cs-rise"
          style={{
            ...rise(4),
            borderTop: `1px solid ${color.borderSubtle}`,
            paddingTop: 18,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <p style={{ fontSize: 14, lineHeight: 1.5, color: color.textMuted, margin: 0 }}>
            Not enrolling? The lessons are free and open to anyone.
          </p>
          <a href="#/learn" style={{ textDecoration: 'none' }}>
            <Button variant="secondary">
              Browse the lessons <span style={{ color: color.textMuted }} aria-hidden="true">→</span>
            </Button>
          </a>
        </footer>

        {/* Backend status kept as a quiet operational footer (health check). */}
        <p style={{ fontSize: 12, color: color.textMuted, margin: 0, textAlign: 'center' }}>
          Service status: <strong data-testid="health" style={{ fontWeight: 500, color: color.textSecondary }}>{health}</strong>
        </p>
      </div>
    </div>
  );
}

// The enrolment form (2h). Client-side validation on blur/submit per the
// handoff. There is no public self-enrolment endpoint in the backend — the
// programme enrols participants operator-side and via the simulation flow — so
// on a valid submit this surfaces the honest next step (the lessons open now;
// the simulation arrives later) rather than posting to a route that does not
// exist.
const DEPARTMENTS = [
  'Retail Operations',
  'Finance & Treasury',
  'Human Resources',
  'Information Technology',
];

function EnrolForm() {
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [cohortCode, setCohortCode] = useState('');
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  function validate() {
    const next = {};
    const value = email.trim();
    if (!value) next.email = 'Enter your work email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) next.email = 'That does not look like a valid email address.';
    if (!department) next.department = 'Choose your department.';
    return next;
  }

  function submit(e) {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length === 0) setSubmitted(true);
  }

  if (submitted) {
    return (
      <div role="status" data-testid="enrol-submitted" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Note>
          <strong style={{ fontWeight: 600 }}>You are enrolled.</strong> The lessons are open now —
          start whenever you like. A simulated message will arrive later, unannounced, and either
          way you will land on a page explaining what it was.
        </Note>
        <a href="#/learn" style={{ textDecoration: 'none' }}>
          <Button variant="primary" full>Start the lessons</Button>
        </a>
      </div>
    );
  }

  const errStyle = { color: color.danger, fontSize: 13, margin: 0 };

  return (
    <form onSubmit={submit} aria-label="enrol in training" noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Work email address" htmlFor="enrol-email">
        <Input
          id="enrol-email"
          type="email"
          value={email}
          placeholder="ada.okonkwo@ministry.gov.ng"
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setErrors((p) => ({ ...p, ...validate() }))}
          aria-invalid={errors.email ? 'true' : undefined}
        />
        {errors.email && <p role="alert" style={errStyle}>{errors.email}</p>}
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(0, 1fr))', gap: 12 }}>
        <Field label="Department" htmlFor="enrol-dept">
          <Select
            id="enrol-dept"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            aria-invalid={errors.department ? 'true' : undefined}
          >
            <option value="">Select department</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </Select>
          {errors.department && <p role="alert" style={errStyle}>{errors.department}</p>}
        </Field>
        <Field label="Cohort code" optional htmlFor="enrol-cohort">
          <Input
            id="enrol-cohort"
            value={cohortCode}
            placeholder="RO-2026-A"
            onChange={(e) => setCohortCode(e.target.value)}
          />
        </Field>
      </div>

      <Button type="submit" variant="primary" full>Enrol in training</Button>
    </form>
  );
}

export default function App() {
  const hash = useHashRoute();
  const isAdmin = hash === '#/admin';
  const isLearn = hash === '#/learn' || hash.startsWith('#/learn/');
  const isEnroll = hash.startsWith('#/enroll/');

  if (isAdmin) return <AdminConsole />;
  if (isEnroll) return <EnrollView hash={hash} />;
  if (isLearn) return <LearningSite hash={hash} />;
  return <Landing />;
}
