// Spam guards on the game's side (v0.8.3). The server has the real limits: Supabase Auth rate-limits log ins and
// sign ups and checks the Turnstile "I'm human" token, and the player functions count calls per player
// (supabase/migration-2026-11-22-spam-guard.sql: rate_limit_hit). These keep a player from hammering the buttons
// and give a clear message instead of a server error.
//
// Log in / Sign Up (AuthScene): after FREE_TRIES failed tries in a row, each next try waits a cooldown that doubles
// per failure (5, 10, 20, 40, 60 s...; at most MAX_MS). A success clears it. "Send it again" (the confirmation
// email) waits RESEND_GAP_MS between emails. Kept for the page's life, so leaving the screen doesn't reset it.
// Find Players (PlayerSearchWindow) keeps its own: one search at a time, SEARCH_GAP_MS apart.

export const AUTH_GUARD = { FREE_TRIES: 3, BASE_MS: 5000, MAX_MS: 60000, RESEND_GAP_MS: 30000 };

/** A fresh guard (the game uses the one shared `authGuard`; tests make their own). `clock` returns ms. */
export function createAuthGuard(clock = () => Date.now(), rules = AUTH_GUARD) {
  let fails = 0, until = 0, resendAt = -Infinity;
  const secs = (ms) => Math.max(0, Math.ceil(ms / 1000));
  return {
    /** Seconds still to wait before the next try (0: go ahead). */
    cooldownLeft: () => secs(until - clock()),
    /** A try failed (wrong password, name taken...; not a lost connection). */
    failed() {
      fails++;
      const over = fails - rules.FREE_TRIES;
      if (over >= 0) until = clock() + Math.min(rules.MAX_MS, rules.BASE_MS * 2 ** over);
    },
    /** A try worked: no more waiting. */
    succeeded() { fails = 0; until = 0; },
    /** Seconds until another confirmation email may be asked for (0: now). */
    resendLeft: () => secs(resendAt + rules.RESEND_GAP_MS - clock()),
    resent() { resendAt = clock(); }
  };
}

export const authGuard = createAuthGuard();
