// Tips shown under the loading bar (one at random, rotating if loading takes a while).
// Keep each one to a sentence or two, and keep them true to the rules in config.js.
export const LOADING_TIPS = [
  // Economy
  'Bitcoin Mines fill up on their own. Click a mine when its coin appears, or it stops producing once full.',
  'When your gold is at its limit, mines can\'t be collected. Build Bitcoin Storage to hold more.',
  'Enemies that hit your Bitcoin Storage steal a share of the gold inside. Keep it guarded!',
  'Selling a building refunds half of what it cost. You can\'t sell while a wave is attacking.',
  'Every enemy you defeat drops gold. Tougher enemies are worth more.',

  // Village Hall and building
  'Upgrading your Village Hall unlocks new buildings and more of each, but every night\'s attack grows with it.',
  'If your Village Hall falls, the night is lost. Build your defenses around it.',
  'Use Edit mode to move buildings around for free between waves.',
  'Press R while placing a wall to rotate it.',
  "Destroyed buildings stay in ruins after the night. Click one to rebuild it for 30% of its level's cost, even mid-wave.",
  'Villager Houses add gnome workers: they speed up your mines by day and patch up buildings during attacks.',

  // Defenses
  'The Cannon can\'t hit flyers. Pair it with Locklair Tower or Gandolf Tower to cover the skies.',
  'Litman Mortar splashes crowds from long range, but can\'t hit enemies standing right next to it.',
  'The Firework Launcher shreds flyers but can\'t touch ground troops. It\'s fragile, so keep it behind walls.',
  'Gandolf Tower\'s fireballs burst on impact and hit both ground and air enemies. Mind its short range.',
  'The Diddypult\'s baby oil leaves a slick pool that hurts and slows ground troops who stand in it.',
  'Click a building and open its Stats tab to see exactly what the next upgrade adds.',

  // Walls and enemies
  'Ground enemies walk around walls when the detour is shorter, and smash through when it isn\'t.',
  'Tralalero Tralala leaps right over walls, so don\'t count on walls alone to stop it.',
  'Bombadillo Crocadillo flies over everything. Only defenses that hit air can bring it down.',
  'Cappuccino Assasino attacks from a distance. Make sure your defenses can outrange it.',
  'Tripi Tropi Tropi Tripa soaks up a huge amount of damage. Focus fire to bring it down fast.',
  'The Money Stealer runs straight for your Mines and Storages and hits them three times as hard.',
  'Check How to Play to see every enemy\'s stats and which defenses can hit it.',

  // Day and night
  'Night falls after each day. When the planning music starts, you have 30 seconds before the wave arrives.',
  'Watch for the spawn markers at dusk: they show where tonight\'s enemies will come from.',
  'Your game saves automatically at dusk and after every cleared wave.',
  'Lost a night? Retry rewinds to that dusk and gives you some daytime to rebuild first.'
];

/** A random tip, different from `previous` when there's more than one. */
export function pickTip(previous = null) {
  if (LOADING_TIPS.length < 2) return LOADING_TIPS[0] || '';
  let tip = previous;
  while (tip === previous) tip = LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)];
  return tip;
}
