import React, { useEffect, useState } from 'react';

// Phase 0 shell. Later phases mount the admin console and the public CAT
// learning site under their own routes; for now this confirms the frontend
// builds, renders, and can reach the backend health endpoint.
export default function App() {
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
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>CAT-Sim</h1>
      <p>Cybersecurity Awareness Training &amp; phishing-simulation platform.</p>
      <p>
        Backend status: <strong data-testid="health">{health}</strong>
      </p>
    </main>
  );
}
