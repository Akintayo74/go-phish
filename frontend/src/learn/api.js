// Public CAT learning-site API client (Phase 6). The learning site is public
// and unauthenticated, so — unlike admin/api.js — this client sends no bearer
// token. It reads content only. The backend returns { data } on success and
// { error } on failure.

async function request(path, options) {
  const res = await fetch(`/api/learn${path}`, options);

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

const get = (path) => request(path);

const post = (path, body) =>
  request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });

export const learnApi = {
  // Resource library: published modules grouped by category.
  library: () => get('/library'),
  // Published module index (metadata only), optionally filtered by category.
  modules: (category) =>
    get(category ? `/modules?category=${encodeURIComponent(category)}` : '/modules'),
  // One published module by slug, including its markdown body.
  module: (slug) => get(`/modules/${encodeURIComponent(slug)}`),
  // A module's knowledge-check quiz WITHOUT the answer key (Phase 7). The server
  // strips each question's correct answer; the client only ever sees choices.
  quiz: (slug) => get(`/modules/${encodeURIComponent(slug)}/quiz`),
  // Submit an attempt for server-side scoring. Returns the aggregate result
  // (score + pass/fail); the answers are graded on the server, never here.
  submitQuiz: (slug, answers) =>
    post(`/modules/${encodeURIComponent(slug)}/quiz/attempt`, { answers }),
};
