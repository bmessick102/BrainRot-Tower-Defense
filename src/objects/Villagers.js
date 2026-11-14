// Gnome villagers on screen. What each gnome is doing is a game rule (src/logic/villagers.js: they
// work mines by day and repair buildings during attacks); this file only acts it out. Enemies ignore
// gnomes.
//   - Each gnome lives in a Villager House and comes out of / goes into its door; the Village Hall is only
//     a shelter while its house is destroyed.
//   - Workers walk to a spot beside their mine (or the building they're repairing) and work there.
//   - Gnomes without a job wander, spreading out across the village: each favors its own direction from
//     the hall (evenly spaced, reshuffled every morning) and picks spots away from the others.
//   - When a wave starts everyone goes home; during an attack, repairers rush out and back.
//   - A gnome whose house is destroyed runs to the Village Hall and hides there until it's rebuilt.
import { CONFIG } from '../config.js';
import { gridToScreen } from '../logic/iso.js';
import { isGrass, footprintCenter, fpW, fpH } from '../logic/grid.js';
import { getTownHall } from '../logic/buildings.js';
import { villagersShouldBeOut, assignGnomes, isUnderFire } from '../logic/villagers.js';
import { MAP } from '../mapTiles.js';
import { TEX } from '../assetKeys.js';
import { groundDepth } from './depth.js';
import { floatText } from './Effects.js';

export { villagersShouldBeOut };

export const VILLAGER_SETTINGS = {
  walkSpeed: CONFIG.villagers.walkSpeed, // tiles per second: wandering, walking to work, carrying gold
  hurrySpeed: 1.5,      // rushing to a repair, home, or to shelter
  wanderRadius: 11,     // tiles from the Village Hall's center (most of the village)
  minWander: 2.5,       // ... and at least this far out, so nobody loiters at the hall
  sectorHalfWidth: 0.8, // radians either side of a gnome's own direction it wanders within
  heightPx: 38,         // on-screen height
  exitDelay: [0.2, 2],  // seconds a gnome waits inside before coming out (so they trickle out)
  personalSpace: 1.2,   // wandering gnomes ease apart when closer than this (tiles)
  repairSparkEvery: 0.9 // seconds between the green "+" over a repairing gnome
};

const S_HEIGHT = VILLAGER_SETTINGS.heightPx;

/** Gnome i of n faces its own direction from the hall: evenly spaced around it, rotated by `offset`. */
export function gnomeHeading(i, n, offset = 0) {
  return offset + (i / Math.max(1, n)) * Math.PI * 2;
}

/**
 * A wander spot for a gnome: in its own slice of the village (around `heading` from `center`),
 * between minWander and wanderRadius out (spread evenly over the area), as far as possible from
 * `others` (where the other gnomes are and are headed). `canStand(x, y)` filters out buildings.
 */
export function pickWanderSpot(center, heading, others, canStand, rng = Math.random, S = VILLAGER_SETTINGS) {
  let best = null, bestScore = -1;
  for (let tries = 0; tries < 30; tries++) {
    // After a few misses (walls of buildings, map edge), widen to anywhere around the hall.
    const wide = tries >= 20;
    const a = wide ? rng() * Math.PI * 2 : heading + (rng() * 2 - 1) * S.sectorHalfWidth;
    const r = Math.sqrt(S.minWander ** 2 + rng() * (S.wanderRadius ** 2 - S.minWander ** 2));
    const x = center.x + Math.cos(a) * r, y = center.y + Math.sin(a) * r;
    if (!canStand(x, y)) continue;
    const score = others.length ? Math.min(...others.map((o) => Math.hypot(o.x - x, o.y - y))) : 99;
    if (score > bestScore) { best = { x, y }; bestScore = score; }
    if (tries >= 8 && bestScore > 4) break;
  }
  return best;
}

/** Just outside a building's front-right face, where the Village Hall's (and a house's) door is drawn. */
function doorPoint(b) {
  return { x: b.col + fpW(b) + 0.35, y: b.row + fpH(b) * 0.55 };
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Walkable grid values: gnomes stand on OPEN tiles and hop over WALL tiles (never stopping on one).
export const TILE_BLOCKED = 0, TILE_OPEN = 1, TILE_WALL = 2;
// Hopping a wall tile costs as much as walking this many tiles, so a gnome only jumps a wall when
// going around would be clearly longer (and never walks along the top of one).
const WALL_HOP_COST = 3;
const GNOME_HOP_PX = 22; // how high a gnome rises while it's over a wall

/** Which tiles a gnome can stand on (grass, no standing building) or hop over (a standing wall). */
export function walkableGrid(buildings) {
  const ok = new Uint8Array(MAP.cols * MAP.rows);
  for (let r = 0; r < MAP.rows; r++) for (let c = 0; c < MAP.cols; c++) ok[r * MAP.cols + c] = isGrass(c, r) ? TILE_OPEN : TILE_BLOCKED;
  for (const b of buildings) {
    if (b.destroyed) continue;
    const v = b.type === 'wall' ? TILE_WALL : TILE_BLOCKED;
    for (let r = b.row; r < b.row + fpH(b); r++) for (let c = b.col; c < b.col + fpW(b); c++) {
      if (c >= 0 && r >= 0 && c < MAP.cols && r < MAP.rows && ok[r * MAP.cols + c]) ok[r * MAP.cols + c] = v;
    }
  }
  return ok;
}

/**
 * Cheapest tile path (8 directions, no cutting building corners) from (sx, sy) to (tx, ty), as
 * tile-center waypoints ending exactly on the target. Wall tiles can be crossed at WALL_HOP_COST.
 * Null if there's no way, or the target isn't a tile a gnome can stand on.
 */
export function findPath(ok, sx, sy, tx, ty) {
  const C = MAP.cols, R = MAP.rows;
  const s = [Math.floor(sx), Math.floor(sy)], t = [Math.floor(tx), Math.floor(ty)];
  const inGrid = (c, r) => c >= 0 && r >= 0 && c < C && r < R;
  if (!inGrid(...s) || !inGrid(...t) || ok[t[1] * C + t[0]] !== TILE_OPEN) return null;
  const from = new Int32Array(C * R).fill(-1);
  const cost = new Int32Array(C * R).fill(0x7fffffff);
  const start = s[1] * C + s[0], goal = t[1] * C + t[0];
  from[start] = start;
  cost[start] = 0;
  // Dijkstra with a bucket queue (step costs are small whole numbers).
  const buckets = [[start]];
  for (let d = 0; d < buckets.length && cost[goal] > d; d++) {
    const bucket = buckets[d];
    if (!bucket) continue;
    for (const cur of bucket) {
      if (cost[cur] !== d) continue; // a cheaper way here was already handled
      const cc = cur % C, cr = (cur / C) | 0;
      for (const [dx, dy] of DIRS) {
        const nc = cc + dx, nr = cr + dy;
        if (!inGrid(nc, nr)) continue;
        const n = nr * C + nc;
        if (!ok[n]) continue;
        if (dx && dy && (!ok[cr * C + nc] || !ok[nr * C + cc])) continue; // don't cut building corners
        const nd = d + (ok[n] === TILE_WALL ? WALL_HOP_COST : 1);
        if (nd >= cost[n]) continue;
        cost[n] = nd;
        from[n] = cur;
        (buckets[nd] ||= []).push(n);
      }
    }
  }
  if (from[goal] === -1) return null;
  const path = [];
  for (let n = goal; n !== start; n = from[n]) path.push({ x: (n % C) + 0.5, y: ((n / C) | 0) + 0.5 });
  path.reverse();
  if (path.length) path[path.length - 1] = { x: tx, y: ty };
  else path.push({ x: tx, y: ty });
  return path;
}

const OUTSIDE_TASKS = new Set(['wander', 'mine', 'repair']);
const STANDBY_BACK = 1.5; // tiles further out a repairer waits while its building is under fire
const CARRY_COIN_PX = 16;  // size of the coin a gnome carries to storage
const rand = (a, b) => a + Math.random() * (b - a);

export class Villagers {
  constructor(scene, gs) {
    this.scene = scene;
    this.gs = gs;
    this.gnomes = new Map(); // gnome id -> sprite + movement state
    this.gridSig = '';
    this.grid = null;
    this.headingOffset = Math.random() * Math.PI * 2; // reshuffled each morning
    this.wasOut = true;
  }

  /** A new gnome starts inside `home` and trickles out. */
  makeGnome(id, home) {
    const sprite = this.scene.add.image(0, 0, TEX.villager).setOrigin(0.5, 1).setVisible(false);
    sprite.setScale(VILLAGER_SETTINGS.heightPx / sprite.frame.height);
    // The gold a gnome is carrying to storage: a coin bobbing over its head.
    const coin = this.scene.add.image(0, 0, TEX.coin).setVisible(false);
    coin.setScale(CARRY_COIN_PX / coin.frame.width);
    return {
      id, sprite, coin, carrying: false, state: 'inside', inside: home ? home.id : null, enterId: null,
      x: 0, y: 0, tx: 0, ty: 0, path: [], wait: rand(...VILLAGER_SETTINGS.exitDelay),
      phase: Math.random() * Math.PI * 2, baseScale: sprite.scaleX, anim: 0, hop: 0,
      job: null, spot: null, faceX: null, sparkT: Math.random()
    };
  }

  /** Walkable tiles, rebuilt only when buildings change. */
  walkable() {
    const sig = this.gs.buildings.map((b) => `${b.col},${b.row},${fpW(b)},${fpH(b)},${b.destroyed ? 1 : 0}`).join('|');
    if (sig !== this.gridSig) { this.gridSig = sig; this.grid = walkableGrid(this.gs.buildings); }
    return this.grid;
  }

  /** The walkable-grid value under (x, y): TILE_BLOCKED, TILE_OPEN or TILE_WALL. */
  tileAt(x, y) {
    const c = Math.floor(x), r = Math.floor(y);
    if (c < 0 || r < 0 || c >= MAP.cols || r >= MAP.rows) return TILE_BLOCKED;
    return this.walkable()[r * MAP.cols + c];
  }

  /** A gnome can stop here (not on a wall: it only hops over those). */
  canStand(x, y) {
    return this.tileAt(x, y) === TILE_OPEN;
  }

  /** A gnome can move through here (open ground or a wall to hop). */
  canPass(x, y) {
    return this.tileAt(x, y) !== TILE_BLOCKED;
  }

  /** A free grass spot in this gnome's part of the village, away from where the others are and are headed. */
  pickTarget(th, me, heading) {
    const others = [];
    for (const g of this.gnomes.values()) {
      if (g === me || g.state === 'inside') continue;
      others.push(g);
      if (g.path.length) others.push(g.path[g.path.length - 1]);
    }
    return pickWanderSpot(footprintCenter(th), heading, others, (x, y) => this.canStand(x, y));
  }

  /**
   * Where gnome `slot` stands to work on building b: beside one of its two front faces (slot 0 the
   * front-left, slot 1 the front-right), or the nearest open tile to that if something's in the way.
   */
  workSpot(b, slot, back = 0) {
    // `back`: tiles further out (gnomes wait there while the building is under fire).
    const want = slot % 2 === 0
      ? { x: b.col + fpW(b) * 0.5, y: b.row + fpH(b) + 0.45 + back }
      : { x: b.col + fpW(b) + 0.45 + back, y: b.row + fpH(b) * 0.2 };
    if (this.canStand(want.x, want.y)) return want;
    let best = null, bestD = Infinity;
    for (let r = Math.floor(want.y) - 3; r <= Math.floor(want.y) + 3; r++) {
      for (let c = Math.floor(want.x) - 3; c <= Math.floor(want.x) + 3; c++) {
        const p = { x: c + 0.5, y: r + 0.5 };
        if (!this.canStand(p.x, p.y)) continue;
        const d = Math.hypot(p.x - want.x, p.y - want.y);
        if (d < bestD) { best = p; bestD = d; }
      }
    }
    return best;
  }

  /** Plan a route to (tx, ty). Returns false if there's no way there. */
  route(g, tx, ty) {
    const path = findPath(this.walkable(), g.x, g.y, tx, ty);
    if (!path) return false;
    g.path = path;
    g.tx = tx; g.ty = ty;
    return true;
  }

  /** Route there, or (boxed in) just head straight for it. */
  goTo(g, x, y) {
    if (!this.route(g, x, y)) { g.path = [{ x, y }]; g.tx = x; g.ty = y; }
  }

  /** Follow the planned path; returns true on arrival. Re-plans if a building appears on the way. */
  follow(g, speed, dt) {
    let step = speed * dt;
    while (step > 0 && g.path.length) {
      const wp = g.path[0];
      const last = g.path.length === 1;
      if (!last && !this.canPass(wp.x, wp.y)) { if (!this.route(g, g.tx, g.ty)) { g.path = []; return true; } continue; }
      const d = Math.hypot(wp.x - g.x, wp.y - g.y);
      if (d <= step) { g.x = wp.x; g.y = wp.y; g.path.shift(); step -= d; }
      else { g.x += ((wp.x - g.x) / d) * step; g.y += ((wp.y - g.y) / d) * step; step = 0; }
    }
    return g.path.length === 0;
  }

  /** Wandering gnomes near each other ease apart (never onto a building). Workers hold their spot. */
  spreadOut(dt) {
    const S = VILLAGER_SETTINGS;
    const active = [...this.gnomes.values()].filter((g) => g.job === 'wander' && (g.state === 'idle' || g.state === 'walking'));
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i], b = active[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= S.personalSpace) continue;
        if (d < 1e-4) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
        const len = Math.hypot(dx, dy) || 1;
        const push = Math.min(0.6 * dt, (S.personalSpace - d) / 2);
        const px = (dx / len) * push, py = (dy / len) * push;
        if (this.canStand(a.x - px, a.y - py)) { a.x -= px; a.y -= py; }
        if (this.canStand(b.x + px, b.y + py)) { b.x += px; b.y += py; }
      }
    }
  }

  update(dt, time) {
    const gs = this.gs;
    const th = getTownHall(gs);
    if (!th) return;
    const jobs = gs._gnomes || assignGnomes(gs);
    const byId = new Map(gs.buildings.map((b) => [b.id, b]));
    const out = villagersShouldBeOut(gs) && !th.destroyed;
    if (out && !this.wasOut) this.headingOffset = Math.random() * Math.PI * 2; // a new morning: new favorite spots
    this.wasOut = out;

    // Gnomes whose house was sold (or that no longer exist) vanish.
    for (const [id, g] of this.gnomes) if (!jobs.has(id)) { g.sprite.destroy(); g.coin.destroy(); this.gnomes.delete(id); }
    const wanderers = [...jobs.values()].filter((a) => a.task === 'wander');
    for (const a of jobs.values()) {
      let g = this.gnomes.get(a.id);
      const home = byId.get(a.homeId);
      if (!g) { g = this.makeGnome(a.id, byId.get(a.shelterId) || (home && !home.destroyed ? home : th)); this.gnomes.set(a.id, g); }
      const heading = gnomeHeading(wanderers.indexOf(a), wanderers.length, this.headingOffset);
      this.step(g, a, byId, th, dt, time, heading);
    }
    this.spreadOut(dt);
    this.draw(time);
  }

  /** Move one gnome toward what its job asks for. */
  step(g, a, byId, th, dt, time, heading) {
    const S = VILLAGER_SETTINGS;
    const shelter = byId.get(a.shelterId) || th; // where it sleeps right now (see gnomeShelters)
    const wantsOut = OUTSIDE_TASKS.has(a.task);
    switch (g.state) {
      case 'inside': {
        // Come out to work, or to move house (sheltering in the hall, then its own house is rebuilt).
        if (!wantsOut && g.inside === shelter.id) return;
        g.wait -= dt;
        if (g.wait > 0) return;
        let from = byId.get(g.inside);
        if (!from || from.destroyed) from = th;
        const door = doorPoint(from);
        g.x = door.x + Math.random() * 0.3; g.y = door.y + (Math.random() - 0.5) * 0.6;
        g.state = 'exiting'; g.anim = 0; g.job = null; g.path = [];
        return;
      }
      case 'exiting':
        g.anim = Math.min(1, g.anim + dt * 3);
        if (g.anim >= 1) { g.state = 'idle'; g.wait = 0.2; }
        return;
      case 'entering':
        g.anim = Math.max(0, g.anim - dt * 3);
        if (g.anim <= 0) { g.state = 'inside'; g.inside = g.enterId; g.wait = rand(...S.exitDelay); }
        return;
    }

    // Outside.
    if (!wantsOut) {
      const door = doorPoint(shelter);
      const end = g.path.length ? g.path[g.path.length - 1] : null;
      if (g.state !== 'returning' || g.enterId !== shelter.id || !end || Math.hypot(end.x - door.x, end.y - door.y) > 0.5) {
        g.state = 'returning'; g.enterId = shelter.id; g.job = 'home';
        this.goTo(g, door.x, door.y);
      }
      if (this.follow(g, S.hurrySpeed, dt)) g.state = 'entering';
      return;
    }

    if (a.task === 'wander') {
      if (g.job !== 'wander' || (g.state !== 'idle' && g.state !== 'walking')) { g.job = 'wander'; g.state = 'idle'; g.wait = rand(0.2, 1); g.path = []; }
      if (g.state === 'idle') {
        g.wait -= dt;
        if (g.wait <= 0) {
          const t = this.pickTarget(th, g, heading);
          if (t && this.route(g, t.x, t.y)) g.state = 'walking';
          else g.wait = 1;
        }
      } else if (this.follow(g, S.walkSpeed, dt)) { g.state = 'idle'; g.wait = rand(1, 3.5); }
      return;
    }

    // Working a mine (or carrying its gold to storage), or repairing a building.
    const trip = a.task === 'mine' && this.gs._gnomeWork ? this.gs._gnomeWork.get(a.id) : null;
    g.carrying = !!trip && trip.phase === 'carrying';
    const target = g.carrying ? byId.get(trip.dropId) : byId.get(a.targetId);
    if (!target) return;
    // Under fire: wait a step back until the shooting stops, then move in and repair.
    const waiting = a.task === 'repair' && isUnderFire(target);
    const spot = this.workSpot(target, a.slot, waiting ? STANDBY_BACK : 0);
    const job = `${a.task}:${target.id}:${a.slot}`;
    const moved = spot && g.spot && Math.hypot(spot.x - g.spot.x, spot.y - g.spot.y) > 0.3; // building moved
    if (g.job !== job || moved || (g.state !== 'walking' && g.state !== 'working')) {
      g.job = job; g.spot = spot; g.state = 'walking';
      if (spot) this.goTo(g, spot.x, spot.y); else g.path = [];
    }
    if (g.state === 'walking' && this.follow(g, a.task === 'repair' ? S.hurrySpeed : S.walkSpeed, dt)) {
      g.state = 'working';
      g.faceX = gridToScreen(footprintCenter(target).x, footprintCenter(target).y).x;
    }
    // A repairing gnome shows its work: a little green "+" now and then.
    if (g.state === 'working' && a.task === 'repair' && !waiting) {
      g.sparkT += dt;
      if (g.sparkT >= S.repairSparkEvery) {
        g.sparkT = 0;
        const p = gridToScreen(g.x, g.y);
        floatText(this.scene, p.x + rand(-6, 6), p.y - S.heightPx - 4, '+', '#7dff6b', 18);
      }
    }
  }

  /**
   * Draw: bob while walking, a quick busy hop while working (hammering when repairing), face the
   * walking direction (or the building being worked on), shrink in/out at doors, and layer correctly
   * in front of / behind buildings.
   */
  draw(time) {
    for (const g of this.gnomes.values()) {
      const s = g.sprite;
      // Hidden while the layout editor rearranges the village (they'd walk the old layout).
      if (g.state === 'inside' || this.scene.editMode) { s.setVisible(false); g.coin.setVisible(false); continue; }
      const moving = g.state === 'walking' || g.state === 'returning';
      const working = g.state === 'working';
      const p = gridToScreen(g.x, g.y);
      let bob = 0;
      if (moving) bob = -Math.abs(Math.sin(time * 0.014 + g.phase)) * 2.5;
      else if (working) bob = -Math.abs(Math.sin(time * 0.02 + g.phase)) * 3;
      // Over a wall: rise up and hop across it (eases up and back down, like the Wall Jumper).
      g.hop += ((this.tileAt(g.x, g.y) === TILE_WALL ? GNOME_HOP_PX : 0) - g.hop) * 0.3;
      bob -= g.hop;
      let depth = groundDepth(this.gs.buildings, g.x, g.y);
      // Mid-hop, draw over the wall it's jumping (its pillar and the links to its neighbors).
      if (g.hop > 4) depth = Math.max(depth, Math.floor(g.x) + Math.floor(g.y) + 3.01);
      s.setVisible(true).setPosition(p.x, p.y + bob).setDepth(depth);
      s.setScale(g.baseScale * g.anim).setAlpha(Math.min(1, g.anim * 1.5));
      s.setRotation(working && g.job && g.job.startsWith('repair') ? Math.sin(time * 0.025 + g.phase) * 0.15 : 0);
      if (moving && g.path.length) {
        const sx = gridToScreen(g.path[0].x, g.path[0].y).x;
        if (Math.abs(sx - p.x) > 1) s.setFlipX(sx < p.x);
      } else if (working && g.faceX !== null) {
        s.setFlipX(g.faceX < p.x);
      }
      s.setTint(this.scene.ambientTint ?? 0xffffff);
      g.coin.setVisible(g.carrying && g.anim > 0.5)
        .setPosition(p.x, p.y + bob - S_HEIGHT - 8 + Math.sin(time * 0.008 + g.phase) * 2)
        .setDepth(s.depth + 0.01).setTint(this.scene.ambientTint ?? 0xffffff);
    }
  }

  /** Gnomes currently outside (for tests/debug). */
  outsideCount() {
    return [...this.gnomes.values()].filter((g) => g.state !== 'inside').length;
  }
}
