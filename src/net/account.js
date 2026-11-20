// The one account session for the running game (see session.js), on the backend picked here:
// - Supabase, once src/backendConfig.js has the project's URL and anon key;
// - on the dev server without keys (or with ?backend=local): LocalBackend, accounts kept in this browser;
// - otherwise none: the login screen says online play isn't set up and offers offline play.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../backendConfig.js';
import { SupabaseBackend } from './supabaseBackend.js';
import { LocalBackend } from './localBackend.js';
import { Session } from './session.js';
import { TabGuard, makeTabBus } from './tabGuard.js';

function deviceStorage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

function makeBackend(storage) {
  const dev = !!(import.meta.env && import.meta.env.DEV);
  const forceLocal = dev && typeof location !== 'undefined' && /[?&]backend=local\b/.test(location.search);
  if (SUPABASE_URL && SUPABASE_ANON_KEY && !forceLocal) return new SupabaseBackend(SUPABASE_URL, SUPABASE_ANON_KEY);
  if (dev && storage) return new LocalBackend(storage);
  return null;
}

const storage = deviceStorage();
// The tab guard: a village opened in another tab of this browser stops this tab saving it (tabGuard.js).
export const session = new Session({ backend: makeBackend(storage), storage, guard: new TabGuard({ bus: makeTabBus() }) });

// Another tab logged out or switched accounts: this tab starts over as whoever is logged in now (its unsent
// progress is in the device copies and is picked up at that account's next login).
if (session.backend) {
  session.backend.onUserChanged = () => {
    session.reset();
    session.changed();
    if (typeof location !== 'undefined') location.reload();
  };
}

// Leaving or hiding the page: send anything waiting (the device copy covers it if this doesn't finish).
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') session.flush(); });
}
