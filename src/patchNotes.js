// The Patch Notes window's content (PatchNotesWindow.js, "What's New"): what changed, for players. TitleScene shows it
// once per `version` (the first time the title screen opens after an update; saved in ibtd.patchNotes), and its
// "What's New" button opens it any time. Keep `version` equal to package.json's for the release it describes.
//
// One tab per minor update (v0.7.1): PATCH_NOTES is the newest (its tab is "v0.7 · Latest"), PATCH_HISTORY the older
// ones, newest first. Each has `release` (the tab's name: '0.7'), `version` (its newest patch) and `sections`.
// When a new minor update ships, the current PATCH_NOTES content moves to the front of PATCH_HISTORY.
//
// FORMAT (v0.7; the full guide for agents is in CLAUDE.md, "Patch notes"): `sections` in this fixed order, each only
// if it has entries: 'feature' (New Features), 'change' (Changes), 'balance' (Balance), 'fix' (Bug Fixes). Inside a
// section, entries go biggest change first; among similar sizes, newest first. Each entry:
//   { version: '0.7.0', icon, title, text }  - version: the release it came in (shown as a small tag)
//   icon: what to draw beside it: { building: type, level? } (that level's picture), { enemy: kind }, { spell: kind },
//         { hero: true } (the Brisket King's badge) or { texture: key }.
// A release lists its own changes plus the patches of the same minor update before it.

/** Every entry of a release, section by section. */
const allEntries = (release) => release.sections.flatMap((s) => s.entries);

export const PATCH_NOTES = {
  release: '0.7',
  version: '0.7.1',
  title: "What's New in v0.7.1",
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
          version: '0.7.1', icon: { enemy: 'yahu' }, title: 'Big Yahu: airstrikes hit one building',
          text: 'Big Yahu’s missiles now hit only the building they’re aimed at (the red target is drawn around it), instead of everything nearby.'
        },
        {
          version: '0.7.1', icon: { building: 'cannon' }, title: 'Visiting: new building cards',
          text: 'Tapping a building in someone else’s village opens a card like the game’s own: its picture, health, size, damage, range and targets, and its perks in their path colors.'
        },
        {
          version: '0.7.1', icon: { enemy: 'grunt' }, title: 'Incoming troops fold up',
          text: 'The list of troops by each red arrow now starts as one small button with the total. Click or tap it to see every troop in the wave, and press Hide to fold it again.'
        },
        {
          version: '0.7.1', icon: { texture: 'ui_league_champion' }, title: 'Green Visit buttons',
          text: 'The round eye buttons on the leaderboard, in Find Players and on player cards are now green Visit buttons, so it’s clear how to look around someone’s village.'
        },
        {
          version: '0.7.1', icon: { texture: 'ui_start_button' }, title: 'What’s New: past updates',
          text: 'This window has a tab for each update. Press one to read what came in it, like v0.6’s KSI Tower and Village Hall 11.'
        },
        {
          version: '0.7.1', icon: { enemy: 'frigo' }, title: 'More enemies speak up',
          text: 'Bri Bri Bicus Dicus, Frigo Camillo, Brr Brr Patapim, Lirili Larila and Da Baby Car now shout their lines now and then during a raid.'
        },
        {
          version: '0.7.1', icon: { enemy: 'bones' }, title: 'How to Play: see the troops enemies bring',
          text: 'Rahhh Skeleton, Brr Brr Patapim and the Neegy Balloon have a button on their page that opens the troop they bring (Skeleton, Chimpanzini, Neegy), and that page has one to go back.'
        },
        {
          version: '0.7.1', icon: { texture: 'ui_medal_2' }, title: 'Leaderboard ranks and league badges stand out',
          text: 'The gold, silver and bronze medals are sized by place, and every other rank sits on its own badge so it’s easy to read. League badges grow a little with each league too, from Bronze up to WarLord.'
        },
        {
          version: '0.7.0', icon: { texture: 'ui_medal_1' }, title: 'Leaderboard medals',
          text: 'The top three players on the leaderboard now wear gold, silver and bronze medals.'
        },
        {
          version: '0.7.0', icon: { building: 'rvlab' }, title: 'How to Play and the RV Lab, tidied',
          text: 'How to Play lists all 22 enemies, with a new Summoned group for the troops other enemies bring. The RV Lab\'s building list has cleaner rows that no longer overlap.'
        }
      ]
    },
    {
      type: 'balance',
      entries: [
        {
          version: '0.7.1', icon: { enemy: 'bicus' }, title: 'Bri Bri Bicus Dicus: tougher armor',
          text: 'While its armor holds, it takes 30% less damage from every hit. Once the armor breaks, it takes full damage.'
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
          version: '0.7.1', icon: { building: 'fuelStation' }, title: 'Fuel Station text fits',
          text: 'The Fuel Station’s info, shop card and Brew window no longer have text running over buttons or out of their boxes.'
        }
      ]
    }
  ],
  /** Every entry, section by section (what the asset plan and tests read). */
  get entries() { return allEntries(this); }
};

/** Older updates, newest first: one What's New tab each (players can read them any time). */
export const PATCH_HISTORY = [
  {
    release: '0.6',
    version: '0.6.3',
    sections: [
      {
        type: 'feature',
        entries: [
          {
            version: '0.6.0', icon: { building: 'ksi' }, title: 'New defense: KSI Tower (from Village Hall 5)',
            text: 'It throws ice-cold bottles that splash ground and air enemies and chill them: chilled enemies slow down and turn icy blue. Its RV Lab paths: Blizzard, Fully Frozen and Snowball.'
          },
          {
            version: '0.6.1', icon: { building: 'townHall', level: 11 }, title: 'Village Hall 11 and Bonus Slots',
            text: 'A new top Village Hall. You keep all your building limits and get 5 Bonus Slots on top: each is one more defense of any kind past its limit, at the normal price. Sell one to free its slot.'
          },
          {
            version: '0.6.0', icon: { enemy: 'pork' }, title: 'New enemy: John Pork (from Village Hall 4)',
            text: 'When a F.L.O.C.K Tower spots him, he makes a phone call that silences the F.L.O.C.K Towers around him for a few seconds: no marks, no reveals.'
          },
          {
            version: '0.6.0', icon: { enemy: 'skeleton' }, title: 'New enemy: Rahhh Skeleton (from Village Hall 6)',
            text: 'A skeleton warrior with a shield. Near your base he calls Skeletons up out of the ground around him. Take him out before he gets close.'
          },
          {
            version: '0.6.0', icon: { enemy: 'vaca' }, title: 'New enemy: La Vaca Saturno (from Village Hall 7)',
            text: 'A tough flyer that throws boulders from range. Each boulder bounces on behind its target three times, hitting whatever it lands on.'
          },
          {
            version: '0.6.0', icon: { enemy: 'yahu' }, title: 'New enemy: Big Yahu (from Village Hall 8)',
            text: 'Calls missiles down from long range. Watch for the red target on the ground: that is where it will hit.'
          },
          {
            version: '0.6.0', icon: { enemy: 'patapim' }, title: 'New enemy: Brr Brr Patapim (from Village Hall 9)',
            text: 'A huge, slow tank whose earthquakes shake every building and wall around him. Walls take extra damage.'
          },
          {
            version: '0.6.2', icon: { texture: 'ui_start_button' }, title: 'Loads much faster, especially on phones',
            text: 'The game downloads about 8 times less before the title screen. Higher-level building pictures and the music load while you play, so it starts quicker and uses far less memory on phones.'
          },
          {
            version: '0.6.0', icon: { building: 'wall' }, title: 'Move a whole row of walls',
            text: 'In edit mode, press Select Row, then click a wall to pick up its whole straight row and drop it somewhere new.'
          }
        ]
      },
      {
        type: 'change',
        entries: [
          {
            version: '0.6.1', icon: { enemy: 'bones' }, title: 'Rahhh Skeleton summons Skeletons',
            text: 'Near your base he bashes his shield and three Skeletons climb out of the ground around him, then more every few seconds (up to six of his at once). He no longer enrages the enemies around him.'
          },
          {
            version: '0.6.3', icon: { building: 'ksi', level: 9 }, title: 'KSI Tower: icy new effects',
            text: 'Its bottles fly with a frosty glow and trail, and burst in ice shards, frost mist, snowflakes and a shockwave, like the Gandolf Tower\'s fireballs.'
          },
          {
            version: '0.6.0', icon: { enemy: 'tank' }, title: 'How to Play: a new enemy guide',
            text: 'Every enemy fits on one page, grouped into Ground, Air, Tanks & Bosses and Special. Click one to see what it does, which defenses can hit it, and its stats.'
          },
          {
            version: '0.6.0', icon: { hero: true }, title: 'The Brisket King on his altar',
            text: 'The Brisket King\'s picture shows on his altar in the shop, How to Play, the building panel and the RV Lab. His Hero tab got a cleaner look, with a card for his Brisket Feast ability.'
          },
          {
            version: '0.6.0', icon: { spell: 'rage' }, title: 'Spells have sounds',
            text: 'Every Fuel Station spell plays its own sound when you cast it.'
          },
          {
            version: '0.6.2', icon: { enemy: 'neegy' }, title: 'Title screen',
            text: 'The gold Neegy no longer stands with the enemies on the title screen.'
          },
          {
            version: '0.6.1', icon: { texture: 'ui_shop_button' }, title: 'Smaller things',
            text: 'The shop\'s page arrows are blue. Brr Brr Patapim, John Pork, Rahhh Skeleton and La Vaca Saturno joined the title screen, with La Vaca flying in over the heroes.'
          }
        ]
      },
      {
        type: 'balance',
        entries: [
          {
            version: '0.6.3', icon: { building: 'townHall', level: 11 }, title: 'Village Hall 11: Bonus Slots are for defenses',
            text: 'Bonus Slots take defenses only (traps included). Instead, Village Hall 11 allows one more Mine, Storage and House.'
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
          },
          {
            version: '0.6.0', icon: { building: 'mortar', level: 7 }, title: 'Mortar firing while loading',
            text: 'On phones, the title screen\'s mortar fired over and over while the game was still loading. It now waits until everything is ready.'
          }
        ]
      }
    ],
    get entries() { return allEntries(this); }
  }
];

/** Every What's New tab, newest first: the latest update, then the history. */
export const PATCH_RELEASES = [PATCH_NOTES, ...PATCH_HISTORY];

/** Section headings and colors, in their fixed order. */
export const PATCH_SECTIONS = {
  feature: { title: 'New Features', color: 0x4caf3a },
  change: { title: 'Changes', color: 0x3d8bdc },
  balance: { title: 'Balance', color: 0xd99a1e },
  fix: { title: 'Bug Fixes', color: 0xc8463c }
};
export const PATCH_SECTION_ORDER = ['feature', 'change', 'balance', 'fix'];
