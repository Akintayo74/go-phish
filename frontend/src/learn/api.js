// Public CAT learning-site API client (Phase 6). The learning site is public
// and unauthenticated, so — unlike admin/api.js — this client sends no bearer
// token. It reads content only. The backend returns { data } on success and
// { error } on failure.

async function get(path) {
  const res = await fetch(`/api/learn${path}`);

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

export const learnApi = {
  // Resource library: published modules grouped by category.
  library: () => get('/library'),
  // Published module index (metadata only), optionally filtered by category.
  modules: (category) =>
    get(category ? `/modules?category=${encodeURIComponent(category)}` : '/modules'),
  // One published module by slug, including its markdown body.
  module: (slug) => get(`/modules/${encodeURIComponent(slug)}`),
};
