// Player-facing enemy descriptions shown on the How to Play enemy profiles. Names and stats live in config.js.
// Keep each to two short sentences so it fits its box.
export const ENEMY_DESCRIPTIONS = {
  grunt: 'A basic foot soldier. It walks to the nearest building and hits it. Weak alone, but they come in big groups.',
  slinger: 'Stays back and throws stones at buildings. It has to walk into Cannon and Gandolf Tower range to do it.',
  bomber: 'Flies over walls and drops bombs on what is below. Only defenses that can hit air can stop it.',
  tank: 'A slow, armored brute with lots of health and a hard hit. It soaks up shots while others slip by.',
  shark: 'A fast runner that jumps over walls. Other buildings still block it, so walls alone will not stop it.',
  balloon: 'A slow balloon that floats over walls and drops Neegies on your air defenses. Shoot it down and it drops two more where it lands.',
  neegy: 'A little paratrooper dropped by a Balloon. It hits air defenses twice as hard, so keep a ground defense nearby.',
  breaker: 'Rolls a bomb tire at your walls and blows up, breaking most walls in one blast. With no walls left it goes for your defenses.',
  babycar: 'A raid boss. It drives straight at your Village Hall and smashes through everything. When it is destroyed it bursts into troops, so keep defenses near your hall.',
  toilet: 'Tunnels under your walls to the nearest building, then pops up to attack. Only a F.L.O.C.K Tower can see it while it is underground.',
  pork: 'A sturdy brawler with a phone. When a F.L.O.C.K Tower spots him he stops to make a call, and every F.L.O.C.K Tower near him goes silent for a few seconds: no marks, no reveals.',
  skeleton: 'Bashes his shield when he reaches your base, and again every few seconds: he and every enemy around him rage, hitting harder and moving faster.',
  vaca: 'A tough flyer that throws boulders from range. Each boulder bounces on behind its target three times, hitting everything it lands on for a bit less each bounce.',
  yahu: 'Calls missiles down from long range. A red target shows where each one will land; when it hits, every building and wall in the blast is damaged.',
  patapim: 'A huge, slow tank. Every few seconds he stomps an earthquake that hits every building and wall around him, and walls take extra damage.',
  thief: 'A smug man in a sharp suit who strolls in unseen until he hops a wall or hits a building. He goes straight for your money: Mines and Storages take 3x damage.'
};

// The Enemies tab's categories (v0.6: too many enemies for one row of chips). Every enemy is in exactly one; the
// How to Play browser walks them in this order (arrow keys and the card's arrows go on into the next category).
export const ENEMY_CATEGORIES = [
  { key: 'ground', label: 'Ground', kinds: ['grunt', 'slinger', 'shark', 'thief', 'neegy'] },
  { key: 'air', label: 'Air', kinds: ['bomber', 'balloon', 'vaca'] },
  { key: 'tanks', label: 'Tanks & Bosses', kinds: ['tank', 'patapim', 'babycar'] },
  { key: 'special', label: 'Special', kinds: ['breaker', 'toilet', 'pork', 'skeleton', 'yahu'] }
];
export const ENEMY_ORDER = ENEMY_CATEGORIES.flatMap((c) => c.kinds);
