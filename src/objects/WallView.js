// Draws one wall (a single tile).
// Wall art is one pillar per level (bld_wall_lv1..10: wooden post, banded post, stone block, riveted block,
// gold-trimmed block, dark stone tower (v0.11), skull fortress block, lava block, lava tower, red skull fortress
// (v0.11)), all cropped to one shared box so every
// level keeps the same scale and baseline.
// Walls are drawn as one connected wall: every wall tile has a pillar standing on its center, and wherever
// two walls are side by side (in any direction: lines, corners, T-junctions, walls running alongside each
// other) connecting pillars stand evenly between them (more for thin wooden posts, fewer for thick stone;
// wallLinksFor), so neighboring pillars always overlap into a continuous wall.
// Each wall draws its own pillar and the connectors leading forward (down-screen) from it, so every
// connector is drawn once and everything is layered back to front.
// A destroyed wall shows a rubble pile on its tile: broken wooden posts for level 1, broken stone for 2-5,
// skull rubble for 6 and lava rubble for 7-8 (WALL_RUBBLE, in BuildingView.js). Without wall art it's one placeholder sprite per tile.
// Ground enemies still layer correctly against it: depth.js treats each wall's tile as a building.
// Same interface as BuildingView (sync, flash, pop, setAlpha, topCenter, hitTest, destroy, sprite).
import { gridToScreen } from '../logic/iso.js';
import { maxHp } from '../logic/buildings.js';
import { buildingTiles, fpW, fpH } from '../logic/grid.js';
import { MAP } from '../mapTiles.js';
import { WALL_ART_META } from '../wallArtMeta.js';
import { HealthBar, HP_TEAM } from './HealthBar.js';
import { buildingTextureKey, spriteHit, startPop, footprintRipple, WALL_RUBBLE } from './BuildingView.js';

export { WALL_RUBBLE };

const FLASH_MIN_GAP_MS = 400;
// On-screen width of the shared pillar box (the widest pillar, the stone blocks), as a share of a tile's
// width. Walls start small and grow with each level (each level is a new picture), in equal steps from min
// (Level 1, a thin post) to max (the top level, a big tower), so a wall's level reads at a glance. About the same
// average size as the earlier 0.396-0.54 range (10% under the original 0.44-0.6), spread wider. Pillars stand
// half a tile apart along a wall, and wallLinksFor adds connectors so even the smallest form a solid wall.
// v0.11 (10 levels): one width per level, so every picture keeps the width it had at 8 levels (0.30 ... 0.58 in 0.04
// steps; the skull and lava walls moved up a level with their widths), the new Level 6 sits between its neighbors (0.48)
// and the new Level 10 tops them (0.62).
export const PILLAR_WIDTHS = [0.3, 0.34, 0.38, 0.42, 0.46, 0.48, 0.5, 0.54, 0.58, 0.62];
export const PILLAR_WIDTH = { min: PILLAR_WIDTHS[0], max: PILLAR_WIDTHS[PILLAR_WIDTHS.length - 1], maxLevel: PILLAR_WIDTHS.length };

/** Pillar box width (share of a tile) for a wall level. */
export function wallPillarWidth(level) {
  return PILLAR_WIDTHS[Math.max(1, Math.min(PILLAR_WIDTHS.length, Math.round(level) || 1)) - 1];
}

/** Stand a wall pillar sprite (of a wall at `level`) on grid point (x, y): a tile center, or halfway between two. */
export function placeWallPillar(sprite, x, y, depth, level = 1) {
  const m = WALL_ART_META[sprite.texture.key];
  const p = gridToScreen(x, y);
  const w = MAP.tileWidth * wallPillarWidth(level);
  sprite.setDisplaySize(w, (w * sprite.frame.height) / sprite.frame.width);
  if (m) {
    // The pillar's base is about as deep as half its width: its center sits a quarter-width above the
    // lowest point (the base's front corner).
    const visW = m.visX1 - m.visX0;
    sprite.setOrigin((m.visX0 + m.visX1) / 2 / m.width, (m.bottom - visW / 4) / m.height);
  } else {
    sprite.setOrigin(0.5, 0.85);
  }
  sprite.setPosition(p.x, p.y);
  sprite.setDepth(depth);
}

const RUBBLE_WIDTH = 0.92; // share of a tile's width

/** The rubble picture for a destroyed wall of this level, or null if that art isn't loaded. */
export function wallRubbleKey(scene, level) {
  const entry = WALL_RUBBLE.find((r) => level <= r.maxLevel) || WALL_RUBBLE[WALL_RUBBLE.length - 1];
  const placeholders = scene.registry.get('placeholderKeys');
  return scene.textures.exists(entry.key) && !(placeholders && placeholders.has(entry.key)) ? entry.key : null;
}

/** Lay a rubble pile flat on tile (col, row), centered on it, under anything walking over it. */
export function placeWallRubble(sprite, col, row) {
  const p = gridToScreen(col + 0.5, row + 0.5);
  const w = MAP.tileWidth * RUBBLE_WIDTH;
  sprite.setOrigin(0.5, 0.6);
  sprite.setDisplaySize(w, (w * sprite.frame.height) / sprite.frame.width);
  sprite.setPosition(p.x, p.y);
  sprite.setDepth(col + row + 1); // a tile center's depth: enemies standing on it or past it draw on top
}

const tileKey = (c, r) => `${c},${r}`;

/** Every standing wall tile: Map "col,row" -> wall. */
export function wallTiles(buildings) {
  const map = new Map();
  for (const o of buildings) {
    if (o.type !== 'wall' || o.destroyed) continue;
    for (const t of buildingTiles(o)) map.set(tileKey(t.col, t.row), o);
  }
  return map;
}

/** Are wall tiles (c, r) and (c + dc, r + dr) joined? Every two standing walls side by side are (not diagonally). */
export function wallsJoined(tiles, c, r, dc, dr) {
  if ((dc === 0) === (dr === 0)) return false;
  return tiles.has(tileKey(c, r)) && tiles.has(tileKey(c + dc, r + dr));
}

/**
 * What one wall draws: a pillar on each of its tiles, and `links` connecting pillars evenly spaced toward
 * each joined neighbor forward of it (+col or +row), so each connection is drawn once.
 */
export function wallParts(tiles, b, links = 1) {
  const parts = [];
  for (const t of buildingTiles(b)) {
    const { col: c, row: r } = t;
    parts.push({ kind: 'pillar', x: c + 0.5, y: r + 0.5, depth: c + r + 2 });
    for (const [dc, dr, axis] of [[1, 0, 'x'], [0, 1, 'y']]) {
      if (!wallsJoined(tiles, c, r, dc, dr)) continue;
      for (let k = 1; k <= links; k++) {
        const f = k / (links + 1);
        parts.push({ kind: 'link', axis, x: c + 0.5 + dc * f, y: r + 0.5 + dr * f, depth: c + r + 2 + f });
      }
    }
  }
  return parts;
}

// Screen distance between the centers of two side-by-side tiles (half a tile across, a quarter down).
const TILE_STEP_PX = Math.hypot(MAP.tileWidth / 2, MAP.tileHeight / 2);
// Pillars may stand at most this share of a pillar's visible width apart, so neighbors always overlap
// (posts taper and bulge, so their solid middle is narrower than their widest point).
const MAX_GAP_SHARE = 0.65;

/** How many connecting pillars go between two touching walls of this picture and level, so no gaps show. */
export function wallLinksFor(key, level) {
  const m = WALL_ART_META[key];
  if (!m) return 1;
  const visW = MAP.tileWidth * wallPillarWidth(level) * ((m.visX1 - m.visX0) / m.width);
  return Math.max(1, Math.ceil(TILE_STEP_PX / (MAX_GAP_SHARE * visW)) - 1);
}

/** Stand one wall (at `level`) on tile (col, row): its pillar (real art) or a placeholder block filling the tile. */
export function placeWallTile(sprite, col, row, level = 1) {
  if (WALL_ART_META[sprite.texture.key]) { placeWallPillar(sprite, col + 0.5, row + 0.5, col + row + 2, level); return; }
  const front = gridToScreen(col + 1, row + 1);
  const w = MAP.tileWidth;
  sprite.setOrigin(0.5, 1);
  sprite.setDisplaySize(w, (w * sprite.frame.height) / sprite.frame.width);
  sprite.setPosition(front.x, front.y);
  sprite.setDepth(col + row + 2);
}

export class WallView {
  constructor(scene, b) {
    this.scene = scene;
    this.id = b.id;
    this.tiles = [];
    this.hpBar = new HealthBar(scene, { width: 40, height: 10, depth: 5000, color: HP_TEAM.player, badge: true });
    this.bx = 1; // click bounce multipliers
    this.by = 1;
    this.popTween = null;
    this.flashUntil = 0;
    this.sync(b, 0);
  }

  /** The wall's own pillar stands in for "the sprite" (depth sorting, tutorial anchors). */
  get sprite() {
    return this.tiles[0];
  }

  /** Make exactly n sprites (reusing what's there). */
  ensureSprites(n, key) {
    while (this.tiles.length < n) this.tiles.push(this.scene.add.image(0, 0, key));
    while (this.tiles.length > n) this.tiles.pop().destroy();
  }

  sync(b, time) {
    this.b = b;
    const key = buildingTextureKey(this.scene, 'wall', b.level, b.destroyed);
    this.pillars = !b.destroyed && !!WALL_ART_META[key];
    if (this.flashUntil && time > this.flashUntil) this.flashUntil = 0;
    if (this.pillars) {
      // Its pillar plus the connectors to the walls it touches.
      // Joined to its neighbors as the map shows them (the draft layout while editing).
      const parts = wallParts(wallTiles(this.scene.layoutList || (this.scene.gs ? this.scene.gs.buildings : [b])), b, wallLinksFor(key, b.level));
      this.ensureSprites(parts.length, key);
      parts.forEach((part, i) => {
        const s = this.tiles[i];
        if (s.texture.key !== key) s.setTexture(key);
        placeWallPillar(s, part.x, part.y, part.depth, b.level);
        if (this.bx !== 1 || this.by !== 1) s.setScale(s.scaleX * this.bx, s.scaleY * this.by);
        if (!this.flashUntil) s.setTint(this.scene.ambientTint ?? 0xffffff);
      });
    } else {
      const rubble = b.destroyed ? wallRubbleKey(this.scene, b.level) : null;
      const shown = rubble || key;
      const cells = buildingTiles(b);
      this.ensureSprites(cells.length, shown);
      cells.forEach((t, i) => {
        const s = this.tiles[i];
        if (s.texture.key !== shown) s.setTexture(shown);
        if (rubble) placeWallRubble(s, t.col, t.row);
        else placeWallTile(s, t.col, t.row, b.level);
        if (this.bx !== 1 || this.by !== 1) s.setScale(s.scaleX * this.bx, s.scaleY * this.by);
        if (!this.flashUntil) s.setTint(this.scene.ambientTint ?? 0xffffff);
      });
    }
    const max = maxHp(b);
    const top = this.topCenter();
    this.hpBar.draw(top.x, top.y - 12, b.hp / max, !b.destroyed && b.hp < max, b.level);
  }

  flash(time, ms = 80) {
    if (time - (this.lastFlash || -Infinity) < FLASH_MIN_GAP_MS) return;
    this.lastFlash = time;
    for (const s of this.tiles) s.setTintFill(0xffffff);
    this.flashUntil = time + ms;
  }

  /** Upgraded: the same click bounce as buildings (its new size and picture come with the next sync). */
  growPop() {
    this.pop();
  }

  pop() {
    startPop(this.scene, this);
    const b = this.b;
    if (b) footprintRipple(this.scene, b.col, b.row, fpW(b), fpH(b));
  }

  setAlpha(a) {
    for (const s of this.tiles) s.setAlpha(a);
    this.hpBar.setAlpha(a);
  }

  /** Above the wall, in world pixels. */
  topCenter() {
    const b = this.b;
    const c = gridToScreen(b.col + fpW(b) / 2, b.row + fpH(b) / 2);
    const s = this.sprite;
    if (this.pillars && s) return { x: c.x, y: s.y - s.originY * s.displayHeight };
    return { x: c.x, y: c.y - (s ? s.displayHeight - MAP.tileHeight / 2 : 30) };
  }

  hitTest(wx, wy) {
    return this.tiles.some((s) => spriteHit(this.scene, s, wx, wy));
  }

  destroy() {
    if (this.popTween) this.popTween.stop();
    for (const s of this.tiles) s.destroy();
    this.hpBar.destroy();
  }
}
