// Enrollment / training-completion API client (Phase 8). Like the learn client,
// the enroll routes are public and unauthenticated — reached from the enrollment
// email by an opaque assignment token — so this client sends no bearer token.
// The backend returns { data } on success and { error } on failure.

async function request(path, options) {
  const res = await fetch(`/api/enroll${path}`, options);

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

export const enrollApi = {
  // The assignment behind a token + its assigned module. Marks the assignment
  // in_progress on the server the first time it is viewed.
  assignment: (token) => request(`/${encodeURIComponent(token)}`),
  // Submit a knowledge-check attempt for server-side scoring. A pass marks the
  // assignment completed. Returns the aggregate result + the new status.
  submitQuiz: (token, answers) =>
    request(`/${encodeURIComponent(token)}/quiz/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    }),
};
