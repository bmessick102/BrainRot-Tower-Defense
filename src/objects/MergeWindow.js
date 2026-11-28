// The "Merge into <name>?" window (the Merge button on a max-level mergeable defense, UIScene.onMerge), laid out like
// the Upgrade window (PurchasePreview.js): the merged defense on its tile, "Merges 2 x Level 10", its hit point and
// damage bars against one copy's, its ability, Range / Damage type / Targets, and the gold + Shake price. It opens even
// with no partner yet: then the red "Note!" band says another max-level copy is needed (src/logic/merge.js previewMerge).
// Confirming calls onConfirm (GameScene.beginMergePick: tap the second copy on the map, which pays for the merge).
import { Modal } from './Modal.js';
import { buildingPictureKey, isMergedStandIn, MERGE_GEAR } from './BuildingView.js';
import { abilityIcon } from './MergeIcons.js';
import { fillGradientRounded } from './uiDraw.js';
import { drawShowcase, drawStatBars, drawFacts, drawPurchaseFooter, PREVIEW_W, PREVIEW_H } from './PurchasePreview.js';
import { defenseKind } from './UpgradeWindow.js';
import { requestImages } from '../assetLoader.js';
import { SFX } from '../assetKeys.js';
import { playSfxCapped } from '../audio.js';
import { mergePreview, previewMerge } from '../logic/merge.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';

const round = (n) => Math.round(n).toLocaleString('en-US');
const tenth = (n) => Number(n.toFixed(1)).toLocaleString('en-US');

/** The damage bar: total damage per volley (a Triple Mortar's three shells, a Mothership's zaps), per second for a beam. */
function damageRow(a, merged) {
  const label = merged.perSecond ? 'Damage per second' : merged.shots > 1 ? `Damage (${merged.shots} at once)` : 'Damage';
  const value = a.damage * a.shots, next = merged.damage * merged.shots;
  return { label, icon: 'damage', value, next, max: next, fmt: round };
}

export function openMergeWindow(scene, gs, keepId, onConfirm) {
  const keep = gs.getBuilding(keepId);
  if (!keep || keep.merged) return null;
  const { name, config } = mergePreview(gs, keep);
  const m = new Modal(scene, { width: PREVIEW_W, height: PREVIEW_H, title: `Merge into ${name}?`,
    onClose: () => { scene.refreshGuide(); scene.refreshInfo(); } });

  const confirm = () => {
    const b = gs.getBuilding(keepId);
    if (b && previewMerge(gs, b).ok && onConfirm()) { m.close(); return; }
    playSfxCapped(scene, SFX.invalid, 1);
    draw();
  };

  const draw = () => {
    if (!m.frame) return;
    const b = gs.getBuilding(keepId);
    if (!b || b.merged) { m.close(); return; }
    m.clear();
    const g = m.add(scene.add.graphics());
    const result = { ...b, merged: true };
    const standIn = isMergedStandIn(scene, result);
    drawShowcase(scene, m, g, {
      name,
      picture: { key: buildingPictureKey(scene, result), tint: standIn ? 0xffe2a0 : null, badge: MERGE_GEAR },
      tag: { small: 'Merges', big: `2 × Level ${b.level}` }
    });
    const { a, merged } = mergePreview(gs, b);
    const bottom = drawStatBars(scene, m, g, [
      { label: 'Hit points', icon: 'hp', value: a.hp, next: merged.hp, max: merged.hp, fmt: round },
      damageRow(a, merged)
    ]);
    // The merged ability, in a gold-edged box under the bars.
    const ax = m.x + 370, ay = m.y + bottom + 6, aw = PREVIEW_W - 370 - 34, ah = 118;
    g.fillStyle(0xc99a2c, 1).fillRoundedRect(ax, ay, aw, ah, 14);
    fillGradientRounded(g, ax + 3, ay + 3, aw - 6, ah - 6, 12, 0xfff4d2, 0xf3e1b0);
    m.add(abilityIcon(scene, config.abilityIcon, ax + 56, ay + ah / 2, 76));
    m.add(scene.add.text(ax + 108, ay + 16, `Ability: ${config.ability}`, textStyle(20, COLORS.textGold)));
    m.add(scene.add.text(ax + 108, ay + 48, config.abilityShort, bodyStyle(17, COLORS.ink, { wordWrap: { width: aw - 124 }, lineSpacing: 2 })));
    const kind = defenseKind(b.type);
    drawFacts(scene, m, g, [
      { label: 'Range', value: `${tenth(merged.range)} tiles`, gain: merged.range > a.range ? `+${tenth(merged.range - a.range)}` : '' },
      { label: 'Damage type', value: kind.damage },
      { label: 'Targets', value: kind.targets }
    ], 410);
    const status = previewMerge(gs, b);
    drawPurchaseFooter(scene, m, g, { costs: status.costs, label: 'Merge', notes: status.notes, onConfirm: confirm, color: 0xe0a21a });
  };

  draw();
  if (isMergedStandIn(scene, { ...keep, merged: true }) && config.art) requestImages([config.art.key], { front: true }).then(() => draw());
  for (const event of ['goldChanged', 'researchPointsChanged', 'waveStarted', 'waveCleared', 'gameOver', 'buildingPlaced', 'buildingUpgraded',
    'buildingDestroyed', 'buildingRepaired', 'buildingsMerged', 'baseReset']) gs.on(event, draw, m);
  const destroy = m.destroy.bind(m);
  m.destroy = () => { gs.offContext(m); destroy(); };
  scene.refreshGuide();
  return m;
}
