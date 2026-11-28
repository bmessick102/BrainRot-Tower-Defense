import { TEX } from '../assetKeys.js';
import { fitIcon } from './uiDraw.js';
import { formatGold } from '../logic/economy.js';
import { COLORS } from '../theme.js';

/**
 * A price as a left-aligned row: optional title, then each currency's icon and amount (callers use its width to place
 * and center it). `costs`: [{ currency: 'gold' | 'rp', amount, short }]; `short` draws that amount red (can't afford).
 */
export function currencyCost(scene, costs, style, title = '', iconSize = 21) {
  const row = scene.add.container();
  let width = 0;
  const addText = (value, short = false) => {
    const label = scene.add.text(width, 0, value, short ? { ...style, color: COLORS.textBad } : style).setOrigin(0, 0.5);
    row.add(label);
    width += label.width;
  };
  if (title) {
    addText(title);
    width += 9;
  }
  for (const [index, { currency, amount, short }] of costs.entries()) {
    if (index) width += 14;
    const key = currency === 'rp' ? TEX.researchPoint : TEX.coin;
    if (scene.textures.exists(key)) {
      row.add(fitIcon(scene.add.image(width + iconSize / 2, 0, key), iconSize));
      width += iconSize + 4;
      addText(formatGold(amount), short);
    } else {
      addText(`${formatGold(amount)} ${currency === 'rp' ? 'Shakes' : 'Bitcoin'}`, short);
    }
  }
  return row.setSize(width, iconSize);
}
