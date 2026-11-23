// A window over a dim backdrop, in the same look as Settings: light stone body, slate header with the title,
// red X to close (and ESC: only the top window closes). Content added with add() is cleared by clear().
// Plus two ready-made dialogs: confirmDialog (yes / no) and promptDialog (type a name).
import { Button } from './Button.js';
import { drawWindow, fitWidth } from './uiDraw.js';
import { addTextField } from './TextField.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';
import { VIEW } from '../renderScale.js';

const open = []; // every open Modal, oldest first

export class Modal {
  /** True while any Modal is open in `scene`. */
  static isOpen(scene) { return open.some((m) => m.scene === scene); }

  /**
   * @param {Phaser.Scene} scene
   * @param {object} o
   * @param {number} o.width
   * @param {number} o.height
   * @param {string} o.title
   * @param {number} [o.y] top edge (centered when left out)
   * @param {number} [o.depth]
   * @param {boolean} [o.closable] X button + ESC (default true)
   * @param {() => void} [o.onClose]
   */
  constructor(scene, { width, height, title, y = null, depth = 1000, header = 60, closable = true, onClose = null }) {
    this.scene = scene;
    this.w = width;
    this.h = height;
    this.header = header;
    this.depth = depth + open.length * 10; // stacked dialogs sit above the window that opened them
    this.onClose = onClose;
    const { width: sw, height: sh } = VIEW;
    this.x = Math.round(sw / 2 - width / 2);
    this.y = y === null ? Math.round(sh / 2 - height / 2) : y;
    this.cx = sw / 2;

    const shade = scene.add.rectangle(0, 0, sw, sh, 0x000000, 0.6).setOrigin(0).setInteractive();
    const g = scene.add.graphics();
    drawWindow(g, this.x, this.y, width, height, { header });
    this.titleText = scene.add.text(this.cx, this.y + 4 + header / 2, title, textStyle(Math.round(header * 0.53))).setOrigin(0.5);
    this.frame = [shade, g, this.titleText];
    this.setTitle(title);
    if (closable) {
      this.frame.push(new Button(scene, this.x + width - 14, this.y + 14, 52, 50, '', () => this.close(), { color: COLORS.buttonDanger, icon: 'x', radius: 10 }));
    }
    this.frame.forEach((o) => o.setDepth(this.depth));
    this.content = [];
    open.push(this);
    if (closable && scene.input.keyboard) {
      this.onEsc = () => { if (open[open.length - 1] === this) this.close(); };
      scene.input.keyboard.on('keydown-ESC', this.onEsc);
    }
    // A scene that shuts down takes its windows with it.
    scene.events.once('shutdown', this.onShutdown = () => this.destroy());
  }

  /**
   * A new height, staying centered (the RV Lab window grows for a merged type's Mastery row). Redraws the frame and moves
   * the title and close button; content uses m.y, so redraw it after.
   */
  resize(height) {
    if (!this.frame || height === this.h) return this;
    const sh = VIEW.height;
    const dy = Math.round(sh / 2 - height / 2) - this.y;
    this.h = height;
    this.y += dy;
    const [, g, title, close] = this.frame;
    g.clear();
    drawWindow(g, this.x, this.y, this.w, height, { header: this.header });
    title.y += dy;
    if (close) close.y += dy;
    return this;
  }

  setTitle(text) {
    this.titleText.setText(text).setScale(1);
    const room = this.w - 150; // clear of the close button on the right (and balanced on the left)
    fitWidth(this.titleText, room);
    return this;
  }

  /** Add content objects (drawn above the window). Returns the first one for chaining convenience. */
  add(...objs) {
    const list = objs.flat();
    for (const o of list) {
      if (o.setDepth) o.setDepth(this.depth + 1);
      this.content.push(o);
    }
    return list[0];
  }

  /** Remove all content (keeps the window). */
  clear() {
    this.content.forEach((o) => o.destroy());
    this.content = [];
  }

  close() {
    if (!this.frame) return;
    this.destroy();
    if (this.onClose) this.onClose();
  }

  destroy() {
    if (!this.frame) return;
    const i = open.indexOf(this);
    if (i >= 0) open.splice(i, 1);
    if (this.onEsc && this.scene.input.keyboard) this.scene.input.keyboard.off('keydown-ESC', this.onEsc);
    if (this.onShutdown) this.scene.events.off('shutdown', this.onShutdown);
    this.clear();
    this.frame.forEach((o) => o.destroy());
    this.frame = null;
  }
}

/**
 * Yes / no question. `lines`: the question text (string or array; the first line is drawn bigger).
 * onConfirm runs after the dialog closes. Returns the Modal.
 */
export function confirmDialog(scene, { title, lines, confirmLabel = 'OK', confirmColor = COLORS.buttonDanger, cancelLabel = 'Cancel', onConfirm, onCancel = null, width = 540 }) {
  const list = Array.isArray(lines) ? lines : [lines];
  const height = 200 + list.length * 30;
  const m = new Modal(scene, { width, height, title, header: 56, onClose: onCancel });
  let y = m.y + 96;
  list.forEach((line, i) => {
    m.add(scene.add.text(m.cx, y, line, bodyStyle(i === 0 ? 22 : 17, i === 0 ? COLORS.ink : COLORS.inkDim, { align: 'center', wordWrap: { width: width - 60 } })).setOrigin(0.5));
    y += i === 0 ? 38 : 28;
  });
  const by = m.y + height - 50;
  m.add(new Button(scene, m.cx - 120, by, 210, 54, confirmLabel, () => { m.destroy(); onConfirm(); }, { color: confirmColor, fontSize: 21 }));
  m.add(new Button(scene, m.cx + 120, by, 210, 54, cancelLabel, () => m.close(), { color: COLORS.buttonDark, fontSize: 21 }));
  return m;
}

/**
 * Ask for a short text (a village name). onConfirm(value, setError, setBusy) may be async: the dialog stays
 * open (buttons disabled) until it resolves; throw or call setError to show a message and keep it open.
 */
export function promptDialog(scene, { title, label, value = '', placeholder = '', maxLength = 20, confirmLabel = 'OK', note = '', onConfirm, onCancel = null }) {
  const width = 540, height = note ? 290 : 262;
  const m = new Modal(scene, { width, height, title, header: 56, onClose: onCancel });
  const rowY = m.y + 104;
  m.add(scene.add.text(m.x + 30, rowY, label, bodyStyle(19)).setOrigin(0, 0.5));
  const labelW = 130;
  const submit = async () => {
    if (ok.enabled === false) return;
    const v = field.value.trim();
    if (!v) { msg.setText('Type a name first.'); return; }
    ok.setEnabled(false); cancel.setEnabled(false); msg.setColor(COLORS.inkDim).setText('Working…');
    try {
      await onConfirm(v);
      m.destroy();
    } catch (e) {
      if (!m.frame) return;
      ok.setEnabled(true); cancel.setEnabled(true);
      msg.setColor(COLORS.inkBad).setText(e && e.message ? e.message : String(e));
    }
  };
  const field = m.add(addTextField(scene, m.x + 30 + labelW, rowY, width - 60 - labelW, { value, placeholder, maxLength, onEnter: submit }));
  const msg = m.add(scene.add.text(m.cx, rowY + 46, '', bodyStyle(16, COLORS.inkBad, { align: 'center', wordWrap: { width: width - 60 } })).setOrigin(0.5));
  if (note) m.add(scene.add.text(m.cx, rowY + 74, note, bodyStyle(15, COLORS.inkDim, { align: 'center', wordWrap: { width: width - 60 } })).setOrigin(0.5));
  const by = m.y + height - 50;
  const ok = m.add(new Button(scene, m.cx - 120, by, 210, 54, confirmLabel, submit, { color: COLORS.buttonGood, fontSize: 21 }));
  const cancel = m.add(new Button(scene, m.cx + 120, by, 210, 54, 'Cancel', () => m.close(), { color: COLORS.buttonDark, fontSize: 21 }));
  scene.time.delayedCall(50, () => { if (m.frame) field.focus(); });
  return m;
}
