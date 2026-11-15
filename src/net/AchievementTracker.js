// Watches a game in progress for the account: counts what achievements measure (kills, traps sprung, gold
// mined, ...), records the furthest wave and best Village Hall, and awards achievements as their goals are
// met. Each new one is announced with a GameState 'achievementEarned' event ({ id }) for the HUD, and a
// new leaderboard league with 'leaguePromoted' ({ key, wave }).
import { CONFIG } from '../config.js';
import { newlyEarned, progressValues } from '../logic/achievements.js';
import { promotion } from '../logic/leagues.js';

export class AchievementTracker {
  /** @param {import('../state/GameState.js').GameState} gs @param {import('./session.js').Session} session */
  constructor(gs, session) {
    this.gs = gs;
    this.session = session;
    this.lostTonight = 0; // buildings (not walls) destroyed during the current wave
    const on = (name, fn) => gs.on(name, fn, this);
    const bump = (counter, n = 1) => { session.bump(counter, n); this.check(); };

    on('enemyKilled', (d) => {
      bump('kills');
      if (d.kind === 'bomber') bump('bomberKills');
      if (d.kind === 'balloon') bump('balloonKills');
    });
    on('trapSprung', () => bump('traps'));
    on('beamHeatUp', (d) => {
      const stages = CONFIG.defenses.ra ? CONFIG.defenses.ra.stages.length : 0;
      if (d.stage === stages - 1) bump('rahMax');
    });
    on('waveQuickStarted', () => bump('early')); // Start Wave within rules.quickStartSeconds of the last clear
    on('mineCollected', (d) => bump('mined', d.amount || 0));
    on('gnomeDelivered', (d) => bump('mined', d.added || 0));
    on('waveStarted', () => { this.lostTonight = 0; });
    on('buildingDestroyed', (d) => { if (d.type !== 'wall') this.lostTonight++; });
    on('waveCleared', (d) => {
      const before = session.stats.bestWave;
      session.recordWave(d.number);
      const league = promotion(before, session.stats.bestWave);
      if (league) gs.emit('leaguePromoted', { key: league.key, wave: session.stats.bestWave });
      if (this.lostTonight === 0) session.bump('perfect');
      if (d.stars) session.bump('stars', d.stars); // wave stars, for Star Collector
      this.lostTonight = 0;
      this.check();
    });
    on('townHallUpgraded', (d) => { session.recordTownHall(d.level); this.check(); });
    for (const name of ['buildingPlaced', 'buildingUpgraded', 'baseReset']) on(name, () => this.check());

    // A village opened for the first time on this account (e.g. imported) counts what it already has:
    // its Village Hall and the waves it has already survived (a new league is announced).
    session.recordTownHall(gs.townHallLevel);
    const before = session.stats.bestWave;
    session.recordWave(gs.wavesCleared || 0);
    const league = promotion(before, session.stats.bestWave);
    if (league) gs.emit('leaguePromoted', { key: league.key, wave: session.stats.bestWave });
    this.check();
  }

  /** Award every achievement whose goal is now met. */
  check() {
    const ids = newlyEarned(progressValues(this.session.stats, this.gs), this.session.earnedIds());
    if (!ids.length) return;
    this.session.earn(ids);
    for (const id of ids) this.gs.emit('achievementEarned', { id });
  }

  destroy() {
    this.gs.offContext(this);
  }
}
