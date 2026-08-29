import React, { useEffect, useState } from 'react';
import AdminConsole from './admin/AdminConsole.jsx';

// App shell. A tiny hash-based switch (no router dependency yet) selects between
// the public landing view and the Phase 3 admin console at #/admin. Later phases
// add the public CAT learning site under its own route.
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

  return (
    <>
      <p>Cybersecurity Awareness Training &amp; phishing-simulation platform.</p>
      <p>
        Backend status: <strong data-testid="health">{health}</strong>
      </p>
      <p>
        <a href="#/admin">Admin console →</a>
      </p>
    </>
  );
}

export default function App() {
  const hash = useHashRoute();
  const isAdmin = hash === '#/admin';

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>CAT-Sim</h1>
      {isAdmin ? <AdminConsole /> : <Landing />}
    </main>
  );
}
