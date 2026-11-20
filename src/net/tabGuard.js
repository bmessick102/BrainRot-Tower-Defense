// One village open in one tab at a time (per browser).
//
// A tab that opens a village "claims" it. Any other tab of this browser that has the same village open is told:
// it stops saving that village (session.js shows "This village was opened in another tab"), lets its last
// upload finish, writes its final device copy and answers "released". Only then does the new tab read the
// village, so it starts from everything the old tab saved. If two tabs claim at the same moment, the later
// claim wins.
//
// A tab can also ask which villages the other tabs have open (holders), so logging in never touches the
// device copy of a village another tab is playing.
//
// Messages go over a BroadcastChannel, or (browsers without one) localStorage 'storage' events. The server
// check (session.js uploads only on top of the revision it loaded) still protects villages opened on two
// devices, or in a browser where neither works.

const CHANNEL = 'ibtd.villages';
const STORAGE_KEY = 'ibtd.tabMessage';
const ACK_MS = 250;       // how long a claim waits for another tab to say it has the village
const RELEASE_MS = 5000;  // ... and then for that tab to finish its last upload

const randomId = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`);

/**
 * A message bus between this browser's tabs: { post(msg), listen(fn) }, or null when the browser has neither
 * BroadcastChannel nor localStorage events.
 */
export function makeTabBus(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return null;
  try {
    if (typeof win.BroadcastChannel === 'function') {
      const ch = new win.BroadcastChannel(CHANNEL);
      return { post: (m) => ch.postMessage(m), listen: (fn) => { ch.onmessage = (e) => fn(e.data); } };
    }
  } catch { /* fall back to storage events */ }
  try {
    const ls = win.localStorage;
    if (!ls || typeof win.addEventListener !== 'function') return null;
    let n = 0;
    return {
      // 'storage' fires in every other tab when the value changes; the counter makes each message new.
      post: (m) => { try { ls.setItem(STORAGE_KEY, JSON.stringify({ ...m, seq: `${Date.now()}.${++n}.${Math.random()}` })); } catch { /* blocked */ } },
      listen: (fn) => win.addEventListener('storage', (e) => {
        if (e.key !== STORAGE_KEY || !e.newValue) return;
        try { fn(JSON.parse(e.newValue)); } catch { /* not ours */ }
      })
    };
  } catch { return null; }
}

export class TabGuard {
  /**
   * @param {object} o
   * @param {{post: Function, listen: Function}|null} o.bus makeTabBus() (or a test bus)
   */
  constructor({ bus = null, tabId = randomId(), ackMs = ACK_MS, releaseMs = RELEASE_MS } = {}) {
    this.bus = bus;
    this.tabId = tabId;
    this.ackMs = ackMs;
    this.releaseMs = releaseMs;
    this.seq = 0;
    this.pending = new Map();  // claim / question id -> what came back
    this.claiming = new Map(); // baseId -> { at } while this tab's claim waits
    // Set by the session:
    this.onClaim = null; // (msg) => Promise (this tab had it: resolves once released) | null (it didn't)
    this.onWho = null;   // (uid) => [baseIds this tab has open for that account]
    if (bus) bus.listen((m) => this.receive(m));
  }

  post(m) { try { this.bus.post({ ...m, from: this.tabId }); } catch { /* closed */ } }

  receive(m) {
    if (!m || typeof m !== 'object' || m.from === this.tabId) return;
    if (m.t === 'claim') {
      const p = this.onClaim ? this.onClaim(m) : null;
      if (!p) return;
      this.post({ t: 'ack', to: m.from, n: m.n });
      Promise.resolve(p).catch(() => {}).then(() => this.post({ t: 'released', to: m.from, n: m.n }));
    } else if (m.t === 'who') {
      const ids = this.onWho ? this.onWho(m.uid) || [] : [];
      if (ids.length) this.post({ t: 'holding', to: m.from, n: m.n, ids });
    } else if (m.to === this.tabId) {
      const c = this.pending.get(m.n);
      if (c) c.on(m);
    }
  }

  /** Tell the other tabs this one is opening the village; resolves once any that had it open let go. */
  claim(uid, baseId) {
    if (!this.bus) return Promise.resolve({ others: 0 });
    const n = `${this.tabId}:${++this.seq}`;
    const at = Date.now();
    this.claiming.set(baseId, { at });
    return new Promise((resolve) => {
      const acks = new Set(), released = new Set();
      let asked = false, t1 = null, t2 = null;
      const finish = () => {
        clearTimeout(t1); clearTimeout(t2);
        this.pending.delete(n);
        if (this.claiming.get(baseId)?.at === at) this.claiming.delete(baseId);
        resolve({ others: acks.size });
      };
      const check = () => { if (asked && [...acks].every((id) => released.has(id))) finish(); };
      this.pending.set(n, { on: (m) => { if (m.t === 'ack') acks.add(m.from); if (m.t === 'released') { acks.add(m.from); released.add(m.from); } check(); } });
      t1 = setTimeout(() => { asked = true; check(); }, this.ackMs);
      t2 = setTimeout(finish, this.ackMs + this.releaseMs);
      this.post({ t: 'claim', uid, baseId, n, at });
    });
  }

  /** The villages (ids) other tabs have open for this account. */
  holders(uid) {
    if (!this.bus) return Promise.resolve(new Set());
    const n = `${this.tabId}:${++this.seq}`;
    return new Promise((resolve) => {
      const ids = new Set();
      this.pending.set(n, { on: (m) => { if (m.t === 'holding') for (const id of m.ids || []) ids.add(id); } });
      setTimeout(() => { this.pending.delete(n); resolve(ids); }, this.ackMs);
      this.post({ t: 'who', uid, n });
    });
  }

  /** Is this tab's own claim on the village newer than `m` (so `m`'s tab is the one to give way)? */
  newerThan(m) {
    const mine = this.claiming.get(m.baseId);
    return !!mine && (mine.at > m.at || (mine.at === m.at && this.tabId > m.from));
  }
}
