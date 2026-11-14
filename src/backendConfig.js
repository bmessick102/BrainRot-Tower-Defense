// Online accounts, villages, achievements and the leaderboard run on Supabase (see README: "Online
// features"). Paste your project's values here, from Supabase: Project Settings -> API (or "Connect").
//
// Both are meant to be public: the anon key only lets players do what the Row Level Security rules in
// supabase/schema.sql allow (their own villages, stats and achievements; everyone's leaderboard names).
// Never put the service_role key here.
export const SUPABASE_URL = 'https://sphfnuliricraejdbysi.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_A9vTTSiIK4DqdJO4FYV1dw_loX73Cgo';

// Cloudflare Turnstile "are you human?" check on Log In / Sign Up (README: "Online features").
// The SITE key is public; its SECRET key goes only into Supabase (Authentication -> Attack Protection).
// Empty: no check is shown. Turn CAPTCHA on in Supabase only after this key is live, or logins fail.
export const TURNSTILE_SITE_KEY = '0x4AAAAAAF-9vLQ6U0K63-3U';
