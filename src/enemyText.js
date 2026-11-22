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
  skeleton: 'Near your base he bashes his shield and three Skeletons climb out of the ground around him, then more every few seconds (up to six of his at once). Take him out early.',
  bones: 'A little sword-swinging Skeleton raised by a Rahhh Skeleton. Weak on its own, but they keep coming while he stands.',
  vaca: 'A tough flyer that throws boulders from range. Each boulder bounces on behind its target three times, hitting everything it lands on for a bit less each bounce.',
  yahu: 'Calls missiles down from long range. A red target shows where each one will land; each one hits only the building it’s aimed at.',
  patapim: 'A huge, slow jungle caller. As he walks in he drops a Chimpanzini Bananini every few seconds; they leap your walls and dive into your buildings.',
  lirili: 'A huge, slow tank. Every few seconds it stomps an earthquake that hits every building and wall around it, and walls take extra damage.',
  chimp: 'Dropped by Brr Brr Patapim. It runs at the nearest building (never walls), leaps any wall in the way, and dives into it for one big hit.',
  bicus: 'An armored legionary. Its armor (the steel bar over its health) cuts all damage by 30% and soaks every hit until it breaks; only then does it take full, real damage.',
  frigo: 'A fridge on legs with a freezing aura: every defense and the Brisket King near it attacks a lot slower. Pick it off from range.',
  bombo: 'A jet-powered goose that breathes fire. It burns one building at a time, and the flames also scorch the buildings right next to it.',
  thief: 'A smug man in a sharp suit who strolls in unseen until he hops a wall or hits a building. He goes straight for your money: Mines and Storages take 3x damage.'
};

// The Enemies tab's categories (v0.6: too many enemies for one row of chips; v0.7 added Summoned). Every enemy is in exactly one; the
// How to Play browser walks them in this order (arrow keys and the card's arrows go on into the next category).
export const ENEMY_CATEGORIES = [
  { key: 'ground', label: 'Ground', kinds: ['grunt', 'slinger', 'shark', 'thief', 'bicus', 'frigo'] },
  { key: 'air', label: 'Air', kinds: ['bomber', 'balloon', 'vaca', 'bombo'] },
  { key: 'tanks', label: 'Tanks & Bosses', kinds: ['tank', 'lirili', 'patapim', 'babycar'] },
  { key: 'special', label: 'Special', kinds: ['breaker', 'toilet', 'pork', 'skeleton', 'yahu'] },
  // v0.7: the troops other enemies bring with them (never in a wave's queue).
  { key: 'summoned', label: 'Summoned', kinds: ['neegy', 'bones', 'chimp'] }
];
export const ENEMY_ORDER = ENEMY_CATEGORIES.flatMap((c) => c.kinds);
