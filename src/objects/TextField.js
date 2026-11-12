// A text box for typing (email, password, names): a real HTML <input> placed over the canvas with Phaser's
// DOM support (main.js turns it on), styled like the game's windows: light stone face, dark frame, bold
// body font, orange outline while focused. Keys typed into it never reach the game's keyboard shortcuts.
//
// Note: DOM elements always sit above the canvas, so hide fields (setVisible(false)) under any dialog
// drawn over them.
import { BODY_FONT, COLORS } from '../theme.js';

const FRAME = '#1b1712';
const FOCUS = '#f2a227';
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * @returns {Phaser.GameObjects.DOMElement} with .value (get/set) and .focus() helpers on it
 */
export function addTextField(scene, x, y, width, {
  type = 'text', placeholder = '', value = '', maxLength = 64, autocomplete = 'off', height = 42, onEnter = null, onInput = null
} = {}) {
  const el = document.createElement('input');
  el.type = type;
  el.placeholder = placeholder;
  el.value = value;
  el.maxLength = maxLength;
  el.autocomplete = autocomplete;
  el.spellcheck = false;
  el.setAttribute('autocapitalize', 'off');
  Object.assign(el.style, {
    width: `${width}px`, height: `${height}px`, boxSizing: 'border-box', padding: '0 14px',
    font: `bold 18px ${BODY_FONT}`, color: COLORS.ink, background: hex(0xfffaf0),
    border: `3px solid ${FRAME}`, borderRadius: '10px', outline: 'none',
    boxShadow: 'inset 0 3px 0 rgba(0,0,0,0.12)'
  });
  el.addEventListener('focus', () => { el.style.borderColor = FOCUS; el.style.boxShadow = `inset 0 3px 0 rgba(0,0,0,0.12), 0 0 0 3px rgba(242,162,39,0.35)`; });
  el.addEventListener('blur', () => { el.style.borderColor = FRAME; el.style.boxShadow = 'inset 0 3px 0 rgba(0,0,0,0.12)'; });
  // Keep typing away from the game's own keys (ESC, R, ...); Enter submits the form.
  for (const ev of ['keydown', 'keyup', 'keypress']) el.addEventListener(ev, (e) => e.stopPropagation());
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } });
  if (onInput) el.addEventListener('input', () => onInput(el.value));

  const dom = scene.add.dom(x, y, el).setOrigin(0, 0.5);
  Object.defineProperty(dom, 'value', { get: () => el.value, set: (v) => { el.value = v; } });
  dom.focus = () => { el.focus(); return dom; };
  return dom;
}
