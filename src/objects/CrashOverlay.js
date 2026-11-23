// Graceful fail (v0.8.3): when something breaks inside a frame, Phaser never asks for the next one, so the whole game
// freezes on the last picture with no way out. This watches for that: after an uncaught error it waits a moment, and
// if the game loop really stopped (no new frames while the tab is visible) it shows a window over everything, in the
// game's own window style (slate header, stone body, the message in red, like the Leaderboard's "Retry" state):
//   Keep Playing  restarts the game loop (the broken frame is skipped; if it breaks again, the window comes back),
//   Reload        reloads the page (online villages are saved on the server; offline ones in this browser).
// Errors that don't stop the loop (a failed request, a sound that won't play) are only logged, never shown.
// Plain HTML over the canvas (like LockOverlay), so it works whatever state the canvas is in.
import { FONT, BODY_FONT } from '../theme.js';

const ID = 'ibtd-crash';
export const CRASH_CHECK_MS = 1500; // how long the loop may stand still after an error before it counts as stopped

/** Is the window up? */
export const crashShown = () => typeof document !== 'undefined' && !!document.getElementById(ID);

/** A plain, player-facing line for an error (no stack traces or code words). */
export function crashMessage(err) {
  const raw = String((err && (err.message || err.reason)) || err || '');
  const detail = raw && raw.length <= 140 && !/\n|at .*\(|undefined|null|is not a function|Cannot read/.test(raw) ? raw : '';
  return detail ? `The game hit a problem: ${detail}` : 'The game hit a problem and stopped.';
}

function button(label, color, edge, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  Object.assign(b.style, {
    fontFamily: FONT, fontSize: '22px', color: '#fff', background: color, border: `3px solid ${edge}`, borderRadius: '12px',
    padding: '10px 24px', margin: '0 8px', cursor: 'pointer', boxShadow: 'inset 0 -4px 0 rgba(0,0,0,0.18)', textShadow: '0 2px 0 rgba(0,0,0,0.35)'
  });
  b.addEventListener('click', onClick);
  return b;
}

/** Show the window (once). `onKeepPlaying` restarts the game; Reload reloads the page. */
export function showCrashOverlay(err, { onKeepPlaying = null } = {}) {
  if (typeof document === 'undefined' || crashShown() || document.getElementById('ibtd-lock')) return; // (the lock notice wins)
  const wrap = document.createElement('div');
  wrap.id = ID;
  wrap.setAttribute('role', 'alertdialog');
  wrap.setAttribute('aria-modal', 'true');
  Object.assign(wrap.style, {
    position: 'fixed', inset: '0', zIndex: '10001', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.6)', padding: '16px', boxSizing: 'border-box'
  });
  const box = document.createElement('div');
  Object.assign(box.style, {
    maxWidth: '560px', width: '100%', background: '#efe9dc', border: '4px solid #1b1712', borderRadius: '18px',
    boxSizing: 'border-box', textAlign: 'center', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.55)'
  });
  const head = document.createElement('div');
  head.textContent = 'Something went wrong';
  Object.assign(head.style, {
    background: '#3b434c', color: '#fff', fontFamily: FONT, fontSize: '28px', padding: '12px 16px',
    borderBottom: '4px solid #1b1712', textShadow: '0 3px 0 #1b1712'
  });
  const body = document.createElement('div');
  Object.assign(body.style, { padding: '22px 24px 24px', fontFamily: BODY_FONT });
  const msg = document.createElement('p');
  msg.textContent = crashMessage(err);
  Object.assign(msg.style, { margin: '0 0 8px', fontSize: '19px', fontWeight: 'bold', color: '#c0392b', lineHeight: '1.35' });
  const hint = document.createElement('p');
  hint.textContent = 'Try to keep playing, or reload the game. A reload keeps everything up to your village’s last save.';
  Object.assign(hint.style, { margin: '0 0 20px', fontSize: '15px', fontWeight: 'bold', color: '#7a6a55', lineHeight: '1.4' });
  const row = document.createElement('div');
  const close = () => wrap.remove();
  if (onKeepPlaying) row.appendChild(button('Keep Playing', '#3d8fe0', '#1d4f80', () => { close(); onKeepPlaying(); }));
  row.appendChild(button('Reload', '#6cbf2c', '#2d5a20', () => location.reload()));
  body.append(msg, hint, row);
  box.append(head, body);
  wrap.appendChild(box);
  document.body.appendChild(wrap);
  const first = row.querySelector('button');
  if (first) first.focus();
}

/**
 * Watch `game` for a stopped loop after an uncaught error, and show the window when it happens. `win` / `doc` are the
 * page's window and document, `show` what to call (tests pass stand-ins). Returns a function that stops watching.
 */
export function installCrashGuard(game, { win = typeof window !== 'undefined' ? window : null, doc = typeof document !== 'undefined' ? document : null, show = showCrashOverlay } = {}) {
  if (!win || !game || !game.loop) return () => {};
  let checking = false;
  const restart = () => { try { game.loop.sleep(); game.loop.wake(); } catch (e) { console.error('Keep Playing: could not restart the game', e); } };
  const check = (err) => {
    if (checking || crashShown()) return;
    checking = true;
    const frame = game.loop.frame;
    const look = () => {
      if (doc && doc.hidden) { win.setTimeout(look, CRASH_CHECK_MS); return; } // a hidden tab draws no frames anyway
      checking = false;
      if (game.loop.frame === frame) show(err, { onKeepPlaying: restart });
    };
    win.setTimeout(look, CRASH_CHECK_MS);
  };
  const onError = (e) => check(e && (e.error || e.message));
  win.addEventListener('error', onError);
  return () => win.removeEventListener('error', onError);
}
