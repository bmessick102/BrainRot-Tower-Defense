// "This village was opened in another tab" (or "saved somewhere else"): a page-wide notice over the game,
// shown when session.lock is set (src/net/session.js). This tab has stopped saving that village, so the only
// way on is a reload. "Reload here and take over" reopens the village in this tab after the reload (the other
// tab is then told in turn). Plain HTML over the canvas, so it works over any scene.
import { FONT, BODY_FONT } from '../theme.js';

const TAKEOVER_KEY = 'ibtd.takeover';

/** Show the notice (once). `game`: the Phaser game, paused under it. */
export function showLockOverlay(lock, game = null) {
  if (typeof document === 'undefined' || !lock || document.getElementById('ibtd-lock')) return;
  const tab = lock.reason === 'tab';
  const name = lock.name ? `“${lock.name}”` : 'This village';
  const wrap = document.createElement('div');
  wrap.id = 'ibtd-lock';
  wrap.setAttribute('role', 'alertdialog');
  wrap.setAttribute('aria-modal', 'true');
  Object.assign(wrap.style, {
    position: 'fixed', inset: '0', zIndex: '10000', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.72)', padding: '16px', boxSizing: 'border-box'
  });
  const box = document.createElement('div');
  Object.assign(box.style, {
    maxWidth: '560px', width: '100%', background: '#f4ecd8', border: '4px solid #3b2a1a', borderRadius: '16px',
    padding: '22px 24px', boxSizing: 'border-box', textAlign: 'center', color: '#3b2a1a', fontFamily: BODY_FONT,
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
  });
  const h = document.createElement('h2');
  h.textContent = tab ? 'This village was opened in another tab' : 'This village was saved somewhere else';
  Object.assign(h.style, { margin: '0 0 12px', fontFamily: FONT, fontWeight: 'normal', fontSize: '26px', color: '#3b2a1a' });
  const p = document.createElement('p');
  p.textContent = tab
    ? `${name} is now open in another tab or window of this browser. This tab has stopped saving it, so nothing here can overwrite that tab’s progress.`
    : `${name} was saved from another tab or device after this tab loaded it. To keep that newer progress, this tab has stopped saving it. What you played here since then is kept on this device as a backup: Villages → Import from this device.`;
  Object.assign(p.style, { margin: '0 0 18px', fontSize: '17px', fontWeight: 'bold', lineHeight: '1.4' });
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = tab ? 'Reload here and take over' : 'Reload';
  Object.assign(btn.style, {
    fontFamily: FONT, fontSize: '22px', color: '#fff', background: '#4f9a3a', border: '3px solid #2d5a20',
    borderRadius: '12px', padding: '10px 26px', cursor: 'pointer'
  });
  btn.addEventListener('click', () => {
    if (tab) { try { sessionStorage.setItem(TAKEOVER_KEY, String(lock.baseId)); } catch { /* blocked: reload only */ } }
    location.reload();
  });
  box.append(h, p, btn);
  wrap.appendChild(box);
  document.body.appendChild(wrap);
  btn.focus();
  // The game underneath stops (a wave can't run on unseen, and its saves would be dropped anyway).
  try { if (game) { game.pause(); if (game.sound) game.sound.pauseAll(); } } catch { /* already stopped */ }
}

/** After "Reload here and take over": the village to open again in this tab (once), or null. */
export function takeTakeover() {
  try {
    const id = sessionStorage.getItem(TAKEOVER_KEY);
    if (id) sessionStorage.removeItem(TAKEOVER_KEY);
    return id || null;
  } catch { return null; }
}
