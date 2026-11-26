import { TEX } from '../assetKeys.js';
import { fitIcon } from './uiDraw.js';
import { formatGold } from '../logic/economy.js';

/** A left-aligned row whose width callers can use for positioning and centering. */
export function currencyCost(scene, costs, style, title = '', iconSize = 21) {
  const row = scene.add.container();
  let width = 0;
  const addText = (value) => {
    const label = scene.add.text(width, 0, value, style).setOrigin(0, 0.5);
    row.add(label);
    width += label.width;
  };
  if (title) {
    addText(title);
    width += 9;
  }
  for (const [index, { currency, amount }] of costs.entries()) {
    if (index) width += 14;
    const key = currency === 'rp' ? TEX.researchPoint : TEX.coin;
    if (scene.textures.exists(key)) {
      row.add(fitIcon(scene.add.image(width + iconSize / 2, 0, key), iconSize));
      width += iconSize + 4;
      addText(formatGold(amount));
    } else {
      addText(`${formatGold(amount)} ${currency === 'rp' ? 'Shakes' : 'gold'}`);
    }
  }
  return row.setSize(width, iconSize);
}
