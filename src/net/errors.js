// Errors the account code tells apart (both backends throw them; session.js and the login screen read them).

/** The server couldn't be reached (no connection, or it's down). The login screen then offers offline play. */
export function networkError(message = 'Can’t reach the server. Check your connection.') {
  const e = new Error(message);
  e.network = true;
  return e;
}

export function isNetworkError(e) {
  return !!(e && (e.network === true || /can.t reach the server|failed to fetch|networkerror|network request failed|load failed/i.test(String(e.message || ''))));
}

/**
 * A village save was refused because the server's copy changed since this tab loaded it (another tab or
 * device saved it). `serverRev` is the server's current revision, when known.
 */
export function conflictError(serverRev = null) {
  const e = new Error('This village was saved from another tab or device, so this older copy wasn’t uploaded.');
  e.conflict = true;
  e.serverRev = serverRev;
  return e;
}

export function isConflictError(e) {
  return !!(e && e.conflict === true);
}
