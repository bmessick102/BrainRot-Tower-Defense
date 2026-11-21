// The Patch Notes window's content (PatchNotesWindow.js): what's new in this release, for players. TitleScene shows it
// once per `version` (the first time the title screen opens after an update; saved in ibtd.patchNotes), and its
// "What's New" button opens it any time. Keep `version` equal to package.json's for the release it describes.
// icon: what to draw beside an entry: { building: type } (its Level 1 picture), { enemy: kind }, { spell: kind },
// { hero: true } (the Brisket King's badge) or { texture: key }.
export const PATCH_NOTES = {
  version: '0.6.0',
  title: "What's New in v0.6",
  entries: [
    {
      icon: { building: 'ksi' }, title: 'New defense: KSI Tower',
      text: 'Unlocks at Village Hall 5. It throws ice-cold bottles that splash ground and air enemies and chill them: chilled enemies slow down and turn icy blue. Its RV Lab paths: Blizzard, Fully Frozen and Snowball.'
    },
    {
      icon: { enemy: 'pork' }, title: 'New enemy: John Pork (from Village Hall 4)',
      text: 'When a F.L.O.C.K Tower spots him, he makes a phone call that silences the F.L.O.C.K Towers around him for a few seconds: no marks, no reveals.'
    },
    {
      icon: { enemy: 'skeleton' }, title: 'New enemy: Rahhh Skeleton (from Village Hall 6)',
      text: 'He bashes his shield to send himself and every enemy around him into a rage: they hit harder and move faster for a while.'
    },
    {
      icon: { enemy: 'vaca' }, title: 'New enemy: La Vaca Saturno (from Village Hall 7)',
      text: 'A tough flyer that throws boulders from range. Each boulder bounces on behind its target three times, hitting whatever it lands on.'
    },
    {
      icon: { enemy: 'yahu' }, title: 'New enemy: Big Yahu (from Village Hall 8)',
      text: 'Calls missiles down from long range. Watch for the red target on the ground: that is where it will hit.'
    },
    {
      icon: { enemy: 'patapim' }, title: 'New enemy: Brr Brr Patapim (from Village Hall 9)',
      text: 'A huge, slow tank whose earthquakes shake every building and wall around him. Walls take extra damage.'
    },
    {
      icon: { building: 'townHall', level: 11 }, title: 'New: Village Hall 11 and one building limit',
      text: "A new top Village Hall. At Village Hall 11, each building's limit becomes one shared limit for your village: build any mix, even five Towers of Rah! Copies past a building's usual limit cost 50% more each. It also allows 12 more walls."
    },
    {
      icon: { building: 'wall' }, title: 'Move a whole row of walls',
      text: 'In edit mode, press Select Row, then click a wall to pick up its whole straight row and drop it somewhere new.'
    },
    {
      icon: { spell: 'rage' }, title: 'Spells have sounds',
      text: 'Every Fuel Station spell now plays its own sound when you cast it.'
    },
    {
      icon: { enemy: 'tank' }, title: 'How to Play: a new enemy guide',
      text: 'Every enemy now fits on one page, grouped into Ground, Air, Tanks & Bosses and Special. Click one to see what it does, which defenses can hit it, and its stats.'
    },
    {
      icon: { hero: true }, title: 'The Brisket King on his altar',
      text: 'The Brisket King\'s picture now shows on his altar in the shop, How to Play, the building panel and the RV Lab. His Hero tab got a cleaner look, with a card for his Brisket Feast ability.'
    },
    {
      icon: { texture: 'ui_shop_button' }, title: 'Smaller things',
      text: 'The shop\'s page arrows are blue now. Brr Brr Patapim, John Pork and Rahhh Skeleton joined the title screen.'
    },
    {
      icon: { building: 'mortar', level: 7 }, title: 'Fixed: mortar firing while loading',
      text: 'On phones, the title screen\'s mortar no longer fires over and over while the game is still loading. It now waits until everything is ready.'
    }
  ]
};
