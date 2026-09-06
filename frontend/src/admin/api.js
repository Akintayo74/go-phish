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
  // Phase 10 — clone a campaign as a new re-test phase. The new campaign is born
  // 'draft', links back to the source, and copies only the definition (never the
  // source's interactions). `attrs` may override name / phase_label / description
  // / enrollment_trigger; omit to inherit the source.
  cloneCampaign: (id, attrs = {}) =>
    request(`/campaigns/${id}/clone`, { method: 'POST', body: attrs }),
  // Phase 10 — the campaign's whole re-test family (original + all clones),
  // oldest-first, for the Phase I vs Phase II side-by-side comparison view.
  campaignPhases: (id) => request(`/campaigns/${id}/phases`),
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

  // --- Cohorts & consent ---------------------------------------------------
  // Consent is cohort-level and is the single gate on delivery (guardrail #3).
  // Note there is no `updateCohort({ consent_status })`: the backend refuses to
  // set it through PATCH, so consent moves only through the two explicit
  // transitions below. Keeping that shape in the client too means there is no
  // client-side way to express "set consent to granted" as an ordinary edit.
  listCohorts: () => request('/cohorts'),
  createCohort: (attrs) => request('/cohorts', { method: 'POST', body: attrs }),
  updateCohort: (id, attrs) => request(`/cohorts/${id}`, { method: 'PATCH', body: attrs }),
  deleteCohort: (id) => request(`/cohorts/${id}`, { method: 'DELETE' }),
  grantCohortConsent: (id) => request(`/cohorts/${id}/consent/grant`, { method: 'POST' }),
  withdrawCohortConsent: (id) => request(`/cohorts/${id}/consent/withdraw`, { method: 'POST' }),

  // --- Participants --------------------------------------------------------
  // `cohortId` is optional; omit it for the whole roster.
  listParticipants: (cohortId) =>
    request(cohortId ? `/participants?cohort_id=${encodeURIComponent(cohortId)}` : '/participants'),
  // `identifier` is a RAW email/phone. It is hashed by the backend on write and
  // never stored (guardrail #6) — treat it here the way SendPanel treats its
  // roster: transient, component state only, dropped once submitted.
  createParticipant: (attrs) => request('/participants', { method: 'POST', body: attrs }),
  updateParticipant: (id, attrs) =>
    request(`/participants/${id}`, { method: 'PATCH', body: attrs }),
  deleteParticipant: (id) => request(`/participants/${id}`, { method: 'DELETE' }),
  participantOptOut: (id) => request(`/participants/${id}/opt-out`, { method: 'POST' }),
  participantOptIn: (id) => request(`/participants/${id}/opt-in`, { method: 'POST' }),
  // Resolve a raw address to the participant it was enrolled as, so an operator
  // holding an opt-out request can act on it. POST (not a query string) so the
  // address stays in a body the request logger never reads. The response is the
  // participant row — no behavioural data, by design.
  lookupParticipant: (identifier) =>
    request('/participants/lookup', { method: 'POST', body: { identifier } }),
};

// The URL of the anonymized CSV export. Aggregate-only, small groups suppressed
// — no per-individual data.
export function analyticsExportPath(id, groupBy = 'cohort') {
  return `/api/analytics/campaigns/${id}/export?group_by=${encodeURIComponent(groupBy)}&format=csv`;
}

// Fetch that CSV as a blob. This cannot be a plain `<a href download>`: the
// bearer token is a HEADER credential, and a link carries no headers — the
// download would arrive as a 401. So the export goes through `fetch` with auth
// and the caller saves the blob (see CampaignAnalytics).
//
// The filename mirrors the server's own Content-Disposition rather than parsing
// it, which keeps this free of header-parsing for a value that is derived from
// two arguments we already hold.
export async function fetchAnalyticsExport(id, groupBy = 'cohort') {
  const token = getToken();
  const res = await fetch(analyticsExportPath(id, groupBy), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = new Error(`export_failed_${res.status}`);
    err.status = res.status;
    throw err;
  }
  return { blob: await res.blob(), filename: `campaign-${id}-${groupBy}.csv` };
}
