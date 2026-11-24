// The Patch Notes window's content (PatchNotesWindow.js, "What's New"): what changed, for players. TitleScene shows it
// once per `version` (the first time the title screen opens after an update; saved in ibtd.patchNotes), and its
// "What's New" button opens it any time. Keep `version` equal to package.json's for the release it describes.
//
// One tab per minor update (v0.7.1): PATCH_NOTES is the newest (its tab is "v0.13 · Latest"), PATCH_HISTORY the older
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
  release: '0.13',
  version: '0.13.1',
  title: "What's New in v0.13.1",
  sections: [
    {
      type: 'feature',
      entries: [
        {
          version: '0.13.0', icon: { building: 'storage', level: 15 }, title: 'Storages now go up to Level 20',
          text: 'Bitcoin Storages have 20 levels, with a new Level 1 and four new looks at Levels 12 to 15. Every Storage you already had moved up one level, so it looks the same and holds more gold.'
        }
      ]
    },
    {
      type: 'balance',
      entries: [
        {
          version: '0.13.1', icon: { building: 'townHall', level: 20 }, title: 'Village Halls 12-20 cost more',
          text: 'The bigger Storages hold so much more gold that the Village Hall upgrades from Hall 12 up now cost more to match: 400,000 for Hall 12, rising to 920,000 for Hall 20.'
        },
        {
          version: '0.13.1', icon: { building: 'storage', level: 15 }, title: 'At most 6 Storages',
          text: 'You can build up to 6 Storages from Village Hall 11 on (it used to keep going up to 10). Six high-level Storages hold more than enough. Storages you already built stay.'
        },
        {
          version: '0.13.0', icon: { building: 'storage', level: 10 }, title: 'Cheaper Storage upgrades',
          text: 'Upgrading a Storage costs about half as much gold as before (Level 10 costs 24,000 instead of 51,200), so a village is quicker to build back up.'
        }
      ]
    }
  ],
  get entries() { return allEntries(this); }
};

/** Older updates, newest first: one What's New tab each (players can read them any time). */
export const PATCH_HISTORY = [
  {
    release: '0.12',
    version: '0.12.5',
    sections: [
      {
        type: 'feature',
        entries: [
          {
            version: '0.12.0', icon: { building: 'mageAltar', level: 20 }, title: 'New hero: the Locklair Mage (from Village Hall 10)',
            text: 'A hero who never leaves his pedestal. His staff zaps one enemy at a time, ground or air, for heavy damage, and his Sanctuary Aura heals the buildings and heroes around him. Destroyed, he stays knocked out until the raid ends.'
          },
          {
            version: '0.12.0', icon: { building: 'mageAltar', level: 10 }, title: 'Arcane Aegis',
            text: "The Locklair Mage's ability, on the hotbar (or the H key) once per wave: for 4 seconds nothing inside his aura can be damaged, his own pedestal included. He naps after every raid, so plan around it."
          }
        ]
      },
      {
        type: 'change',
        entries: [
          {
            version: '0.12.5', icon: { texture: 'ui_spawn_marker' }, title: 'Waves arrive one side at a time',
            text: 'A wave from several sides now starts from one or two of them, and another side joins every 8 seconds. Its red "!" lights up and pulses as it opens, so you can see where the next push comes from.'
          },
          {
            version: '0.12.1', icon: { hero: true }, title: 'Hero profiles in the shop',
            text: "Every hero's card in the shop has a button that opens the hero's profile: picture, stats at any level (step through them with the arrows), ability and perk paths. It works before you build the hero, too."
          },
          {
            version: '0.12.4', icon: { enemy: 'toilet' }, title: 'New sounds',
            text: 'Heroes now have sounds for being knocked out and getting back up, and you can hear arrows and bolts land, buildings take damage, enemies freeze, the Skibidi Toilet surface and dig, and Neegy Balloons pop. New spear hit sound too.'
          },
          {
            version: '0.12.5', icon: { texture: 'ui_aegis_ready' }, title: 'Arcane Aegis flashes the buildings it protects',
            text: 'When the Locklair Mage casts his Aegis, every building and wall it covers flashes white a few times, so you can see at a glance what is safe.'
          },
          {
            version: '0.12.5', icon: { texture: 'ui_settings_button' }, title: 'The speed button shows the speed',
            text: 'The round button beside Start Wave now reads 1x, 2x or 4x. Press it to go from 1x to 2x to 4x and back to 1x. The glowing ring around it is gone.'
          },
          {
            version: '0.12.3', icon: { texture: 'ui_encore_ready' }, title: 'New ability icons for the Brisket King and the Hatsune Queen',
            text: 'Brisket Feast is now a crowned, sizzling brisket in a burst of flames, and Encore Cloak a teal cloak swirling away in music notes, on the hotbar and in their profiles.'
          },
          {
            version: '0.12.2', icon: { building: 'mageAltar', level: 5 }, title: "The Locklair Mage's ring marks his range",
            text: 'The faint white ring now runs around the edge of his range instead of his tile, and the gold outline when selecting him is gone. His health bar is back without the dark box, with the usual perk bar under it.'
          },
          {
            version: '0.12.1', icon: { building: 'mageAltar', level: 1 }, title: 'A tidier Locklair Mage',
            text: 'His health and perks share one plate over his head, a soft white ring always marks his tile, and selecting him lights up in gold every building his Arcane Aegis protects.'
          },
          {
            version: '0.12.1', icon: { texture: 'ui_aegis_ready' }, title: 'Arcane Aegis has its own icon',
            text: 'A golden shield under a glowing dome now marks his ability on the hotbar and in his profile.'
          },
          {
            version: '0.12.0', icon: { texture: 'bld_flock_merged' }, title: 'New lightning for the F.L.O.C.K Mothership',
            text: 'Its Triple Zap now strikes as crackling, forking bolts of blue-white lightning instead of straight beams.'
          },
          {
            version: '0.12.0', icon: { building: 'dj', level: 1 }, title: "DJ Babyface's hype meter empties after each wave",
            text: 'Every wave now starts with an empty meter, so it no longer shows a half-full charge between waves.'
          }
        ]
      },
      {
        type: 'balance',
        entries: [
          {
            version: '0.12.5', icon: { enemy: 'grunt' }, title: 'Fewer enemies at once from many sides',
            text: 'The more sides a wave attacks from, the more slowly each side sends its enemies: one every 0.8 s from one side, 1 s from two, 1.4 s from four and 2.2 s from eight. Waves are just as big, only more spread out.'
          },
          {
            version: '0.12.2', icon: { building: 'mageAltar', level: 20 }, title: "The Locklair Mage's aura reaches as far as his zap",
            text: 'Sanctuary Aura and Arcane Aegis now reach 6 tiles, the same as his staff (they reached 4.5). Long Staff and Wider Sanctuary each grow that one range.'
          }
        ]
      },
      {
        type: 'fix',
        entries: [
          {
            version: '0.12.5', icon: { enemy: 'vaca' }, title: 'A La Vaca Saturno could freeze and hold up the wave',
            text: "A La Vaca Saturno hovering inside a F.L.O.C.K Tower's Frequency Jam stopped throwing and never came closer, so the wave couldn't end. Frequency Jam now only stops Bombers' bombs and Neegy Balloons' troops, as it says."
          },
          {
            version: '0.12.5', icon: { texture: 'ui_settings_button' }, title: 'Sound cutting out at 4x speed',
            text: 'In big fights at 4x the sound could crackle and then go silent for the rest of the game. Sounds now make room for each other when it gets crowded, and the sound comes back by itself if it stops.'
          },
          {
            version: '0.12.5', icon: { texture: 'ui_spawn_marker' }, title: 'Black edges when zooming out fast',
            text: 'Zooming out quickly could leave the sides of the map black for a moment. The whole map now stays drawn while you zoom.'
          },
          {
            version: '0.12.1', icon: { building: 'mageAltar', level: 10 }, title: "The Locklair Mage's zap leaves from his staff's gem",
            text: 'His lightning and the glow on his staff sat a little to the side of the gem. Both now come from the middle of the gem at the top of his staff.'
          }
        ]
      }
    ],
    get entries() { return allEntries(this); }
  },
  {
    release: '0.11',
    version: '0.11.0',
    sections: [
      {
        type: 'feature',
        entries: [
          {
            version: '0.11.0', icon: { building: 'townHall', level: 19 }, title: 'Village Halls 16 to 20',
            text: 'Village Halls now go up to 20, with five new looks from Hall 11 (a new one every 2 levels). Each new hall allows another Cannon and Locklair Tower, more of other defenses in turn, and 12 more walls.'
          },
          {
            version: '0.11.0', icon: { building: 'wall', level: 10 }, title: 'Two new wall levels',
            text: 'Walls now have 10 levels: a dark stone tower at Level 6 and a red skull fortress at Level 10. The skull and lava walls moved up to Levels 7 to 9. Your walls keep their look and strength.'
          },
          {
            version: '0.11.0', icon: { hero: true }, title: 'Both heroes go to Level 20',
            text: 'The Brisket King and the Hatsune Queen now have 20 levels, one more per Village Hall from 16 to 20, paid in Burgers. Their altars change look every 4 levels.'
          },
          {
            version: '0.11.0', icon: { texture: 'ui_achievement' }, title: 'New achievements: Village Halls 15 and 20',
            text: 'Brainrot Empire (Village Hall 15) pays 60,000 gold and Eternal Brainrot (Village Hall 20) 150,000. Find them in the Builder tab.'
          }
        ]
      },
      {
        type: 'change',
        entries: [
          {
            version: '0.11.0', icon: { building: 'wall', level: 6 }, title: 'Walls upgrade every 2 Village Halls',
            text: 'A new wall level opens at Village Halls 1, 3, 5 and so on, up to Level 10 at Hall 19. Walls already above what your hall allows stay as they are, and upgrade again once your hall catches up.'
          },
          {
            version: '0.11.0', icon: { texture: 'hero_queen_select' }, title: 'The Hatsune Queen levels like the Brisket King',
            text: 'Her top level now matches your Village Hall, the same as the Brisket King: Levels 1 to 8 all open at Village Hall 8, then one more per hall.'
          }
        ]
      }
    ],
    get entries() { return allEntries(this); }
  },
  {
    release: '0.10',
    version: '0.10.3',
    sections: [
      {
        type: 'feature',
        entries: [
          {
            version: '0.10.2', icon: { texture: 'bld_ra_merged' }, title: 'Towers of Rah can merge: the Great Pyramid of Rah',
            text: "Two Level 8 Towers of Rah merge into the Great Pyramid of Rah, whose beam burns twice as hot. Solar Lance: at full heat the beam becomes a lance to the end of its range, burning every enemy in its path for half the beam's damage."
          }
        ]
      },
      {
        type: 'change',
        entries: [
          {
            version: '0.10.0', icon: { enemy: 'grunt' }, title: 'Waves get harder by wave, not by Village Hall',
            text: 'How tough a wave is now depends only on its wave number, so upgrading your Village Hall no longer brings bigger waves: build up freely. More entrances open as the waves go on (all 8 from wave 65).'
          },
          {
            version: '0.10.0', icon: { enemy: 'pork' }, title: 'New enemies join at set waves',
            text: 'Each enemy type first shows up at its own wave, whatever your Village Hall: John Pork at wave 10, the Skibidi Toilet and Bri Bri Bicus Dicus at 14, up to the Grimace Golem at 48. Da Baby Car drives in from wave 18.'
          },
          {
            version: '0.10.1', icon: { hero: true }, title: 'Both heroes go to Level 15',
            text: 'The Brisket King and the Hatsune Queen now have 15 levels (paid in Burgers), and their altars change look every 3 levels. The Queen gets two levels per Village Hall from 8 to 14, and Level 15 at Village Hall 15.'
          },
          {
            version: '0.10.3', icon: { building: 'ra', level: 8 }, title: 'Towers of Rah are drawn smaller',
            text: 'Every Tower of Rah is drawn a little smaller, so the Great Pyramid of Rah can sit squarely on its tile and still stand above a Level 8 one. Each level still looks bigger than the one before.'
          },
          {
            version: '0.10.2', icon: { building: 'ra', level: 5 }, title: 'Towers of Rah grow at every level',
            text: 'Every Tower of Rah level now stands a little taller than the one before (Level 5 used to look smaller than Level 4). Low levels are drawn a bit smaller to make room, so the Great Pyramid fits its tile.'
          },
          {
            version: '0.10.0', icon: { texture: 'hero_queen_select' }, title: 'New Hatsune Queen poses',
            text: 'The Hatsune Queen has her own pictures now for being knocked out, waking up with a big stretch, and waving when you click on her.'
          }
        ]
      },
      {
        type: 'balance',
        entries: [
          {
            version: '0.10.1', icon: { building: 'cannon', level: 1 }, title: 'More defenses at Village Halls 11 to 15',
            text: 'Every Village Hall after 10 adds a Cannon and a Locklair Tower, plus more of other defenses in turn. At Village Hall 15 every other defense that can merge comes in an even number, so none is left without a merge partner.'
          }
        ]
      },
      {
        type: 'fix',
        entries: [
          {
            version: '0.10.3', icon: { texture: 'bld_ra_merged' }, title: 'The Great Pyramid of Rah sits on its tile',
            text: 'It stood too far back, so its round stone base hung over the back edges of its tile. Now its base sits in the middle of the tile, with the tile’s outline showing all the way around it.'
          }
        ]
      }
    ],
    get entries() { return allEntries(this); }
  },
  {
    release: '0.9',
    version: '0.9.4',
    sections: [
      {
        type: 'feature',
        entries: [
          {
            version: '0.9.0', icon: { texture: 'map_background' }, title: 'A bigger village: the new 40 x 40 map',
            text: 'A new painted forest at dawn, day, dusk and night with a 40 x 40 field, much more room than before. Its tiles are drawn exactly where buildings and walls snap. Your village moves over as it is, around your Village Hall. Zoom all the way out to see the whole map.'
          },
          {
            version: '0.9.0', icon: { enemy: 'grunt' }, title: 'Raids from 8 entrances',
            text: 'Enemies can come down every path, past the gate, over the bridge and across the waterfalls: everywhere but the lake. Bigger Village Halls open more at once (all 8 from Village Hall 13). Fog and markers show where the next wave comes from.'
          },
          {
            version: '0.9.1', icon: { texture: 'bld_catapult_merged' }, title: 'Diddypults can merge: the Diddy Trebuchet',
            text: 'Two Level 5 Diddypults merge into the Diddy Trebuchet, which hurls a giant barrel that hits twice as hard. Barrel Burst: the barrel bursts into oil jugs that splash all around it, each leaving its own slick pool.'
          }
        ]
      },
      {
        type: 'change',
        entries: [
          {
            version: '0.9.3', icon: { building: 'rvlab', level: 5 }, title: 'Every Mastery path in the RV Lab',
            text: 'Every building that can merge now shows its Mastery path in the RV Lab, greyed out until you have a merged one, so you can see what is coming. Merge two to unlock it.'
          },
          {
            version: '0.9.4', icon: { building: 'fuelStation', level: 1 }, title: 'A sound for brewing spells',
            text: 'Brewing a spell at the Fuel Station now plays its own sound.'
          },
          {
            version: '0.9.3', icon: { building: 'cannon', level: 1 }, title: 'A sound for placing buildings',
            text: 'Buildings now land with their own sound when you place one you bought, move one, or set one down in edit mode. Walls keep their usual sound.'
          },
          {
            version: '0.9.3', icon: { texture: 'map_background' }, title: 'Tiles blend into the grass',
            text: 'The tiles no longer stop in a hard staircase at the edge of the field: they fade softly into the painted grass, and never over bushes, rocks or bridges.'
          },
          {
            version: '0.9.3', icon: { texture: 'map_background' }, title: 'A sharp picture on big screens',
            text: 'The game now draws at your screen\u2019s full resolution, so text, buildings and the map stay crisp on large and high-resolution screens. Zoom in on a computer and the map loads its full detail. Low graphics keeps the old, lighter picture.'
          },
          {
            version: '0.9.2', icon: { texture: 'map_background' }, title: 'A new map: forest and mountains',
            text: 'A new painted battlefield between a forest and snowy mountains, with more room to build: tiles cover the grass right up to its edge. Enemies come over five bridges, out of a cave and down two stairways: 8 ways in, all 8 from Village Hall 13.'
          },
          {
            version: '0.9.1', icon: { enemy: 'grunt' }, title: 'Raids from 7 entrances',
            text: 'Enemies no longer come across the left waterfall: the path by the stone pillar right beside it already brings them in there. All 7 entrances are in play from Village Hall 13.'
          },
          {
            version: '0.9.1', icon: { texture: 'deco_grass' }, title: 'Grass tufts and solid ground',
            text: 'Grass tufts now grow across your field, just for looks: build or move something onto one and it\u2019s gone. Every building and wall also stands on a solid patch of grass instead of the checker, in your village and when you visit others.'
          },
          {
            version: '0.9.1', icon: { texture: 'bld_flock_merged' }, title: 'F.L.O.C.K Mothership stands on its tile',
            text: 'It now stands centered on its tile, its base reaching the tile\u2019s edge instead of covering it. F.L.O.C.K Towers are drawn a little smaller at every level, so the Mothership stands clearly above a Level 10 one.'
          }
        ]
      },
      {
        type: 'fix',
        entries: [
          {
            version: '0.9.2', icon: { hero: true }, title: 'A player\u2019s card kept reopening',
            text: 'After visiting a village from the leaderboard, going back to the title screen from the game reopened that player\u2019s card every time. It only reopens right after a visit now.'
          },
          {
            version: '0.9.0', icon: { texture: 'bld_flock_merged' }, title: 'The F.L.O.C.K Mothership was tiny',
            text: 'It was drawn smaller than the F.L.O.C.K Towers it was merged from. It now stands clearly bigger than a top-level F.L.O.C.K Tower.'
          }
        ]
      }
    ],
    /** Every entry, section by section (what the asset plan and tests read). */
    get entries() { return allEntries(this); }

  },
  {
    release: '0.8',
    version: '0.8.12',
    sections: [
      {
        type: 'feature',
        entries: [
          {
            version: '0.8.0', icon: { texture: 'hero_queen' }, title: 'New hero: the Hatsune Queen (from Village Hall 8)',
            text: 'A crossbow hero with her own altar who shoots ground and air enemies from range while staying back. Her Encore Cloak (hotbar) hides her for 4 s while her bolts hit much harder and pierce. She has her own RV Lab tree with three paths.'
          },
          {
            version: '0.8.0', icon: { texture: 'ui_merge_gear' }, title: 'Merge your defenses',
            text: 'Two Level 10 Cannons, Locklair Towers, Litman Mortars or Firework Launchers can merge into one bigger building as strong as both, with its own special ability (the Firework Launcher becomes a Missile Silo) and a gold Mastery track. Select a Level 10 one and press Merge.'
          },
          {
            version: '0.8.2', icon: { texture: 'bld_wizard_merged' }, title: 'Gandolf Towers can merge: Gandolf the Grand',
            text: 'Two Level 10 Gandolf Towers merge into Gandolf the Grand. You Shall Not Pass: every 10 s he raises a magic wall in front of a group of ground enemies, holding them in place for his fireballs. Flyers go over it.'
          },
          {
            version: '0.8.2', icon: { texture: 'bld_flock_merged' }, title: 'F.L.O.C.K Towers can merge: the Mothership',
            text: 'Two Level 10 F.L.O.C.K Towers merge into the F.L.O.C.K Mothership, which finally fights back. Triple Zap: every second it zaps the 3 closest enemies at once, ground or air, and still marks everything in range.'
          },
          {
            version: '0.8.3', icon: { texture: 'bld_spear_merged_dl' }, title: 'Spear Throwers can merge: the Harpoon Ballista',
            text: 'Two Level 10 Spear Throwers merge into the Harpoon Ballista, whose spears hit twice as hard. Reel In: every 3rd throw harpoons the toughest enemy in range and drags it 3 tiles back the way it came. Bosses are only slowed.'
          },
          {
            version: '0.8.11', icon: { texture: 'bld_ksi_merged' }, title: 'KSI Towers can merge: the KSI Frost Fortress',
            text: 'Two Level 10 KSI Towers merge into the KSI Frost Fortress, whose bottles hit twice as hard. Shatter: any enemy it has chilled bursts into ice shards when it dies, hurting every enemy around it, so a crowd can shatter in a chain.'
          },
          {
            version: '0.8.0', icon: { enemy: 'quandale' }, title: 'New enemy: Quandale Dingle (from Village Hall 7)',
            text: 'A fast street fighter. When he gets close he dashes into a building with a big impact hit that stuns it for a moment, then keeps punching. A wall in his way stops the dash.'
          },
          {
            version: '0.8.0', icon: { enemy: 'grimace' }, title: 'New enemy: Grimace Golem (from Village Hall 11)',
            text: 'A huge purple tank that leaves goo as he walks. Troops that step in it get enraged (faster and harder hitting), and he leaves a big puddle when he falls. Take him down before the troops behind him reach the goo.'
          },
          {
            version: '0.8.0', icon: { building: 'townHall', level: 11 }, title: 'Village Halls 12 to 15',
            text: 'Four more Village Hall levels, each with its own new buildings (more Towers of Rah, Gandolfs, Diddypults and more), extra walls and tougher waves. Open your Village Hall to see what the next level adds.'
          },
          {
            version: '0.8.0', icon: { texture: 'ui_start_button' }, title: '2x wave speed',
            text: 'Press the 2x button next to Start Wave (or T) to play a wave at double speed. It stays on for the next waves until you turn it off.'
          },
          {
            version: '0.8.0', icon: { texture: 'ui_medal_1' }, title: 'Leaderboard: every village',
            text: 'Every village now has its own spot on the leaderboard, with its name under the player’s, so all your villages can climb it.'
          }
        ]
      },
      {
        type: 'change',
        entries: [
          {
            version: '0.8.9', icon: { texture: 'ui_start_button' }, title: '4x wave speed',
            text: 'The wave speed button has a second level: press it once for 2x, again for 4x, and once more to go back to normal speed. Your choice stays for the next waves.'
          },
          {
            version: '0.8.0', icon: { building: 'townHall', level: 11 }, title: 'Village Hall 11: new defenses instead of Bonus Slots',
            text: 'Bonus Slots are gone. Village Hall 11 now gives one more Tower of Rah, Gandolf, Diddypult, KSI Tower and Cannon. Villages keep every building they built with Bonus Slots: they all keep working, you just can’t build another of that kind until you’re under the limit.'
          },
          {
            version: '0.8.12', icon: { texture: 'ui_merge_gear' }, title: 'See which buildings can merge',
            text: 'Buildings that can merge now show a greyed Merge button before Level 10, so you know what to aim for. Tap it to see how merging works.'
          },
          {
            version: '0.8.6', icon: { texture: 'bld_spear_merged_dl' }, title: 'The Harpoon Ballista gets its own picture',
            text: 'The Harpoon Ballista is no longer a glowing Spear Thrower: it has its own giant ballista tower, which turns to face the enemy it’s shooting.'
          },
          {
            version: '0.8.10', icon: { texture: 'bld_spear_merged_dl' }, title: 'Harpoon Ballista fits its tile',
            text: 'The Harpoon Ballista is drawn a little smaller again, so you can see its tile’s outline all around it.'
          },
          {
            version: '0.8.8', icon: { texture: 'bld_flock_merged' }, title: 'F.L.O.C.K Mothership smaller',
            text: 'The F.L.O.C.K Mothership is drawn smaller, so it fits on its tile and you can see the tile’s outline around it.'
          },
          {
            version: '0.8.7', icon: { texture: 'bld_spear_merged_dl' }, title: 'Harpoon Ballista a little smaller',
            text: 'The Harpoon Ballista is drawn a little smaller, closer to the size of the other merged defenses.'
          },
          {
            version: '0.8.5', icon: { texture: 'bld_flock_merged' }, title: 'Triple Zap looks like a tesla coil',
            text: 'The F.L.O.C.K Mothership\u2019s zaps are now crackling beams of electricity, straight from the tower to each of the 3 enemies it hits, that follow them until they fade.'
          },
          {
            version: '0.8.5', icon: { texture: 'ui_ability_rolling_thunder' }, title: 'New merged ability icons',
            text: 'Every merged defense\u2019s ability now has its own painted icon in the merge window, the RV Lab and the building panel. Merged buildings have a new gear badge, and armored enemies a new shield beside their health bar.'
          },
          {
            version: '0.8.4', icon: { texture: 'ui_settings_button' }, title: 'A way out when something breaks',
            text: 'If the game ever freezes because of an error, a “Something went wrong” window now appears with Keep Playing and Reload, instead of a stuck screen. Server problems show a plain message with Retry.'
          },
          {
            version: '0.8.0', icon: { building: 'cannon', level: 10 }, title: 'No more selling',
            text: 'Every Village Hall allows a set number of each building, so selling is gone: rearrange your village by moving buildings in edit mode instead. Nothing was taken from your village.'
          },
          {
            version: '0.8.0', icon: { enemy: 'grimace' }, title: 'Two new wave themes',
            text: 'Dash Gang (Quandale Dingles with Sharks) and Goo Parade (Grimace Golems leading the horde) join the rotation once those enemies are in your waves.'
          },
          {
            version: '0.8.0', icon: { texture: 'ui_league_champion' }, title: 'Visit from the player’s profile',
            text: 'The button on each leaderboard and Find Players row is now Profile. Visit their villages from inside the profile; Back returns you to their profile, then the list you came from.'
          },
          {
            version: '0.8.3', icon: { building: 'rvlab' }, title: 'No free path reset after merging',
            text: 'Merging two defenses no longer gives a free path reset in the RV Lab. Resetting a path always costs its normal Burger price. An unused free reset from an earlier merge is gone.'
          },
          {
            version: '0.8.2', icon: { hero: true }, title: 'Heroes sleep at night',
            text: 'At night, when no raid is on, the Brisket King and the Hatsune Queen walk home and sleep on their altars. Start a raid and they wake up to defend.'
          },
          {
            version: '0.8.3', icon: { texture: 'bld_flock_merged' }, title: 'New F.L.O.C.K Mothership picture',
            text: 'The F.L.O.C.K Mothership has its own picture now, instead of a bigger, glowing Level 10 F.L.O.C.K Tower.'
          },
          {
            version: '0.8.4', icon: { building: 'cannon', level: 10 }, title: 'Mega Cannon a little smaller',
            text: 'The merged Cannon is drawn a little smaller, so it doesn’t crowd the buildings around it.'
          },
          {
            version: '0.8.3', icon: { texture: 'ui_achievement' }, title: 'New achievement sounds',
            text: 'Earning an achievement plays a new sound, and pressing Claim on an achievement in your Profile has its own sound too.'
          },
          {
            version: '0.8.3', icon: { texture: 'ui_medal_1' }, title: 'Pages on the leaderboard and Find Players',
            text: 'The leaderboard now goes past the top 10: use the arrows beside its title to page through every village, 10 at a time. Find Players loads 8 players a page, so both open faster.'
          },
          {
            version: '0.8.3', icon: { texture: 'ui_league_champion' }, title: 'Spam protection',
            text: 'Find Players searches are spaced a second apart, and after a few wrong passwords in a row you wait a few seconds before trying again. Searching or opening profiles very fast for a minute pauses them briefly.'
          },
          {
            version: '0.8.3', icon: { texture: 'ui_edit_layout_button' }, title: 'Cleaner edit mode',
            text: 'In edit mode, buildings show only their level badge: the perk diamonds and Mastery stars are hidden so you can see your layout. They come back when you leave edit mode.'
          },
          {
            version: '0.8.3', icon: { texture: 'bld_wizard_merged' }, title: 'Gandolf the Grand a little smaller',
            text: 'Gandolf the Grand is drawn a little smaller, so he fits in better next to your other buildings.'
          },
          {
            version: '0.8.3', icon: { texture: 'bld_firework_merged_left' }, title: 'Missile Silo a little bigger',
            text: 'The Missile Silo, the merged Firework Launcher, is drawn a little bigger so it stands out more.'
          },
          {
            version: '0.8.3', icon: { building: 'flock', level: 10 }, title: 'F.L.O.C.K Towers a little smaller',
            text: 'Every F.L.O.C.K Tower is drawn a little smaller, and the F.L.O.C.K Mothership shrank by the same amount.'
          },
          {
            version: '0.8.3', icon: { texture: 'ui_settings_button' }, title: 'Credits: audio and assets',
            text: 'The Credits tab in Settings now has sections, with fuller team credits and who made the sound effects and images.'
          },
          {
            version: '0.8.2', icon: { texture: 'ui_encore_ready' }, title: 'New Encore Cloak icon',
            text: 'The Hatsune Queen’s Encore Cloak has its own picture now, a purple cloak, on her hotbar button and over her when it’s ready.'
          },
          {
            version: '0.8.2', icon: { texture: 'ui_merge_gear' }, title: 'Bigger ability icons',
            text: 'Merged defenses show their special ability in a bigger square box, like the heroes’ ability buttons.'
          },
          {
            version: '0.8.1', icon: { texture: 'bld_cannon_merged_dl' }, title: 'Bigger shots for merged defenses',
            text: 'The Mega Cannon fires a much bigger cannonball and the Missile Silo fires bigger rockets, so their shots stand out.'
          },
          {
            version: '0.8.1', icon: { texture: 'ui_merge_gear' }, title: 'Mastery shows when it’s ready',
            text: 'In the RV Lab, the gold Mastery column now pulses when you can research its next tier.'
          },
          {
            version: '0.8.2', icon: { texture: 'ui_merge_gear' }, title: 'Mastery column look',
            text: 'The RV Lab’s Mastery column keeps a steady gold outline (no more pulsing), and all its text is in gold.'
          },
          {
            version: '0.8.1', icon: { texture: 'title_logo' }, title: 'New app icon',
            text: 'Add the game to your home screen and it gets a proper app icon: the game’s logo over the title screen. The browser tab shows it too.'
          },
          {
            version: '0.8.0', icon: { enemy: 'tank' }, title: 'Title screen',
            text: 'Tripi Tropi, the fish giant, is smaller on the title screen so he no longer towers over everyone.'
          },
          {
            version: '0.8.0', icon: { texture: 'ui_settings_button' }, title: 'New perk sound',
            text: 'Researching a perk in the RV Lab has a new sound, and Mastery tiers play it too.'
          }
        ]
      },
      {
        type: 'balance',
        entries: [
          {
            version: '0.8.2', icon: { building: 'wizard', level: 10 }, title: 'Gandolf Towers back to 6',
            text: 'Village Halls give up to 6 Gandolf Towers again (Village Hall 12 gives a Gandolf instead of a Litman Mortar), and pairs can now merge into Gandolf the Grand instead.'
          },
          {
            version: '0.8.1', icon: { building: 'wizard', level: 10 }, title: 'Fewer Gandolf Towers',
            text: 'Gandolf Towers now top out at 4 instead of 6: one each at Village Halls 3, 6, 9 and 11. Village Hall 12 gives a Litman Mortar instead. Villages keep every Gandolf they already built.'
          }
        ]
      },
      {
        type: 'fix',
        entries: [
          {
            version: '0.8.12', icon: { texture: 'bld_ksi_merged' }, title: 'KSI Frost Fortress sat off its tile',
            text: 'The KSI Frost Fortress stood too far back, so its icy base hung over the tiles behind and beside it. It now stands centered on its own tile, like a Level 10 KSI Tower, and is still clearly bigger.'
          },
          {
            version: '0.8.7', icon: { texture: 'bld_cannon_merged_dl' }, title: 'Merged defenses fire from the right spot',
            text: 'Shots from merged defenses came out of the middle of the tower. Now the Mega Cannon fires from its barrel, the Missile Silo’s rockets leave from its nose, Gandolf the Grand casts from his staff and the Harpoon Ballista throws from its bolt’s tip.'
          },
          {
            version: '0.8.7', icon: { texture: 'hero_queen_attack' }, title: 'The Hatsune Queen’s bolts leave her crossbow',
            text: 'Her bolts started low, near her waist. They now fly out of the tip of her crossbow, on whichever side she’s aiming.'
          },
          {
            version: '0.8.5', icon: { texture: 'ui_medal_1' }, title: 'Ranks on player cards match the leaderboard',
            text: 'A player\u2019s card could show a different rank from the leaderboard. Its rank is now their best village\u2019s leaderboard rank, every village shows its own rank, and the village you clicked on the leaderboard is marked.'
          },
          {
            version: '0.8.5', icon: { building: 'townHall', level: 15 }, title: 'Village Hall shown as 11',
            text: 'Villages above Village Hall 11 showed as 11 on the leaderboard, player cards and Find Players. They show their real level now, and a player\u2019s numbers come from their villages everywhere.'
          },
          {
            version: '0.8.4', icon: { texture: 'ui_medal_1' }, title: 'Leaderboard showed a server error',
            text: 'After the last server update the leaderboard could show a database error instead of the list. It loads again, and if the server is ever behind it shows the per-player board instead of an error.'
          },
          {
            version: '0.8.3', icon: { texture: 'ui_league_champion' }, title: 'Stuck when visiting a village again',
            text: 'After visiting a village and pressing Back, pressing Visit or Visit Best Village again (or switching to another of the player’s villages) left the screen stuck. Visiting now works every time.'
          },
          {
            version: '0.8.3', icon: { texture: 'ui_league_champion' }, title: 'Find Players buttons past the edge',
            text: 'The Achievements sort button in Find Players ran past the right edge of the window. The sort buttons now fit inside it.'
          },
          {
            version: '0.8.0', icon: { building: 'townHall', level: 1 }, title: 'Village drawn as plain blocks',
            text: 'On a slow or patchy connection, pictures that failed to load stayed as plain blocks all game. The game now keeps trying, swaps buildings in when they arrive, and offers Retry and Reload if pictures still won’t load.'
          },
          {
            version: '0.8.1', icon: { texture: 'hero_queen' }, title: 'Hatsune Queen’s shots were silent',
            text: 'With several Locklair Towers firing, the Hatsune Queen’s crossbow shots often made no sound. Every shot now plays, like a Locklair Tower’s.'
          },
          {
            version: '0.8.0', icon: { hero: true }, title: 'Hero health bar not full',
            text: 'After upgrading a hero’s altar, the hero’s health bar looked hurt even at full health. It now stays full.'
          },
          {
            version: '0.8.0', icon: { texture: 'ui_settings_button' }, title: 'Sound with the sliders at 0',
            text: 'Music, ambience and some sounds kept playing after you turned the sliders down (in the pause menu or mid-sound). Every slider now silences its sounds right away.'
          },
          {
            version: '0.8.0', icon: { texture: 'ui_league_champion' }, title: 'Black screen when visiting a village',
            text: 'Visiting a big village showed a black screen while its pictures loaded. The village now appears right away and fills in, and if something goes wrong you get a message and a Back button.'
          },
          {
            version: '0.8.0', icon: { texture: 'ui_league_champion' }, title: 'Buttons stuck after visiting a village',
            text: 'Coming back from someone’s village and closing their card left every title screen button unclickable until a refresh. They work again.'
          },
          {
            version: '0.8.0', icon: { enemy: 'quandale' }, title: 'Enemies drawn as a plain box',
            text: 'An enemy whose picture hadn’t loaded showed up as a plain box. It now shows a simple stand-in figure instead (reload the page to get its picture back).'
          }
        ]
      }
    ],
    get entries() { return allEntries(this); }
  },
  {
    release: '0.7',
    version: '0.7.1',
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
    get entries() { return allEntries(this); }
  },
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
