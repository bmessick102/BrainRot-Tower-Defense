// The Patch Notes window's content (PatchNotesWindow.js): what's new in this release, for players. TitleScene shows it
// once per `version` (the first time the title screen opens after an update; saved in ibtd.patchNotes), and its
// "What's New" button opens it any time. Keep `version` equal to package.json's for the release it describes.
// icon: what to draw beside an entry: { building: type } (its Level 1 picture), { enemy: kind }, { spell: kind },
// { hero: true } (the Brisket King's badge) or { texture: key }.
export const PATCH_NOTES = {
  version: '0.6.3',
  title: "What's New in v0.6.3",
  entries: [
    {
      icon: { building: 'townHall', level: 11 }, title: 'Village Hall 11: Bonus Slots are for defenses',
      text: "Village Hall 11's 5 Bonus Slots now take defenses only (traps included): each is one more defense of any kind past its limit, at the normal price. Instead, Village Hall 11 allows one more Mine, Storage and House."
    },
    {
      icon: { building: 'ra', level: 7 }, title: 'Fixed: Tower of Rah losing its heat',
      text: 'A flyer hovering at the edge of its range, like La Vaca Saturno, kept slipping out and back, so the beam kept starting cold and barely hurt it. Once locked on, the beam now holds on a little past its range and heats up all the way.'
    },
    {
      icon: { building: 'ksi', level: 9 }, title: 'KSI Tower: icy new effects',
      text: 'Its bottles fly with a frosty glow and trail, and burst in a flash of ice shards, frost mist, snowflakes and a shockwave, like the Gandolf Tower\'s fireballs.'
    },
    {
      icon: { enemy: 'grunt' }, title: 'Fixed: enemies hiding under rubble',
      text: 'Enemies crossing a destroyed building were drawn under its rubble. They now walk on top of it.'
    },
    {
      icon: { texture: 'ui_start_button' }, title: 'Loads much faster, especially on phones',
      text: 'The game now downloads about 8 times less before the title screen. Higher-level building pictures and the music load while you play, so it starts quicker and uses far less memory on phones.'
    },
    {
      icon: { building: 'wall', level: 8 }, title: 'Fixed: the wall\'s info in the shop',
      text: 'The wall\'s "i" in the shop now shows the level new walls are built at (your wall level), with its picture and health, and explains why a new wall costs what it does.'
    },
    {
      icon: { enemy: 'bones' }, title: 'Rahhh Skeleton now summons Skeletons (from Village Hall 6)',
      text: 'Near your base, Rahhh Skeleton now bashes his shield and three Skeletons climb out of the ground around him, then more every few seconds (up to six of his at once). Take him out before he gets close! He no longer enrages the enemies around him.'
    },
    {
      icon: { building: 'ksi' }, title: 'New defense: KSI Tower',
      text: 'Unlocks at Village Hall 5. It throws ice-cold bottles that splash ground and air enemies and chill them: chilled enemies slow down and turn icy blue. Its RV Lab paths: Blizzard, Fully Frozen and Snowball.'
    },
    {
      icon: { enemy: 'pork' }, title: 'New enemy: John Pork (from Village Hall 4)',
      text: 'When a F.L.O.C.K Tower spots him, he makes a phone call that silences the F.L.O.C.K Towers around him for a few seconds: no marks, no reveals.'
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
      text: 'The shop\'s page arrows are blue now. Brr Brr Patapim, John Pork, Rahhh Skeleton and La Vaca Saturno joined the title screen, with La Vaca flying in over the heroes.'
    },
    {
      icon: { building: 'mortar', level: 7 }, title: 'Fixed: mortar firing while loading',
      text: 'On phones, the title screen\'s mortar no longer fires over and over while the game is still loading. It now waits until everything is ready.'
    }
  ]
};
