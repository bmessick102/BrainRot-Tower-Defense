// The Patch Notes window's content (PatchNotesWindow.js, "What's New"): what changed, for players. TitleScene shows it
// once per `version` (the first time the title screen opens after an update; saved in ibtd.patchNotes), and its
// "What's New" button opens it any time. Keep `version` equal to package.json's for the release it describes.
//
// FORMAT (v0.7; the full guide for agents is in CLAUDE.md, "Patch notes"): `sections` in this fixed order, each only
// if it has entries: 'feature' (New Features), 'change' (Changes), 'balance' (Balance), 'fix' (Bug Fixes). Inside a
// section, entries go biggest change first; among similar sizes, newest first. Each entry:
//   { version: '0.7.0', icon, title, text }  - version: the release it came in (shown as a small tag)
//   icon: what to draw beside it: { building: type, level? } (that level's picture), { enemy: kind }, { spell: kind },
//         { hero: true } (the Brisket King's badge) or { texture: key }.
// A release lists its own changes plus the recent patches before it (players who skipped them still see them).
export const PATCH_NOTES = {
  version: '0.7.0',
  title: "What's New in v0.7",
  sections: [
    {
      type: 'feature',
      entries: [
        {
          version: '0.7.0', icon: { texture: 'ui_league_champion' }, title: "Visit other players' villages",
          text: 'Press the eye on the leaderboard, or use Settings > Find Players to search by name, league or Village Hall. A player\'s card shows their stats, achievements and league, and lets you look around their villages. Don\'t want visitors? Turn off "Let others view my villages" in Settings.'
        },
        {
          version: '0.7.0', icon: { enemy: 'babycar' }, title: 'Themed waves',
          text: 'Every wave now has a theme (Iron Legion, Frozen Front, Sky Fire, Jungle Stampede and more) that rotates so no two waves in a row feel the same. Every 10th wave is a Boss Wave with the raid boss, and each new enemy gets a debut wave of its own.'
        },
        {
          version: '0.7.0', icon: { enemy: 'bicus' }, title: 'New enemy: Bri Bri Bicus Dicus (from Village Hall 5)',
          text: 'An armored legionary. Its armor bar has to be broken before it takes any health damage, and the hit that breaks the armor is spent on it. Heavy hitters crack it fastest.'
        },
        {
          version: '0.7.0', icon: { enemy: 'frigo' }, title: 'New enemy: Frigo Camillo (from Village Hall 6)',
          text: 'A fridge on legs with a freezing aura: your defenses and the Brisket King attack 35% slower near it. Pick it off from range.'
        },
        {
          version: '0.7.0', icon: { enemy: 'bombo' }, title: 'New enemy: Bombombini Gusini (from Village Hall 8)',
          text: 'A fire-breathing goose. It burns one building at a time, and the flames scorch the buildings right next to it too. Only defenses that hit air can stop it.'
        },
        {
          version: '0.7.0', icon: { enemy: 'lirili' }, title: 'New enemy: Lirili Larila (from Village Hall 9)',
          text: 'The new earthquake tank: its stomps hit every building and wall around it, and walls take the most.'
        },
        {
          version: '0.6.2', icon: { texture: 'ui_start_button' }, title: 'Loads much faster, especially on phones',
          text: 'The game downloads about 8 times less before the title screen. Higher-level building pictures and the music load while you play, so it starts quicker and uses far less memory on phones.'
        },
        {
          version: '0.6.1', icon: { building: 'townHall', level: 11 }, title: 'Village Hall 11 Bonus Slots',
          text: 'Village Hall 11 keeps all your building limits and adds 5 Bonus Slots on top: each is one more defense of any kind past its limit, at the normal price. Sell one to free its slot.'
        }
      ]
    },
    {
      type: 'change',
      entries: [
        {
          version: '0.7.0', icon: { enemy: 'chimp' }, title: 'Brr Brr Patapim drops Chimpanzinis (now from Village Hall 10)',
          text: 'Patapim\'s earthquake went to Lirili Larila. Instead, as he walks in he drops a Chimpanzini Bananini every few seconds: they leap your walls and dive into the nearest building for one big hit.'
        },
        {
          version: '0.6.1', icon: { enemy: 'bones' }, title: 'Rahhh Skeleton summons Skeletons',
          text: 'Near your base he bashes his shield and three Skeletons climb out of the ground around him, then more every few seconds (up to six of his at once).'
        },
        {
          version: '0.6.3', icon: { building: 'ksi', level: 9 }, title: 'KSI Tower: icy new effects',
          text: 'Its bottles fly with a frosty glow and trail, and burst in ice shards, frost mist, snowflakes and a shockwave, like the Gandolf Tower\'s fireballs.'
        },
        {
          version: '0.7.0', icon: { texture: 'ui_medal_1' }, title: 'Leaderboard medals',
          text: 'The top three players on the leaderboard now wear gold, silver and bronze medals.'
        },
        {
          version: '0.7.0', icon: { building: 'rvlab' }, title: 'How to Play and the RV Lab, tidied',
          text: 'How to Play lists all 22 enemies, with a new Summoned group for the troops other enemies bring. The RV Lab\'s building list has cleaner rows that no longer overlap.'
        },
        {
          version: '0.6.2', icon: { enemy: 'neegy' }, title: 'Title screen',
          text: 'The gold Neegy no longer stands with the enemies on the title screen.'
        }
      ]
    },
    {
      type: 'balance',
      entries: [
        {
          version: '0.6.3', icon: { building: 'townHall', level: 11 }, title: 'Village Hall 11: Bonus Slots are for defenses',
          text: 'Bonus Slots now take defenses only (traps included). Instead, Village Hall 11 allows one more Mine, Storage and House.'
        },
        {
          version: '0.7.0', icon: { enemy: 'tank' }, title: 'Late waves make room for the new enemies',
          text: 'From Village Hall 9 up, the regular troops thin out a bit more as the new enemies join, so a wave stays about as strong as before (within 5%).'
        }
      ]
    },
    {
      type: 'fix',
      entries: [
        {
          version: '0.6.3', icon: { building: 'ra', level: 7 }, title: 'Tower of Rah losing its heat',
          text: 'A flyer hovering at the edge of its range, like La Vaca Saturno, kept slipping out and back, so the beam kept starting cold. Once locked on, the beam now holds on a little past its range.'
        },
        {
          version: '0.6.3', icon: { enemy: 'grunt' }, title: 'Enemies hiding under rubble',
          text: 'Enemies crossing a destroyed building were drawn under its rubble. They now walk on top of it.'
        },
        {
          version: '0.6.2', icon: { building: 'wall', level: 8 }, title: "The wall's info in the shop",
          text: 'The wall\'s "i" in the shop shows the level new walls are built at (your wall level), with its picture and health, and explains its price.'
        }
      ]
    }
  ],
  /** Every entry, section by section (what the asset plan and tests read). */
  get entries() { return this.sections.flatMap((s) => s.entries); }
};

/** Section headings and colors, in their fixed order. */
export const PATCH_SECTIONS = {
  feature: { title: 'New Features', color: 0x4caf3a },
  change: { title: 'Changes', color: 0x3d8bdc },
  balance: { title: 'Balance', color: 0xd99a1e },
  fix: { title: 'Bug Fixes', color: 0xc8463c }
};
export const PATCH_SECTION_ORDER = ['feature', 'change', 'balance', 'fix'];
