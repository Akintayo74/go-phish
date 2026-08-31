// Minimal admin API client (Phase 3). Wraps fetch with the bearer token and a
// consistent error shape. No dependencies — the backend returns { error } on
// failure and { data } / { token, admin } on success.

const TOKEN_KEY = 'catsim.admin.token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (_e) {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (_e) {
    /* storage unavailable — sessions just won't persist across reloads */
  }
}

async function request(path, { method = 'GET', body, token = getToken() } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch (_e) {
    payload = null;
  }

  if (!res.ok) {
    const err = new Error((payload && payload.error) || `request_failed_${res.status}`);
    err.status = res.status;
    err.code = payload && payload.error;
    throw err;
  }
  return payload;
}

export const api = {
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/auth/me'),
  listCampaigns: () => request('/campaigns'),
  createCampaign: (attrs) => request('/campaigns', { method: 'POST', body: attrs }),
  campaignTransition: (id, action) =>
    request(`/campaigns/${id}/${action}`, { method: 'POST' }),
  // Phase 5 — manual "send now". `recipients` is the raw address roster held by
  // the admin; it is sent transiently and never stored by the backend. Returns
  // an aggregate delivery summary.
  sendCampaign: (id, recipients, { resend = false } = {}) =>
    request(`/campaigns/${id}/send`, { method: 'POST', body: { recipients, resend } }),
  // Phase 8 — notify auto-enrolled participants by email. Like `sendCampaign`,
  // `recipients` is the raw roster held by the admin, sent transiently and never
  // stored. Returns an aggregate notification summary.
  notifyEnrollments: (id, recipients) =>
    request(`/campaigns/${id}/notify-enrollments`, { method: 'POST', body: { recipients } }),

  // Phase 9 — analytics dashboard. Aggregate-only (guardrail #5): every response
  // is grouped by cohort/department with small groups suppressed server-side —
  // there is no per-individual result to fetch. `groupBy` is 'cohort' (default)
  // or 'department'.
  campaignAnalytics: (id, groupBy = 'cohort') =>
    request(`/analytics/campaigns/${id}?group_by=${encodeURIComponent(groupBy)}`),
  // Phase-over-phase comparison of several campaigns (side-by-side rates + deltas).
  compareCampaigns: (ids) =>
    request(`/analytics/compare?campaign_ids=${ids.map(encodeURIComponent).join(',')}`),
};

// The URL of the anonymized CSV export (a plain GET the browser can download).
// Aggregate-only, small groups suppressed — no per-individual data. The bearer
// token is a header credential, so a raw <a href> download can't carry it; the
// UI fetches with auth and saves the blob instead (see CampaignAnalytics).
export function analyticsExportPath(id, groupBy = 'cohort') {
  return `/api/analytics/campaigns/${id}/export?group_by=${encodeURIComponent(groupBy)}&format=csv`;
}
