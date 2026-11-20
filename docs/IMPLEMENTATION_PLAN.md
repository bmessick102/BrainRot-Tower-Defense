# iBTD Fixes & Features: Decisions and Implementation Plan

Source: `iBTD Fixes and features.txt` (37 items). Decisions below came from Q&A rounds on 2026-11-19.

## Decisions (settled)

**Perk / RP system (16, 19, 26, 28)**
- Path lock is per building TYPE: the first RV Lab pick (e.g. Cannon A1) commits every cannon to that path for tiers 2-5.
- Paid respec: spend RP to reset a type's path (no refund of the old picks).
- Perks are fully separate from building levels: bought with RP only, gated only by RV Lab level (tier N needs lab level N). Building level has no effect on perks. Applies to defenses, economy, DJ, altar (hero) and Fuel Station trees.
- RP is a capped resource with a bar like Bitcoin (cap grows with RV Lab level). Top row, with the day/night UI moved directly below it.
- RP sinks: RV Lab and Fuel Station upgrades cost RP (26), path respec, spell brewing.

**Spear Thrower (21)**: long-range sniper (ground-only at first; the user later asked for ground AND air: a spear pierces only its first target's layer), range about 8-9 (Cannon is 6), slow fire (about 2.5s), high single-hit damage. Spear pierces: 100% / 75% / 50% / 25% along a short line behind the first target. Unlock about VH3, limit 1-3. 5 levels x 4 facings of art. Two random shoot sounds plus a hit sound.

**Fuel Station (25)**: economy building (shop economy tab), 4 levels of art, opens a window like the RV Lab. Spells are brewed with RP; slots = f(Village Hall level). Brewed spells go on the hotbar; click the spell, then click the map to drop it (radius ring shown). Single use per raid. Fuel Station level unlocks spell types: Rage, Heal, Freeze, Invisibility, Heat Field, and Lightning Strike (hits the X highest-HP enemies for heavy damage). Has its own perk tree in the new perk system. RP upgrade cost.

**Diddypult (35)**: unlocks at VH10, the final unlock, and is last in the shop. Add the two new level images (levels 4 and 5).

**Waves (2, 14, 33)**: HUD arrows plus an enemy list fixed to the screen corners for each spawn corner of the NEXT wave, always visible. Spawn corners are random in number and choice at every level. Fog sits at the active spawn corners, not a fixed 4 corners. Waves mix enemy types (interleaved), not one type after another.

**Hotbar (27, 22, 23, 29)**: bottom-middle hotbar for building, hero and spell abilities; it replaces the old ability buttons (22 is satisfied by it). Explicit buttons activate the DJ Drop the Beat and Brisket Feast; clicking the building/hero no longer triggers them. The building info panel moves if it would cover the hotbar.

**Walls (30)**: one "Upgrade Walls" button raises every wall one level; cost = walls placed x new-level price; re-tune prices. Newly placed walls start at the current level. No per-wall upgrade buttons.

**Brisket King (5-11, 15)**: KO'd during a raid stays down until the raid ends (no sleep cycle), with a KO effect over his head; a new Revive perk ("Second Wind") gets him up after N seconds. Always show his health bar, level and crown (using the provided crown image with the number drawn on top). Rage state: red tint and anger particles. Ability and description on every hero info page. Select pose image on click. Altar shop info gets a button to open the hero UI. Light around him at night.

## Work groups (one agent each)

| Group | Items | Main files |
|---|---|---|
| H. Hero | 5, 6, 7, 8, 9, 10, 11, 15 | HeroView, hero.js, UIScene hero bits, art |
| W. Waves | 2, 14, 33 | waves.js, GameScene spawn/fog, wave HUD |
| U. UI polish | 1, 3, 4, 12, 13, 17, 18, 20, 24, 36 | shop, top bar, LeagueRow, HowToPlay, BuildingView, art |
| B. Defenses | 21, 35 | config, combat.js, BuildingView, art, audio |
| P. Perks/RP | 16, 19 (RP parts), 26, 28 | abilities.js, abilityConfig, GameState, save, AbilityWindow, RP bar |
| F. Fuel Station + hotbar | 25, 27, 22, 23, 29 | after P |
| G. Walls | 30 | after P |
| R. Rebalance | 31 | after all |
| Q. QA | 32, 34, 37 | after all |

## Phases
1. In parallel: H, W, U, B, P (disjoint concerns; each makes small localized edits to shared files such as UIScene/GameScene/config, re-reading before editing).
2. F and G (depend on P's RP/perk system).
3. R, then Q (multi-user check, edge cases, version bump and CHANGELOG).

## Final QA agent (on hold until the user says go)
- Go back through all errors: tests, build, browser console, warnings.
- Item 32: multiple users with multiple villages (Supabase + local backend, session switching, save isolation).
- Item 34: edge-case testing.
- Item 37: version bump + CHANGELOG for everything since v0.4.1.
- Leftovers: How To Play Fuel Station "Spells opened per level" label overlaps its value; CHANGELOG lacks Fuel Station entry.
- Low-spec devices (user request 2026-11-20): throttled CPU / low-memory profiles in headless Chromium, frame times on the title screen and late waves, particle/tween counts, texture memory (large PNGs), and a low-quality fallback if needed.
- High rounds (user request 2026-11-20): stress-test very high waves (e.g. 100, 200, 500+) for crashes, NaN/Infinity in HP/damage scaling, enemy count caps, memory leaks (objects not destroyed), save size, and frame rate; fix anything that breaks.

### Final QA split into agents (2026-11-20)
Phase A (parallel, disjoint areas):
- QA-1 Assets: find every image/audio file not referenced by the game (manifest, code, prepare-art, docs) and move them into ONE folder (e.g. `unused-assets/`, outside `public/` so they don't ship), including the raw drop-in images in the project root once they're processed into art-source. Keep art-source originals that feed the pipeline. Report the list.
- QA-2 Accounts & saves (item 32 + save edge cases): multiple users with multiple villages, local and Supabase backends, session switching, save isolation, migrations v1 to v7, corrupt and old saves, offline/online.
- QA-3 Performance & stability: low-spec devices (CPU throttling, low memory, texture sizes, particle counts, low-quality fallback) and high rounds (waves 100/200/500+: NaN/Infinity, enemy caps, memory leaks, save size, fps), plus gameplay edge cases (selling mid-wave, zero gold/RP, max levels, destroyed labs or stations, spells at the map edge).
Phase B (after A, since it touches everything):
- QA-4 Cleanup & release: remove redundant features and code (dead code, unused exports and helpers, duplicate logic, stale comments), a full error sweep (tests, build, browser console, warnings), leftover fixes (How To Play Fuel Station label overlap), then item 37: version bump plus CHANGELOG/README for everything since v0.4.1.
- QA-4 leftovers from QA-1: UNLOADED_FILES still names the missing `game_map`; docs/START_HERE.md and docs/BUILD_CHARTER.md mention public/assets/images/game_map.png (original at docs/archive/game_map_v1.png); TEX.heroCrown unused (HealthBar uses the literal 'ui_hero_crown'); docs/POWERPOINT_BRIEF.md line ~108 lists ui_title_background.png (now in unused-assets/).
- QA-4 leftovers from QA-2: CHANGELOG entries for the 9 account/save fixes; README security notes still describe the old Village Hall cap; mention supabase/migration-2026-11-20-base-limit-lock.sql and the pending schema.sql check_base() re-run in the release notes.
- QA-4 leftovers from QA-3 and the sync fixes: CHANGELOG entries for the Graphics setting (Auto/High/Low), performance work (src/phaserPerf.js arc/triangulation caching, gnome lookup, floating-text pool, health-bar redraw), Baby Car burst cap, NaN-dt guard, spell cast checks, locked-audio skip; two-tab guard, stale-write rejection, Play Offline, per-account device copies, revision-based merge. Release notes must tell the user to apply supabase/migration-2026-11-20-base-limit-lock.sql and migration-2026-11-20-base-revision.sql (or re-run schema.sql).
