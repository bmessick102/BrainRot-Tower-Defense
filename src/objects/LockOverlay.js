// "This village was opened in another tab", "saved somewhere else", or (v0.15.4) "opened on another device": a
// page-wide notice over the game, shown when session.lock is set (src/net/session.js). This tab has stopped saving
// that village, so the only way on is a reload. "Reload here and take over" reopens the village in this tab after the
// reload (the other tab is then told in turn); after "another device", a reload logs in again and takes the account
// back (the newest login wins). Plain HTML over the canvas, so it works over any scene even with the game paused, drawn
// in the game's window and button look (v0.15.4: index.html's .ibtd-window / .ibtd-button styles, which copy
// uiDraw.js drawWindow / drawGlossy and the Lilita One title).
const TAKEOVER_KEY = 'ibtd.takeover';

/** The notice's title, text and button for a lock ({ reason: 'tab' | 'conflict' | 'device', name }). */
export function lockMessage(lock) {
  const name = lock && lock.name ? `“${lock.name}”` : 'This village';
  if (lock && lock.reason === 'tab') {
    return { title: 'This village was opened in another tab', button: 'Reload here and take over',
      text: `${name} is now open in another tab or window of this browser. This tab has stopped saving it, so nothing here can overwrite that tab’s progress.` };
  }
  if (lock && lock.reason === 'device') {
    return { title: 'Your village was opened on another device', button: 'Reload',
      text: 'Your account was just opened on another device, so this one has stopped saving. Only one device can play an account at a time. Reload to play here again (the other device then stops).' };
  }
  return { title: 'This village was saved somewhere else', button: 'Reload',
    text: `${name} was saved from another tab or device after this tab loaded it. To keep that newer progress, this tab has stopped saving it. What you played here since then is kept on this device as a backup: Villages → Import from this device.` };
}

/** Show the notice (once). `game`: the Phaser game, paused under it. */
export function showLockOverlay(lock, game = null) {
  if (typeof document === 'undefined' || !lock || document.getElementById('ibtd-lock')) return;
  const tab = lock.reason === 'tab';
  const msg = lockMessage(lock);
  const wrap = document.createElement('div');
  wrap.id = 'ibtd-lock';
  wrap.setAttribute('role', 'alertdialog');
  wrap.setAttribute('aria-modal', 'true');
  Object.assign(wrap.style, {
    position: 'fixed', inset: '0', zIndex: '10000', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.72)', padding: '16px', boxSizing: 'border-box'
  });
  const box = document.createElement('div');
  box.className = 'ibtd-window';
  const head = document.createElement('div');
  head.className = 'ibtd-window-header';
  const h = document.createElement('h2');
  h.className = 'ibtd-title';
  h.textContent = msg.title;
  head.appendChild(h);
  const body = document.createElement('div');
  body.className = 'ibtd-window-body';
  const p = document.createElement('p');
  p.textContent = msg.text;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ibtd-button';
  btn.textContent = msg.button;
  btn.addEventListener('click', () => {
    if (tab) { try { sessionStorage.setItem(TAKEOVER_KEY, String(lock.baseId)); } catch { /* blocked: reload only */ } }
    location.reload();
  });
  body.append(p, btn);
  box.append(head, body);
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
