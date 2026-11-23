# Changelog

The version shows in the bottom-left corner of every screen (`package.json` `version` plus the commit). Details for everything below are in [README.md](README.md).

## 0.8.9

4x wave speed. Saves and settings load as they are.

### Changes
- **4x wave speed** (src/logic/fastForward.js, UIScene `toggleFast` / `styleFast`): the 2x toggle is now a three-step button, `WAVE_SPEEDS` [1, 2, 4]: each press (or T) goes off -> 2x -> 4x -> off (`nextWaveSpeed`). At 4x GameScene runs the same capped step four times a frame during a wave (`stepsPerFrame` returns the speed), so the wave plays out exactly as at 1x (tests/fastForward.test.js: same result in a quarter of the frames); between waves it's still 1x. The button reads "2x" (grey when off, orange with a pulsing ring at 2x) and "4x" (red, faster pulse). New `getWaveSpeed` / `setWaveSpeed` / `toWaveSpeed`; `isFastForward` / `setFastForward` / `FAST_FACTOR` (2) kept. Settings: `fast` in ibtd.settings is `true` for 2x (as before, so a 0.8.8 setting loads as 2x) and `4` for 4x (save.js `loadWaveSpeed`, `saveFastSetting(storage, speed)`; `loadFastSetting` = speed > 1); `saveGraphicsSetting` and `saveSettings` keep it. How to Play explains the three steps.

## 0.8.8

A smaller F.L.O.C.K Mothership. Saves load as they are.

### Changes
- **Presentation** (docs only): `docs/presentation/Italian_Brainrot_TD_v0.8.8.pptx` replaces the v0.8.6 deck. The last slide has all 24 enemies as cut-outs behind its panel (now 80% opaque) and around the app icon; every screenshot and app icon is clipped to rounded corners matching its frame (slide 2's icon now sits inside its ring); the title slide says v0.8.8. POWERPOINT_BRIEF.md matches. (The game's own icons already had smooth rounded corners: favicon-32/192 and icon-512 have anti-aliased transparent corners; apple-touch-icon and icon-maskable stay full-bleed, as iOS and Android round them.)
- **F.L.O.C.K Mothership smaller:** `CONFIG.merges.flock.art.scale` 1.25 -> 0.7, so its base fits inside its 1x1 tile and the plot's rim (GameScene `drawPlots`) shows around it. On a 1x1 tile even the Level 10 F.L.O.C.K Tower (`SPRITE_SCALE.flock` 1.15) covers its rim, so the Mothership is now drawn a little smaller than it. `standInScale` (unused: the picture exists) stays 1.25. ZapFx's emitter follows the picture's top, so the zaps still leave from it.

## 0.8.7

Shots leave merged defenses and the Hatsune Queen's crossbow from the right spot, and a smaller Harpoon Ballista. Saves load as they are.

### Changes
- **Harpoon Ballista smaller:** `CONFIG.merges.spear.art.scale` 1.25 -> 1.15.

### Bug Fixes
- **Merged defenses' shots left from the wrong spot:** ProjectileView placed every tower's shot at its kind's `MUZZLE` share of the picture's height over its center, which didn't fit the merged pictures (the Mega Cannon's barrel mouth is off to one side, the Missile Silo's nose is up front, Gandolf the Grand's staff is on top), and line shots (the Harpoon Ballista's spears) ignored the muzzle and flew 30 px over the footprint's center from the start. New `MERGED_MUZZLE` in BuildingView.js gives the muzzle on each merged picture, per facing (x = share of the width from the left, y = share of the height from the bottom; mirrored if the sprite is flipped), and `BuildingView.muzzlePoint()` turns it into screen px. ProjectileView's `launchOffset` uses it first (`fromMuzzle`); a line shot from a muzzle starts there and settles to its flight height over its first `LINE_BLEND` (1.2) tiles. HarpoonFx's chain and NetFx's Sky Net rocket start from it too. Checked in a running game: the first frame of every merged shot sits on its muzzle (the mortar's 6 px is its arc).
- **Hatsune Queen's bolts left from her waist:** HeroView drew them from her ground spot, `BOLT_LIFT` (34 px) up. New `HeroView.crossbowTip`: from `CROSSBOW_TIP` ({ x: 0.37, y: 0.79 }) of her shooting picture (`hero_queen_attack`, sized by `QUEEN_VIEW.height.attack`), on the side of her target; the side offset blends away as the bolt homes in. Checked in a running game: a bolt's first frame is 21 px to the side and 52 px over her feet, the crossbow's tip, mirrored when she aims left.

## 0.8.6

The Harpoon Ballista's own picture, and an updated presentation. Saves load as they are.

### Changes
- **Harpoon Ballista art:** the user's four facing pictures (`Spear_Thrower_Merged.zip`, now in unused-assets/root/) are `art-source/buildings/bld_spear_merged_dl/_dr/_ul/_ur.png` (new prepare-art rule `bld_spear_merged_(dl|dr|ul|ur)`: one shared 384 px box, 384 x 512 webp). `CONFIG.merges.spear.art` is now `{ key: 'bld_spear_merged_dl', facings: { dl, dr, ul, ur }, scale: 1.25 }`, so BuildingView turns it toward its target and looks around when idle like the Mega Cannon, and the gold-glow stand-in (the Level 10 Spear Thrower drawn 1.25x) is gone. The What's New entry "Spear Throwers can merge" (0.8.3) now shows it (`icon: { texture: 'bld_spear_merged_dl' }`, was the Level 10 picture). Windows (merge window, Info, How to Play) show the down-left picture. The old `bld_spear_merged` key was never drawn (no file), so nothing else changes.
- **Presentation:** `docs/presentation/Italian_Brainrot_TD_v0.8.6.pptx` replaces the v0.8.3 deck: the Harpoon Ballista's new picture and all seven painted ability icons (in gold boxes) on the merging slide, the new gear badge on the Mastery slide, the armor shield on Bri Bri Bicus Dicus's card, and Brady Messick credited as the game's creator (title slide, "Created by Brady Messick." team slide: the game concept, the design and every part of the game; art credit shared with Cole Martin; speaker notes to match). docs/POWERPOINT_BRIEF.md matches.

## 0.8.5

Player cards, the leaderboard and Find Players all show the same, per-village numbers; a tesla-style Triple Zap; painted merged ability icons, a new merge gear and an armor shield. **Database:** run `supabase/migration-2026-11-23-village-ranks.sql` (after the 0.8.4 leaderboard fix). Saves load as they are.

### Changes
- **Painted icons** (the user's art): the 7 merged ability icons `art-source/ui/ui_ability_rolling_thunder / ballista_bolt / triple_strike / sky_net / shall_not_pass / triple_zap / reel_in.png` (new prepare-art rule `ui_ability_*`: 192 px box, trimmed), shown by MergeIcons.js `abilityIcon` inside its gold box instead of the drawn symbols (which stay as the fallback); a new `ui_merge_gear.png` (same key and size, the old one is `unused-assets/root/Gear Icon Image.png`); and the armor shield `ui_armor_shield.png` (`TEX.armorShield`, 64 px), drawn by HealthBar.js `armorShield()` past the right end of an armored enemy's health bar (Bri Bri Bicus Dicus) while its armor holds, at 1.75x the bar's height, instead of the drawn kite (kept as the fallback).
- **Triple Zap look** (new src/objects/ZapFx.js; GameScene's `flockZap` handler): the zaps were drawn once as a jagged, zigzag bolt (13 px jitter per segment) that faded in place. Now each is a tesla-style beam redrawn every frame for `LIFE_MS` (350 ms): a straight glow / beam / white core from the tower's emitter (10 px under the top of its picture) to the target's body, two thin crackle arcs re-randomized every frame (pinned to the beam at both ends), a spark burst on the target and a glowing orb on the emitter; it follows a moving target and fades over the last 45%. Low graphics: the beam only. The zap logic was checked in a running game (every ~1 s, the 3 closest enemies within 5.5 tiles, ground and air, 60 x its own mark = 84 each at Level 10; enemies past 5.5 tiles untouched) and is unchanged.

### Bug Fixes
- **Card rank didn't match the leaderboard** (`get_player_profile`, PlayerCardWindow.js): the card's rank counted players with a higher all-time best wave (`player_stats`), while the leaderboard ranks villages, so clicking a row could open a card with another rank. `rank` is now the board rank of the player's best village (the same `rank() over (order by best_wave desc, best_wave_at asc nulls last)` as `get_village_leaderboard`); "Furthest wave" / "Village Hall" are their villages' best (`max(bases.best_wave)` / `max(bases.town_hall)`; the all-time stats only with no villages left, so a deleted village no longer shows); each village in `bases` carries its own board `rank` and they're listed in board order. The card shows `#rank` on every village row, labels the tile "Best rank", and marks the village it was opened for: `get_village_leaderboard` returns `base_id` (only for villages whose name it shows: public or your own), LeaderboardWindow passes it (`onOpenPlayer(username, baseId)` -> TitleScene `openPlayerCard(username, baseId)` -> `focusBaseId`), and Back from a visit reopens the card on the village visited (`reopenBase`). `search_players` uses the same village numbers (a `lateral` max over the player's villages). LocalBackend matches (`villageOrder`).
- **Village Hall shown as 11:** databases that ran the 0.8 code before the 0.8.4 leaderboard fix stored `bases.town_hall` (and `player_stats.best_town_hall`) capped at 11; a village was only corrected on its next save. The migration reads each village's level from its save once, with the tables' triggers off (`disable trigger user`), so no wave counting runs and no village revision moves (open games keep saving), then raises each player's best to their villages'.
- **SQL files in step:** spam-guard, leaderboard-fix, village-ranks and schema.sql now all define the same, newest `get_village_leaderboard` (dropping both older signatures first), `get_player_profile` and `search_players`, so re-running any of them can't fail on a changed return type or undo another; migration-2026-11-21-player-profiles.sql is marked superseded. Checked in PGlite from the v0.7.1 schema through all three migrations, re-runs in any order, and a fresh project.

## 0.8.4

The leaderboard works again on databases that skipped the v0.8 migration, a "Something went wrong" window instead of a frozen screen, friendly server errors, and a slightly smaller Mega Cannon. **Database:** run `supabase/migration-2026-11-23-leaderboard-fix.sql` (the game falls back to the per-player leaderboard until then). Saves load as they are.

### Changes
- **Crash window** (new src/objects/CrashOverlay.js, installed in main.js): an error inside a frame stops Phaser's loop (RequestAnimationFrame never schedules the next step), which froze the screen. `installCrashGuard` listens for window `error`, waits `CRASH_CHECK_MS` (1.5 s; longer while the tab is hidden) and, if `game.loop.frame` hasn't moved, shows a DOM window in the game's style (slate header, stone body, red message): Keep Playing (`loop.sleep()` + `loop.wake()`: the loop restarts, the broken frame is skipped) and Reload. Errors that don't stop the loop are only logged. `crashMessage` never shows stack traces or code words.
- **Friendly server errors** (supabaseBackend.js `friendlyError`): "column / relation / function ... does not exist" reads "This isn’t available on the server yet. Try again later."; any other database error with a Postgres SQLSTATE or PostgREST code (except P0001, which our functions raise with player-facing text) reads "Something went wrong on the server. Try again in a moment." (details to the console). The Profile window's rank says "Unavailable" when online but the server didn't answer (was "Offline").
- **Mega Cannon smaller:** `CONFIG.merges.cannon.art.scale` (and `standInScale`) 1.15 -> 1.08.

### Bug Fixes
- **Leaderboard: "column b.best_wave_at does not exist"**: the paged `get_village_leaderboard` (0.8.3, migration-2026-11-22-spam-guard.sql) reads `bases.best_wave_at`, added by migration-2026-11-22-v0.8.sql; a database that never ran that one got a leaderboard that failed with the raw SQL error. New `supabase/migration-2026-11-23-leaderboard-fix.sql` has everything the v0.8 migration does (the `best_wave_at` column filled in from `updated_at`, its index, the other check_base columns if missing, check_base / keep_bests with Village Hall caps of 15 and their triggers) plus `rate_limits` / `rate_limit_hit` and the paged leaderboard, so it works whichever ran before; safe to re-run. migration-2026-11-22-v0.8.sql no longer creates the old one-argument `get_village_leaderboard` (it drops it): next to the paged one it made calls ambiguous. In the game, `isServerSetupError` (paging.js: PGRST202, 42703, 42P01, 42883) sends the leaderboard to the per-player `get_leaderboard` instead of failing. Checked in PGlite from the v0.7.1 schema: reproduced, fixed, saves and Village Hall 15 go through, any order of the three migrations, and a fresh project.

## 0.8.3

Spear Throwers mergeable into the Harpoon Ballista (Reel In), the F.L.O.C.K Mothership's own picture, new achievement sounds, a fix for visits getting stuck, no more free path reset after merging, a cleaner edit mode, audio and asset credits, a smaller Gandolf the Grand and smaller F.L.O.C.K Towers, spam guards on log in and player search, and pages on the leaderboard and Find Players. **Database:** run `supabase/migration-2026-11-22-spam-guard.sql` (the game works without it, with only its own guards). Saves load as they are (an unused free reset in an older save is dropped).

### New Features
- **Harpoon Ballista** (`CONFIG.merges.spear`, new src/logic/harpoon.js, chain drawn by new src/objects/HarpoonFx.js): two Level 10 Spear Throwers merge (280,000 gold + 3,000 Burgers; x2 health and damage, `fireIntervalMult` 1, +0.5 range; stand-in art: the Level 10 picture drawn 1.25x with the gold glow until `bld_spear_merged` exists). **Reel In** (`harpoon: { every: 3, pull: 3, pullSeconds: 0.4, bossSlow: 0.5, bossSlowSeconds: 2, dragRadius: 0.6 }`): combat.js `shoot` counts throws (`b.harpoonCount`, `harpoonDue`); every 3rd is thrown by `throwHarpoons` at the toughest valid target (highest current hp, ground or air) as a normal merged spear line carrying `p.harpoon`. When that line hits its target, `hookEnemy` drags it `pull` tiles opposite its heading (`-e.vx/-e.vy`; away from the tower when still): `e.reelT/reelLeft/reelDx/reelDy`, stepped by `stepHarpoons` (after `stepFlockZaps` in simulate.js) with motion.js `knockback` for ground enemies (stops at walls and buildings, which ends the drag) and `moveToward` for flyers. The hooked enemy is held for `pullSeconds` (`applyStun`, so a Quandale dash ends with no impact). Bosses get `applySlow(0.5, 2)` instead. Emits `harpoonHit` { sourceId, targetId, x, y, boss }; GameScene floats "REELED IN!" / "SLOWED" with `sfx_catapult_impact` (capped, 60%), and HarpoonFx draws a chain from the tower's top to the enemy while it's dragged. Mastery (1,200 / 2,000 / 3,000 Burgers, RV Lab 3 / 4 / 5): Longer Chain (`harpoonPullAdd: 2`), Dragnet (`harpoonDrag: 0.25`: enemies within 0.6 tiles of the dragged one take 25% of the harpoon's hit, once per harpoon each), Double Hook (`harpoonHooks: 2`). No pierce, bleed, vulnerability, slow or stun added (the Spear Thrower's perks have those). Nothing is saved (enemies are cleared at wave end; `harpoonCount` isn't serialized). Ability icon `ui_ability_reel_in` (stand-in: a hook on a chain, MergeIcons.js).

### Changes
- **New merged F.L.O.C.K picture:** `art-source/buildings/bld_flock_merged.png` is the user's "F.L.O.C.K Tower Merge Image" (prepare-art: 384 x 558 webp). `art.scale` stays 1.25 (the stand-in's size), so the Mothership no longer uses the gold-glow stand-in. The What's New entry "F.L.O.C.K Towers can merge" (0.8.2) now shows it (`icon: { texture: 'bld_flock_merged' }`, was the Level 10 picture).
- **Achievement sounds:** `sfx_achievement.mp3` is the user's new "Achievement Unlocked Sound" (the unlock toast, UIScene `nextToast`); the old one moved to the new `sfx_achievement_claim.mp3` (`SFX.achievementClaim`), played by the Claim button in AchievementsWindow.js `claim` instead of `sfx_coin_collect` (which stays as the fallback if the file is missing).
- **No free path reset after merging:** merge.js `mergeBuildings` no longer sets `state.freeRespecs`; abilities.js `hasFreeRespec` and the free branch of `checkRespec` are gone (it always returns the normal `respecCost`, no `free` flag); GameState drops `freeRespecs` (constructor, `loadFromSave`, `respecPath`); the RV Lab reset button (AbilityWindow.js) is always the purple "Reset path · <price>" with the normal confirm text (no gold "Free Reset" / "From merging"). save.js no longer writes `freeRespecs` (`serializeFreeRespecs` / `deserializeFreeRespecs` removed from merge.js), but `validFreeRespecs` still checks it in older saves, so a v0.8.0-0.8.2 save that has it stays valid (and one with a bad list stays invalid); it's then ignored, so any unused free reset is dropped. Still save version 7.
- **Edit mode without perk pips:** new `GameScene.showPips()` (false in edit mode); BuildingView's label update leaves out the 5 perk pips and the Mastery stars when it's false (on every building, hovered and selected too), so the chip is sized as the level badge alone (plus the merge gear on merged buildings) and stays centered over the building. Health bars unchanged; nothing changes outside edit mode.
- **Gandolf the Grand smaller:** `CONFIG.merges.wizard.art.scale` 1.3 to 1.2 (other merged types unchanged).
- **Missile Silo bigger:** `CONFIG.merges.firework.art.scale` 1.22 to 1.32 (the stand-in scale is unchanged).
- **F.L.O.C.K Towers 10% smaller:** BuildingView.js `SPRITE_SCALE.flock` 1.28 to 1.15 (every level). The merged Mothership is drawn `CONFIG.merges.flock.art.scale` (1.25, unchanged) times that, so it shrank by the same 10%.
- **Credits sections:** src/credits.js now has `CREDITS_SECTIONS` (Team, with Brady Messick's fuller credit on two lines: a `role` can be a list of lines; Audio: Supercell and Pixabay sound effects; Assets: Supercell inspiration, ChatGPT AI-generated images; Font & Engine: the existing notes) and `CREDITS_DISCLAIMER` (Supercell's Fan Content Policy notice). SettingsWindow.js `buildCredits` draws each section under a small accent heading between faint rules, people in one shared name | role split, and the notice in small print at the bottom; `layoutCredits` shrinks the gaps, then the text, a step at a time if it would run past the window.
- **Paging** (new src/net/paging.js; LeaderboardWindow.js, PlayerSearchWindow.js; supabaseBackend / localBackend; SQL in migration-2026-11-22-spam-guard.sql and schema.sql). The leaderboard pages through every village, `LEADERBOARD_PAGE` (10) a page, with arrows beside the subtitle ("places 11-20"); your best village shows under the page when it isn't on it. Find Players asks the server for each page, `SEARCH_PAGE` (8), instead of 50 rows cut up in the game; Back / Next and "Page n", through the same spam guard as searching (`request()` with `wantPage`; paging uses the filters of the last search). Both ask for a page plus one row to know if there's a next page. Server: `get_village_leaderboard(lim, off)` returns `pos` (place in board order; `rank` stays the shown rank, shared by ties) and the villages at pos off + 1 .. off + lim (lim <= 100, off <= 10,000) plus the caller's best village; it's plpgsql now, 40 calls a minute (`rate_limit_hit('leaderboard')`). `search_players` gains `off` (<= 10,000). The old signatures are dropped (an older game still works: `off` defaults to 0). Game side: `backend.leaderboardPage(offset, limit)` -> `{ rows, mine, hasMore }` (`boardPage`); `searchPlayers({ ..., offset })`; until the migration runs, both fall back to the old calls (`isMissingFunction`: PGRST202) and cut the page in the game (the leaderboard then reaches place 100 at most). `backend.leaderboard(limit)` is unchanged (the Profile window's rank).
- **Spam guards** (new src/net/spamGuard.js, new supabase/migration-2026-11-22-spam-guard.sql, also in schema.sql). Game side: AuthScene waits after repeated failures (`createAuthGuard`: 3 free tries, then 5 / 10 / 20 / 40 / 60 s, cleared by a success; lost connections don't count) and allows one confirmation email per 30 s; PlayerSearchWindow runs one search at a time, `SEARCH_GAP_MS` (1,000) apart, merging presses in between into one search with the newest filters. Server side: `rate_limits` table (RLS on, no policies or grants) and `rate_limit_hit(act, max_calls, per_secs)` (security definer, not callable by players): `search_players` 20 / min, `get_player_profile` 40 / min, `get_player_base` 40 / min per player, then "Too many requests" (friendlyError: "Too many tries. Wait a minute and try again."). Those three are plpgsql and volatile now (they write the counter; supabase-js rpc posts them, so nothing changes in the game). `search_players` cuts `q` to 16 characters; `get_player_profile` returns null for a name over 16; `username_available` returns false for anything outside `^[A-Za-z0-9_]{3,16}$`. Reviewed and unchanged: no SQL is built from text, player text is drawn on the canvas (no HTML), inputs have `maxLength`, usernames are checked by `profiles_username_format`, and the game has no AI model to prompt-inject. Checked in PGlite (schema.sql + the migration, re-run, 20 checks) and in the browser.

### Bug Fixes
- **Find Players sort buttons past the edge** (PlayerSearchWindow.js `drawFilters`): three 128 px toggles from `left + 360` ended 32 px past the window's inner edge, so "Achievements" was cut off. They now share the room left of the row (`sortLeft` = left + 348 to the inner edge, about 121 px each, labels fitted). The 8 result rows are a little tighter (`ROW_H` 40 -> 38, `ROW_GAP` 4 -> 3) so the page arrows (now at H - 32) no longer cover the last row.
- **Fresh database setup failed** (supabase/schema.sql): `get_village_leaderboard` read `profiles.public_bases` before the file added that column, so running schema.sql on a new project stopped with "column p.public_bases does not exist". The column is now added right after the profiles table. Existing databases already have it.
- **Second visit stuck** (src/scenes/VisitScene.js, VisitHudScene.js): the VisitHudScene object lives on between visits, and VisitScene.create launches it and calls `setStatus('Loading village…')` before it has started again, so it set text on the last visit's destroyed `statusText` (`Cannot read properties of null (reading 'drawImage')`). The exception ended VisitScene.create, so the screen stayed stuck on every visit after the first (Visit / Visit Best Village after Back, and the village switcher's restart). VisitHudScene now forgets its texts and card on `shutdown` (and in `init`), and VisitScene only talks to the HUD once it's running (`hudReady()`: setStatus, showVillage, showBuilding, covers); the HUD shows the village's title itself if it arrived first.

## 0.8.2

Gandolf Towers back to 6 and mergeable into Gandolf the Grand (You Shall Not Pass), F.L.O.C.K Towers mergeable into the F.L.O.C.K Mothership (Triple Zap), a new Encore Cloak icon, heroes sleeping at their altars at night, a steadier gold Mastery column, and boxed ability icons. No database change; saves load as they are.

### New Features
- **Gandolf the Grand** (`CONFIG.merges.wizard`, new src/logic/wizardWall.js, drawn by new src/objects/WallFx.js): two Level 10 Gandolf Towers merge (307,200 gold + 3,000 Burgers; x2 health and damage, +0.5 range; art `bld_wizard_merged`, `art.scale` 1.3). **You Shall Not Pass:** every 10 s (`wall.every`), with a ground enemy in range, a wall 3 tiles long stands for 3 s across the way the biggest ground crowd in range is walking (the crowd's average `vx`/`vy`; toward the tower if it's standing still), 1 tile ahead of it and at least 1.5 tiles from the tower. Ground troops within 0.45 tiles of it are held (`applyStun`, 0.2 s renewed every step, so a Quandale dash ends there), bosses slowed 50%, flyers and burrowed tunnelers pass. Mastery: Wider Wall (+1.5 tiles, +1 s), Searing Ward (held enemies burn for 30% of his shot damage per second), Double Cast (a second wall the same distance behind the crowd). Walls live in `state.barriers` (not saved, cleared at wave end); `stepWizardWalls` runs after the Sky Nets in simulate.js. GameScene's `wallRaised` shows "YOU SHALL NOT PASS!" over the tower with a thump, a small shake and one of Gandolf's voice lines.

- **F.L.O.C.K Mothership** (`CONFIG.merges.flock`, new src/logic/flockZap.js): two Level 10 F.L.O.C.K Towers merge (150,000 gold + 3,000 Burgers; x2 health, +0.5 range, marks +5% via `markAdd` in flock.js; stand-in art: the Level 10 picture drawn 1.25x with the gold glow until `bld_flock_merged` exists). **Triple Zap:** every 1 s it zaps the 3 closest enemies within 5.5 tiles (its own zap range, shorter than its marking), ground and air, 60 damage each (a normal hit, so its mark and armor apply). No zaps while silenced by John Pork or stunned. Mastery: Fourth Bolt (4 targets), Overcharge (x1.5 on enemies under half health), EMP Pulse (every 12 s stuns everything in zap range 0.75 s; bosses slowed 50%). `stepFlockZaps` runs after the walls in simulate.js; GameScene's `flockZap` draws a jagged blue bolt to each target (gone in about 0.3 s) with `sfx_spell_lightning` at 30%, and `flockEmp` an "EMP!" ring. `fightStats` reports its zaps (the merge window shows "- -> 3 x 60"); its Stats tab shows its range / mark bonus with the merge and a zap bar, and merges may set their own `description` for the Info tab. Ability icon `ui_ability_triple_zap` (stand-in: three bolts).

### Changes
- **Heroes sleep at night** (just for looks; hero.js `bedtime` / `restAtNight` / `wakeFromRest`, used by both heroes): when it's dark (`isDark(state.clock)`) and no raid is on or counting down (`isWaveInProgress`), a hero with nothing to do walks home to its altar's center (roam speed; snapped there after 20 s if it can't reach) and lies down (`h.resting`, not saved): HeroView shows the sleeping pose, "z Z" and the Brisket King's snoring, and the Hero tab says "Sleeping (night)". No healing, no timer. A raid's countdown (or daylight) gets it up with a 0.8 s wake-up (`heroWaking` / `queenWaking` with `night: true`). A healing nap that ends at night goes straight into night rest.
- **Encore Cloak icon:** the user's cloak picture as `art-source/ui/ui_encore_ready.png` (the key EncoreIcon.js already used; prepare-art rule width 192). It's loaded at boot, so the drawn teal music-note disc is now only a fallback; the icon over her is 32 px wide (was 28).
- **RV Lab Mastery column** (AbilityWindow.js): the outline is steady (v0.8.1's pulse removed); every tier name and status line is in gold tones (`MASTERY_INK`), available tiers get a gold outline instead of green, and the hover tint is gold.
- **Merged ability icons** (src/objects/MergeIcons.js `abilityIcon`): a glossy gold rounded box (`drawGlossy`) instead of a disc, with the art or the drawn symbol inside; bigger everywhere (building panel 40 -> 56 px, merge window 40 -> 60, How to Play 30 -> 40). New stand-in symbol for `ui_ability_shall_not_pass` (a staff and a wall).

### Balance
- **Gandolf Towers back to 6** (`limits.wizard` `[0,0,1,1,2,2,3,3,4,4,5,6,6,6,6]` as in v0.8.0; `limits.mortar` back to ending `5,5,5,5,6,6`): VH12 gives +1 Gandolf again instead of a Litman Mortar. A village that built a VH12 Mortar in v0.8.1 keeps it as an over-limit building (`overCap`).

## 0.8.1

Fewer Gandolf Towers, bigger merged shots, a pulsing Mastery column, a new app icon, the new Litman Triple Mortar picture, and the Hatsune Queen's shot sound. No database change; saves load as they are.

### Changes
- **Merged shots drawn bigger** (src/objects/ProjectileView.js): `MEGA_BALL_WIDTH` 26 -> 40 (a cannonball is 14); other merged shots use `MERGED_SCALE` (cannon 2.6, firework 1.8: the Missile Silo's rockets), flagged by `p.merged` set in combat.js `fireProjectile`. `attachRocketFx(scene, sprite, lightKey, k)` scales the rocket's glow and trail with them.
- **RV Lab Mastery column** (AbilityWindow.js `masteryAura`): the sparkles are gone; the gold glow pulses (alpha 1 to 0.1, 750 ms yoyo) only while a Mastery tier is available and affordable, otherwise it stays still at 35%. The header text is white with the outline, like the path headers. (The 3 Mastery stars on a merged building's label chip stay.)
- **New merged Mortar picture:** `art-source/buildings/bld_mortar_merged.png` is the user's "Litman MultiMortar Image V2" (same framing, so `art.scale` 1.24 is unchanged).
- **App icon:** the start screen's background with the game logo centered, as plain files (no script): master `docs/branding/app_icon.png`; `public/apple-touch-icon.png` (180) and new `icon-maskable-512.png` are square (the OS rounds them); `favicon-32.png`, `favicon-192.png` and new `icon-512.png` have rounded app corners. `manifest.webmanifest` lists 192 / 512 (any) and 512 (maskable).

### Balance
- **Gandolf Towers capped at 4** (`CONFIG.limits.wizard` `[0,0,1,1,1,2,2,2,3,3,4,4,4,4,4]`, was up to 6): one at VH3, VH6, VH9 and VH11. VH12 gives +1 Litman Mortar in its place (`limits.mortar` now ends `5,5,6,6,7,7`). Defense totals per hall: VH10 39, VH11 44, VH12-15 46 / 49 / 53 / 55. Villages over the new cap keep their Gandolfs (`overCap`: they work but block building more).

### Bug Fixes
- **Hatsune Queen's shots were often silent:** `queenShot` played `SFX.arrowFire` through `playSfxCapped(..., ENEMY_HIT_MAX)`, which skipped it while 4 arrow sounds were playing (several Locklair Towers). It now plays `FIRE_SFX.archer` with `playSfx`, like a Locklair Tower's shot.

## 0.8.0

A second hero (the Hatsune Queen), defense merging, two new enemies, Village Halls 12-15 (Bonus Slots removed), 2x wave speed, a per-village leaderboard, selling removed, and fixes. Saves load as they are (still save version 7; villages over the new caps keep their buildings). **Database:** run [supabase/migration-2026-11-22-v0.8.sql](supabase/migration-2026-11-22-v0.8.sql) (or all of schema.sql): it raises the server's Village Hall cap to 15 in `check_base()` / `keep_bests()` (without it, villages still save, but a Village Hall 12-15 village shows as 11 on the leaderboard and in player search) and adds the per-village leaderboard (`bases.best_wave_at`, kept by `check_base`; `get_village_leaderboard(lim)`). v0.7.2 never shipped; its changes are listed here.

### New Features
- **Hatsune Queen** (second hero; `CONFIG.queenAltar`, src/logic/queen.js, src/logic/heroes.js, HeroView `QUEEN_VIEW`; art `bld_queenAltar_lv1`-`lv5`, `hero_queen` / `_attack` / `_sleep`, sound `sfx_queen_select`): her own 2x2 altar (`queenAltar`, 1 allowed from VH8; 25,000 gold, Levels 2-10 1,500-9,500 Burgers needing VH8-15). Ranged crossbow hero (bolt every 0.8 s, range 5, guard range 8, speed 1.4; 2,400-4,602 HP, 160-288 per bolt), hits ground and air, backs off from ground enemies closer than 2.5 tiles, sleeps/KO like the Brisket King (`heroSleep` on her altar). **Encore Cloak** (hotbar, key G, once per wave): untargetable 4 s, bolts +150% and pierce 2, heals 30%. RV Lab tree (3 x 5): Sharpshooter (Sharp Tips, Long Draw, Critical Note, Piercing Bolt, Headliner), Idol (Warm-Up, Backup Chorus, Encore+, Fan Favorite, Sold Out Show), Stagecraft (Stage Armor, Quick Step, Dodge Roll, Understudy, Curtain Call). `state.queen` / `state.queenBolts` aren't saved (rebuilt from her altar), so older saves load and re-save unchanged; `save.js` allows `heroSleep` on both altar types (`HERO_TYPES`). Ground enemies fight the nearest awake, visible hero; flyers never attack heroes. Frigo's chill reaches her too.
- **Defense merging** (`CONFIG.merges`, src/logic/merge.js, src/logic/skyNet.js; Cannon, Locklair Tower, Litman Mortar, Firework Launcher): two Level 10 copies of a mergeable type merge into one (`b.merged`), which still counts as 2 toward the limit (`countOwned`; merging frees no slot); between waves only; one merge level. Cost gold + 3,000 Burgers (76,800 / 128,000 / 204,800 / 256,000 gold). about two buildings' worth: x2 health, +0.5 range (Mortar +1), plus: Mega Cannon (x3.2 damage per shot at x1.6 interval, 2x DPS; **Rolling Thunder** ball rolls 4 tiles through ground enemies, end burst), Locklair Citadel (x2 damage; **Ballista Bolt** every 5th shot 4x + 1 s pin, bosses slowed instead; a pin ends Quandale's dash), Litman Triple Mortar (**Triple Strike**, 3 shells at x0.67; heavy perks on the main shell only, `sideShellDrops`), Missile Silo (the merged Firework Launcher; x2 damage; **Sky Net** every 6 s pulls the biggest flyer group together and slows 50% for 3 s; ground too with Ground Show; bosses only slowed). **Mastery** per type (`state.mastery[type]`, 3 tiers, 1,200 / 2,000 / 3,000 Burgers, RV Lab 3 / 4 / 5) as a gold 4th column in the RV Lab window (with a breathing gold glow and twinkling sparkles; a merged building's label chip adds 3 Mastery stars after its 5 perk pips and its Stats tab a "★ Mastery n/3" line; the free respec button reads "Free Reset"; opened on it by a gold Mastery button on the merged building's panel and quick bar; research plays `sfx_ability_unlocked`); each merge grants a free respec for that type (`state.freeRespecs`), which doesn't reset Mastery. Timed perk specials get only the DPS gain (`mergeDpsMult`). UI: a gold Merge button in place of Upgrade at Level 10 (with the reason when unavailable), pick mode (eligible copies glow, banner + Cancel), one confirm window with the stat preview; a merged building's Info and Stats tabs show its ability row; ability icons `ui_ability_rolling_thunder` / `_ballista_bolt` / `_triple_strike` / `_sky_net` (drawn stand-ins until the art exists, src/objects/MergeIcons.js); merging plays `sfx_merge`; a 28 px gear badge (`ui_merge_gear`) on a gold-rimmed disc left of the level badge with a gap; merged pictures `bld_cannon_merged_dl/_dr/_ul/_ur`, `bld_archer_merged`, `bld_mortar_merged`, `bld_firework_merged_left/_right` (a gold-glow stand-in for future types), drawn bigger than Level 10 (`CONFIG.merges[type].art.scale`: Cannon 1.15, Locklair 1.15, Mortar 1.24, Missile Silo 1.22); the merged Cannon and Missile Silo turn randomly when idle. The normal Litman Mortar is drawn 10% smaller (`SPRITE_SCALE.mortar` 0.65 to 0.585). Saves: `merged`, `mastery`, `freeRespecs` (validated; still save version 7).
- **2x wave speed** (src/logic/fastForward.js): a round 2x toggle beside Start Wave (key T) during the countdown and the wave; GameScene runs the normal capped step twice per frame (never a doubled step), so every timer and collision behaves as at 1x; always 1x between waves. Saved as `fast` in `ibtd.settings`. The server's one-wave-per-30-s credit only delays a fast clear's leaderboard credit.
- **Quandale Dingle** (`quandale`, "Dash Striker", VH7, art `enemy_quandale` / `_attack` / `_death`, sounds `sfx_quandale_dash`, `sfx_quandale_voice`): 380 HP, speed 1.35, 24 per 1 s, bounty 22. `stepDasher` (enemies.js): when his target is `dash.minRange`-`dash.range` (1.5-4) tiles away, his dash is ready (`dash.cooldown` 2 s) and his route needs no wall broken (`e.breakingId === null`), he dashes along his route at `dash.speed` (4.5 tiles/s, at most `maxSeconds` 1.4); reaching the building he lands `impactMult` (3x) damage (`dashImpact`) and stuns it for `dash.stunSeconds` (1.5 s: `b.stunT`, counted down in `stepSpecialEnemies`; `stepDefenses` and `stepBeams` skip stunned buildings; event `buildingStunned`). A wall in the way, a new target or `maxSeconds` ends the dash with no impact. Views: attack pose and afterimages while dashing, "WHAM!" and a small camera shake on impact, stars over a stunned building (BuildingView `drawStun`).
- **Grimace Golem** (`grimace`, "Goo Tank", VH11, art `enemy_grimace` / `_attack` / `_death`): 3,200 HP, speed 0.5, 50 per 2 s, bounty 60. `stepGooTrails` (specialEnemies.js) drops a goo pool (`dropGoo`, pool kind 'goo', `goo.radius` 0.55, `goo.seconds` 6, no damage) every `goo.every` (1) tile; `stepPools` enrages other enemies standing in goo (`e.gooT` = `rageSeconds` 4, x`speedMult` 1.3 speed and x`damageMult` 1.3 damage through `enrageFactor`; no stacking, not Grimaces; event `gooRage`). Where he dies: one pool of `deathRadius` 2 for `deathSeconds` 8. PoolView style 'goo'; enraged troops pulse purple with a glow.
- **Village Halls 12-15** (`rules.maxTownHallLevel` 11 -> 15): costs 300k / 340k / 380k / 410k, HP x1.25 and capacity +500 per level; per-hall unlocks (CONFIG.limits, 15 entries each; `hallUnlocks(level)`): VH12 +1 Tower of Rah, +1 Gandolf; VH13 +1 Diddypult, +1 KSI, +1 Archer, +1 Storage; VH14 +1 Cannon, +1 Mortar, +1 Spear, +1 F.L.O.C.K; VH15 +1 Tower of Rah, +1 Firework, +1 Mine, Storage, House; +12 walls each. The Village Hall Stats tab says what the next level adds. Waves past VH11 grow by `rules.topHallGrowth` (x1.04 count, x1.03 health per hall; `hallWaveGrowth` in enemies.js; VH1-11 unchanged). Halls 11-15 reuse the top hall picture.
- **Leaderboard by village:** one row per village (`get_village_leaderboard`: rank by `bases.best_wave` desc, `best_wave_at` asc; only server-verified numbers; village name hidden when its owner hides their villages, except your own); the player's best village is added when outside the top. LeaderboardWindow shows the village name under the player name. Falls back to the old per-player `get_leaderboard` on PGRST202 until the migration runs. Local backend matches.

### Changes
- **Selling removed** (user): no Sell button for any building or wall; `checkSell`, `sellBuilding`, `sellRefund`, `rules.sellRefund`, the `buildingSold` event and the tutorial's `sell` permission are gone. Every type has a per-hall cap and buildings move in edit mode. Nothing is refunded or removed from existing villages; the no-working-mine free rebuild stays as the gold safety net.
- **Title screen:** Tripi Tropi (the fish giant) is drawn 300 px tall instead of 380 (TitleBackdropScene `ENEMIES`).
- **Bonus Slots removed** (`rules.bonusSlots` and its helpers gone): Village Hall 11 instead gives +1 Tower of Rah, Gandolf, Diddypult, KSI Tower and Cannon over VH10 (defense total +5, as before). Villages with buildings past the new caps keep them (they work, upgrade and move; `overCap`); the shop shows the count in gold ("7/3", "Over the limit") and only blocks building another of that type until under the cap.
- **Themed waves:** `dashGang` (Quandale 60%, Shark 40%; needs quandale) and `gooParade` (Grimace 50%, Grunt 30%, Tank 20%; needs grimace) appended to `waveThemes.order`; both kinds in `headlinerCap`, `OFFSET_KINDS`, `QUEUE_ORDER` and the legacy debut list.
- **Profile buttons instead of Visit on the lists:** leaderboard and Find Players rows end in a green "Profile" button (`profileButton` / `rowButton`, PlayerCardWindow.js, `VISIT_W` 78) that opens the player card, like clicking the row; `onVisitBest` and TitleScene `visitBest` are gone. Visiting is only from the card (village rows' Visit, "Visit Best Village"). TitleScene `visitVillage` passes `from` ('leaderboard' / 'search') to VisitScene (kept through `switchTo`); Back starts TitleScene with `reopenFrom`, which reopens that window and the card on top, so closing the card lands back on the list (Find Players keeps its last filters).
- **Neegy:** role "Summoned Paratrooper" (it was already a summoned sub-troop in How to Play); the Neegy Balloon's stat tile says "2 Neegies".

- **Sounds:** the perk-unlocked sound (`sfx_ability_unlocked`, played for perk and Mastery research) is the user's new "New Perk Unlocked sound" (the old one archived as unused-assets/root/sfx_ability_unlocked_v1.mp3); merging plays the new `sfx_merge`.
- **Edit mode:** a stored merged defense gets its own hotbar card (merged picture + gear; `hotbarGroups` groups by `merged` too, `pickFromHotbar(type, level, merged)`), and its placement ghost / swap preview use the merged picture and size.

### Bug Fixes
- **Whole village drawn as placeholder blocks** (playtester report): a failed or stalled picture request at boot left a placeholder for the whole session (BootScene drew stand-ins and nothing asked again; src/assetLoader.js treated stand-ins as loaded, never retried failures and re-requested a missing picture every frame). Now: BootScene retries missing core pictures 3 times (3 / 4.5 / 6 s, cache-busting `?r=n`) with a "slow to load" status; assetLoader retries failed files after 2 / 6 / 15 s and remembers given-up files (`imageRequested`); missing `bld_*` pictures keep loading after boot and replace their stand-ins safely (temporary key, then re-point views in the same tick); `loader.timeout` 60 s in src/main.js; new src/assetNotice.js shows "Some pictures failed to load (n)" with Retry / Reload page when 3+ stay missing (Retry also on `online`); main.js detects browsers without WebP (older than Safari 14 / iOS 14) and says so, with Play anyway.
- **Hero health bar not full after an altar upgrade:** a hero's `hp` was set at creation and never rescaled when its max health rose (altar level, RV Lab health perk), so the bar looked hurt. New `syncHeroMaxHp(h, maxHp)` in src/logic/hero.js (called from `stepHero` / `stepQueen`) keeps the same share of health; HeroView draws `hp / h.hpMax`. Clicking the Hatsune Queen's altar now plays `SFX.altarSelect` (her voice plays when clicking her).
- **Volume sliders at 0 didn't silence everything:** `setMusicLevel` skipped tracks mid-fade (and fade tweens wrote absolute volumes), ambience only updated in GameScene's update (not while paused), and effects already playing never followed the Effects slider. audio.js now gives music sounds a fade factor (volume = factor x track x level, recomputed on every tick and slider move), `applyAmbience()` runs on slider changes, and `playSfx` / `playVoiceLine` / `playSfxClip` sounds are tracked and rescaled live. Pure helpers in src/logic/volume.js (tests/volume.test.js).
- **Black screen when visiting a village:** VisitScene drew nothing until the village and up to 8 s of building pictures had loaded, and its "Loading village..." status was dropped (the HUD wasn't created yet). The map and camera now start in `create()`, the status is kept (`statusMsg`) and shown, the picture wait is 2.5 s (views swap pictures in as they stream), and any failure shows a message with a Back button (`fail`, logged as `VisitScene: ...`); one bad building view is skipped instead of freezing the frame loop.
- **Title screen buttons locked after visiting a village:** TitleScene kept `this.leaderboard` / `this.search` from before the visit (the scene object is reused and leaving for VisitScene never ran their onClose), so closing the reopened player card set `windowOpen = !!(this.search || this.leaderboard)` back to true and every button ignored clicks until a reload. `init()` now clears both.
- **Enemies drawn as a missing-texture box:** BootScene now gives every enemy kind without art or a placeholder shape a grey stand-in figure, so a picture that hasn't loaded (e.g. a tab opened before new art was added) never shows Phaser's missing-texture box.

## 0.7.1

Polish on v0.7. Saves load as they are (still save version 7). **Database:** if the v0.7 migration ([supabase/migration-2026-11-21-player-profiles.sql](supabase/migration-2026-11-21-player-profiles.sql)) isn't run yet, run it now; it now ends with `notify pgrst, 'reload schema'` so the API sees the functions at once.

### Changes
- **Visiting: building card restyled** (VisitHudScene `showBuilding`): a `drawWindow` with a slate header (name, gold "Level x / y"), a red X, the building's picture on `drawShowcaseCard`, stat rows (Health with perks, Size, and for defenses Damage, Range, Targets; `statRows`) and a glossy chip per researched tier in `PATH_COLORS`. Presses on the card or the top bar no longer reach the map (`VisitHudScene.covers`, checked in VisitScene's pointerdown).
- **Incoming troop markers condensed by default:** each wave marker (WaveMarkers.js) starts as its disc plus one summary chip with the corner's total (`markerChips(entries, open)`, logic/waveMarkers.js); clicking it (`GameScene.handleClick` -> `WaveMarkers.toggleAt`, `markerHit`) opens every kind plus a Hide chip, kept per corner (`open` set) across waves. Mouse hover: 8% bigger with a gold outline and a hand cursor (`hoverAt`, from GameScene's hover check). Not in edit mode; placement and spell aiming take the click first.
- **League badges graded by league:** `leagueBadgeSize(league, size)` (leagues.js, `LEAGUE_BADGE_MIN` 0.85): Bronze 85% of the spot's size, each league +3%, WarLord 100%, then corrected for each picture's shape (`LEAGUE_ART_FILL`, sqrt(w x h) / longer side measured from the art, against 0.93) so a squarish badge (Silver) no longer looks bigger than a tall one (Champion). Used by the leaderboard (36), Find Players (36), player card (62), Profile (118), How to Play / Profile league rows, and the title / HUD corner badges (58 / 52).
- **Green Visit buttons:** the round blue eye buttons (`eyeButton`) on leaderboard rows, Find Players results and player-card village rows are now green rectangular "Visit" buttons (`visitButton(scene, rightX, y, h, onClick)`, `VISIT_W` 72, PlayerCardWindow.js); the card's big button is green "Visit Best Village" without the eye. Find Players' columns moved 30 px left to make room.
- **What's New tabs for past updates:** the window (PatchNotesWindow.js, now 640 px tall) has a tab per minor update under its title (`drawTabs`, `showRelease`; green for the open one): `PATCH_NOTES` ("v0.7 · Latest", new `release: '0.7'`) and the new `PATCH_HISTORY` (patchNotes.js; v0.6 with the 0.6.0-0.6.3 entries, which left the latest tab). `PATCH_RELEASES` lists them; the asset plan keeps every tab's building icons core. CLAUDE.md says how to roll a release into the history.
- **Big Yahu's airstrike hits a single target:** its missile damages only the building it was aimed at (if still standing and hittable), no longer every building and wall within 1.25 tiles; `yahu.missileRadius` is replaced by `missileStrike: true` (the combat.js dispatch reads it). The red warning ring is drawn just around that building (`fireMissileAt` / `stepEnemyShot` in specialEnemies.js). How to Play tag ("Missile strikes (one building)"), description and tip updated.
- **Enemy voice lines:** Bri Bri Bicus Dicus, Frigo Camillo, Brr Brr Patapim, Lirili Larila and Da Baby Car join the random raid chatter (`ENEMY_VOICE`; sounds `sfx_bicus_voice`, `sfx_frigo_voice`, `sfx_patapim_voice`, `sfx_lirili_voice`, `sfx_babycar_voice`; Lirili's line is cropped to 3 s by prepare-audio's `CLIPS`).
- **How to Play: sub-troop buttons.** Rahhh Skeleton, Brr Brr Patapim and the Neegy Balloon have a card button with their troop's picture that opens its page (Skeleton, Chimpanzini Bananini, Neegy), and the troop's page links back.
- **Leaderboard:** the medals are sized by place (36 / 34 / 32 px), and ranks 4 and below sit on a dark badge with a white number (orange on your own row).

### Balance
- **Bri Bri Bicus Dicus:** while its armor holds, hits are reduced by `bicus.armorReduction` (0.3) before they reach the armor (`damageEnemy`: the armor loses the reduced amount, `enemyHit.amount` is the reduced figure, `source: 'armor'` unless another source is set); the breaking hit still does no health damage, and after that it takes full damage. How to Play's tag reads "Armor 450 (-30% damage)", its description and tip mention it, and armored damage numbers are steel blue (`#9fb8d6`, GameScene).

### Bug Fixes
- **Fuel Station text overflow:** its description is shorter (buildingText.js, 11 lines instead of 13) and UIScene's `drawInfoContent` now steps any building's description font down (14 to 11 px) only if it would reach the button stack. Its stat lines (shop popup and Stats tab) are shorter: "Brews Karuba Coffee" / "Spell slots: 5 · 0 brewed" / "Level 2 adds Donut (Heal)" ("Brews N of 6 spells" from level 4, "Every spell unlocked" at max). Brew window cards (FuelStationWindow.js) split the effect into two lines (name, then range and timing).
- **Missing server functions:** a call to a server function that isn't installed ("Could not find the function ... in the schema cache") now says "This isn't available on the server yet. Try again later." (`friendlyError`, supabaseBackend.js) instead of the raw database error.

## 0.7.0

"iBTD fixes and features 3": other players' villages, five new enemies, Brr Brr Patapim reworked, themed waves, a grouped What's New. Saves load as they are (still save version 7; a new optional `debuted` list). **Database:** run [supabase/migration-2026-11-21-player-profiles.sql](supabase/migration-2026-11-21-player-profiles.sql) (or all of schema.sql) for player search, player cards and visiting villages; without it those windows show an error and the rest of the game is unaffected. From this release on, this file and the What's New use the same four groups (format: [CLAUDE.md](CLAUDE.md)).

### New Features
- **Other players' villages.** Leaderboard rows open a player's card and their eye button visits their best village; Settings has **Find Players** (name search, League filter as a wave range, Village Hall filter, sort by furthest wave / Village Hall / achievements; `PlayerSearchWindow.js`). The card (`PlayerCardWindow.js`) shows league, joined date, furthest wave, Village Hall, rank, achievements (newest 8) and their villages best first, each with an eye. Visiting (`VisitScene.js` + `VisitHudScene.js`) draws their saved village read only with the game's building views: pan, zoom, tap a building for its level and perks, switch between their villages, Back reopens the card. "Let others view my villages" in Settings (`profiles.public_bases`, on by default). Server: `search_players`, `get_player_profile`, `get_player_base`, `set_public_bases` (security definer, login required, read only); the local backend has the same.
- **Themed waves** (`CONFIG.waveThemes`, waves.js; replaces `specialWaves`). From wave 2 every wave has a theme rotating through the 16 the hall has unlocked (`order`, `needs`): headliner themes give `share` (about 55%) of the wave's strength to their mix and keep the rest of the normal mix; the 5 old special waves are `pure` themes and keep their +50% bonus. Every 10th wave is a **Boss Wave** (the 4 toughest kinds the wave has at 60%, x1.15 strength, one more Da Baby Car than usual, +100% bonus). A **debut wave** (45% of the wave) introduces each enemy that joins by Village Hall the first time the village can meet it (`state.debuted`, saved; older saves count their hall's enemies as met except the v0.7 ones). Da Baby Cars keep their schedule except on pure themes. Enemies with stacking abilities are capped per theme at 3x their normal count (or +2; `headlinerCap`), the rest of the budget going to the other troops, so a theme never floods the map with Patapims or Frigos. The tip about special waves became a "themes" tip.
- **Bri Bri Bicus Dicus** (`bicus`, VH5): melee legionary with `armor` 450 (scaled like health). While armor is left every hit goes into it, and the hit that breaks it does no health damage (its leftover is lost); `armorBroken` plays `sfx_bicus_armor_break` with steel shards. Its health bar shows a steel armor bar and a shield (HealthBar `armor`). Sword sound = Rahhh Skeleton's. The Tower of Rah counts armor as toughness.
- **Frigo Camillo** (`frigo`, VH6): a cold aura (`chillAura` 2.5 tiles, 35%): defenses fire slower (`towerFireInterval`), the Tower of Rah burns slower and the Brisket King swings slower within it (`b.frigoSlow`, `hero.frigoSlow`, `stepChillAuras`). Slowed defenses shimmer icy blue; a frosty ring follows it; its footsteps play the Freeze spell's sound every 3.5 s (at most one at once).
- **Bombombini Gusini** (`bombo`, VH8): a flyer that breathes fire from 2.5 tiles: full damage to its target, 35% to every building and wall within 1 tile of it (`breatheFire`, `fireBreathFx`).
- **Lirili Larila** (`lirili`, VH9): the earthquake tank (Brr Brr Patapim's old `quake`, numbers and sound unchanged).
- **Chimpanzini Bananini** (`chimp`): dropped by Brr Brr Patapim; targets the nearest building (never walls), jumps walls, hits once (90) and is gone (`kamikaze`, `enemyDive`, no bounty).

### Changes
- **Brr Brr Patapim** reworked and moved to Village Hall 10: he drops a Chimpanzini every 3 s while walking in (not on the path in, not while attacking), up to 8 of his alive (`spawn`). 2,400 HP (was 2,800).
- **How to Play:** every new enemy has its entry, tags and description; a fifth group, **Summoned** (Neegy, Skeleton, Chimpanzini); roster tiles size themselves to fit five groups.
- **Leaderboard medals:** ranks 1-3 show the gold, silver and bronze medal pictures (`ui_medal_1`-`3`, art-source/ui) instead of colored circles (kept as the fallback).
- **What's New is grouped** into New Features / Changes / Balance / Bug Fixes (colored headings, repeated on the next page), each entry tagged with its version (`PATCH_NOTES.sections`). The format guide for agents is in CLAUDE.md.
- **RV Lab building list tidied:** no Brisket King portrait beside the Brisket King Altar any more; each row has its picture in a small tile, its name over slim tier bars (they overlapped the name in the short rows of the 12-defense list), and its "!" inside the row. The list uses the window's full height, and the Defenses / Economy tabs' "!" sits inside the tab instead of over its corner.

### Balance
- **Late waves make room for the new enemies:** `rules.lateKindMaxCut` 0.35 -> 0.55, so each hall's base wave stays within about 5% of its v0.6.3 strength (Village Halls 9-11 would otherwise be 11-18% stronger). Air Raids can bring Bombombini; Sieges bring Lirili Larila instead of Patapim.

## 0.6.3

Saves load as they are (still save version 7).

### Changed
- **Village Hall 11 Bonus Slots take defenses only** (every Defenses and Traps tab building: Cannon to Diddypult, F.L.O.C.K and the Mousetrap). Instead, Village Hall 11 allows one more Mine (7), Storage (6) and House (6). A village that already put economy buildings in Bonus Slots keeps them (they count past the new limits, so no more can be built until it's under).
- **KSI Tower effects in the Gandolf's style:** its bottle flies with an icy glow, a frosty halo and a trail of ice sparkles and snow (`attachFrostFx`), and bursts in a cold flash, ice shards, frost mist, spinning snowflakes and an ice-blue shockwave, with its splash ring (`frostImpact`, Effects.js).

### Fixed
- **Tower of Rah losing its heat on flyers at the edge of its range:** La Vaca Saturno hovers 3.5 tiles off its target, often right at the beam's 6-tile range, and the crowd nudged it out and back, so the beam kept dropping it and starting cold (x1) again. Once locked on, the beam now holds its target `leash` (0.75) tiles past its range; a new target still has to be in range.
- **Enemies drawn under rubble:** a destroyed building's rubble kept the standing building's draw depth (its front corner), so enemies, gnomes and the hero crossing it vanished under the picture. Rubble is now drawn from its back corner, and the ground layering ignores destroyed buildings.

## 0.6.2

Faster loading, especially on phones. Saves load as they are (still save version 7). Details in [README.md](README.md) under Graphics and performance.

### Faster loading and phones
- **About 8x less to download before the title screen** (about 11 MB instead of 94 MB): pictures are WebP (60 MB of PNGs down to 12 MB, looking the same) and sounds are smaller (32 MB down to 16 MB: lower-bitrate music, mono ambience and long loops, trimmed clips). On a phone at 4 Mbps the game reaches the login screen in about 28 s instead of about 3 minutes.
- **Only what's needed loads up front.** Building pictures past Level 1 stream in: your village's own before it opens (START GAME waits for them, usually already in), then what your Village Hall can build, in the background; anything else when it's first shown, with the closest lower level standing in for a moment. Music and ambience load when they first play; the unused village track never loads.
- **Much less memory on phones:** sounds are decoded only when needed (about 240 MB at most in a village instead of about 450 MB at startup), and the title music is freed once a village opens.
- New scripts: `npm run prepare-audio` (originals now in `art-source/audio/`, the maps' in `art-source/map/`); `sharp` and `ffmpeg-static` are dev-only tools. The deploy skips their install scripts.

### Changed
- The gold Neegy no longer stands with the enemies on the title screen.

### Fixed
- The wall's shop "i" popup showed the Level 1 picture and health while the card and price were for your wall level (new walls are built at it). It now shows that level, and a line explains the price.

## 0.6.1

Saves load as they are (still save version 7). Details in [README.md](README.md) under the enemy list.

### Changed
- **Village Hall 11 reworked: Bonus Slots instead of the shared building limit.** Every building keeps its Village Hall 10 limit, and Village Hall 11 adds 5 Bonus Slots on top: each is one more building of any kind (not unique buildings or walls) past its limit, at the normal price, any mix. Selling a copy frees its slot. The shop shows a gold "Bonus Slot · n left" tag on capped cards and "Bonus Slots n / 5" in its footer. The +50% price for extra copies is gone. Villages already more than 5 past their limits keep everything but can't add more extras.
- **Rahhh Skeleton reworked:** instead of enraging the enemies around him, he summons. Within 4 tiles of the building he's after he bashes his shield and 3 **Skeletons** climb out of the ground around him, then more every 10 s while fewer than 6 of his are standing. They're as tough as he is for the wave. His enrage (+40% damage, +25% speed) and its red tint are gone.
- How to Play's enemy roster is as wide as its biggest category's row, so the 6 Special enemies fit.

### New
- **Skeleton** (`bones`): the summoned minion, with its own walk, attack and death pictures. Weak and quick (80 HP, 10 per hit, speed 1.2), worth 2 gold and 1 Burger.
- La Vaca Saturno flies in on the title screen over the heroes, left of the logo.

## 0.6.0

A feature release (the 13-item "Fixes & Features Batch 2"). Details in [README.md](README.md): KSI Tower, Village Hall 11, and the enemy list under Walls and pathfinding. Saves load as they are (still save version 7). **Database:** run [supabase/migration-2026-11-21-village-hall-11.sql](supabase/migration-2026-11-21-village-hall-11.sql) (or all of schema.sql) so the leaderboard counts Village Hall 11; the game works without it.

### New
- **KSI Tower** (Village Hall 5): an ice tower that splashes ground and air enemies and chills them (30-50% slower, icy blue). Slows never stack (the strongest wins); bosses take half. Perk paths Blizzard, Fully Frozen and Snowball.
- **Five new enemies:** John Pork (VH4, silences F.L.O.C.K Towers with a phone call), Rahhh Skeleton (VH6, a shield bash that enrages enemies around him), La Vaca Saturno (VH7, a tanky flyer whose boulders bounce 3 times), Big Yahu (VH8, missiles with a red target ring first), Brr Brr Patapim (VH9, earthquakes that hit every building and wall around him).
- **Village Hall 11** (250,000 gold), the new top level, with **the shared building limit:** the per-type caps become one pool of 56 buildings (any mix); copies past a type's cap cost +50% each (compounding). Unique buildings and walls keep their caps; Village Hall 11 adds 12 walls. Village Hall 10 keeps the usual caps. The shop shows "Buildings n / 56". (Replaced by Bonus Slots in 0.6.1.)
- **Select Row** in edit mode: a toggle beside the Shift pad; tap a wall to pick up its whole straight row and move it.
- **Spell sounds:** each spell has its own cast sound (repeat casts within half a second stay quiet, at most two of one at once).
- **How to Play:** the Enemies tab is a new roster: every enemy as a picture card on one panel, grouped into Ground, Air, Tanks & Bosses and Special, with the picked enemy's details beside it. KSI Tower and the new enemies have entries.
- **The Brisket King's portrait** on his altar in the shop card and info, How to Play, the building panel, the edit hotbar and the RV Lab list. His Hero tab lines its stats up like the Stats tab (values on the right, the next level's gain in green) and shows Brisket Feast as a card with its crown icon, and the altar's shop info has a full-width "Open Brisket King" button (it overlapped the picture).
- **Patch Notes:** a What's New window on the title screen, shown once per version to returning players.
- The title screen gained Brr Brr Patapim, John Pork and Rahhh Skeleton.

### Changed
- The shop's page arrows are blue (greyed-down blue at the first / last page).
- The KSI Tower grows with its level like the other defenses: its later pictures are squatter, so each is sized to stand about 4% taller than the one before (`TIER_GROWTH` in BuildingView.js); Level 10 had been drawn shorter than Level 5.

### Fixed
- The title screen's mortar fired every few seconds while the game was still loading (several shots on a slow phone). It now waits idle and fires once, when loading is done.
- Enemies in a pose without a set size (John Pork's call, the Skeleton's bash) were drawn at no size; found and fixed before release.

## 0.5.1

- The wave's "!" warning now sits on each attacking path's corner marker, out at the back of the path, instead of floating over the village.
- Rebuilding a destroyed Fuel Station, RV Lab or Brisket King altar mid-wave now costs more at higher levels (it was a flat price at every level). A level bought with Burgers counts as 15 gold per Burger (`rules.burgerGoldValue`), times the usual rebuild share.
- "Storage full" shows once, and again only after your gold has dropped below capacity, instead of on every collect.
- The title screen's mortar is silent now.

## 0.5.0

A big feature release: everything since 0.4.1 (the 37-item fixes and features list, plus the QA rounds).

### Before you deploy (manual steps)

1. **Update the Supabase database first.** In the Supabase SQL editor, run **supabase/migration-2026-11-20-base-limit-lock.sql** and **supabase/migration-2026-11-20-base-revision.sql** (or simply run the whole **supabase/schema.sql** again; it includes both and is safe to re-run). Do this *before* pushing: the new game saves villages only on top of the revision the server gave it, which needs the revision trigger (`stamp_base`), and the server-side wave count (`check_base()`) now counts waves the way the game does.
2. Then push to `main` (GitHub Pages deploys it).

### Burgers (research points, renamed)

- **Research points are now Burgers**, with a burger icon everywhere they show: the top bar, costs and buttons ("Brew · 40 Burgers", "Research · 240 Burgers"), the "+N" over defeated enemies, the wave-cleared banner, "Burgers full: N lost", the research and Fuel Station windows, tips, the guide and How to Play. The bar is a toasted-bun orange instead of purple. Nothing about how they work changed, and saves are untouched.
- **Burgers are capped**, like gold: the bar in the top row (left of the gold bar, with the day/night pill moved directly under the gold bar) shows a cap that grows with the RV Lab's level (400 with no lab, then 700 / 1,500 / 3,500 / 6,500 / 10,000). Anything earned past it is lost, so spend them.
- **What they pay for:** perks, path resets, spells, and upgrades of the RV Lab (Levels 2-5: 300 / 800 / 2,000 / 4,000), the Fuel Station (Levels 2-8) and the **Brisket King's altar** (his Levels 2-10: 150 / 250 / 400 / 650 / 1,000 / 1,600 / 2,500 / 4,000 / 6,000; building the altar still costs 3,000 gold). Burger levels aren't refunded as gold when selling. Beating a wave now pays 15 x the wave number (was 10).

### Perks (RV Lab)

- **One path per building type:** your first pick for a type (say Cannon A1) locks every Cannon to Path A for tiers 2-5. **Reset path** (under the tree) clears a type's picks for half of what they cost, with no refund, so it can take another path. Existing villages keep their picks (save version 7).
- **Perks no longer depend on building level:** a perk goes onto every building of that type at once, whatever its level. Only the RV Lab's level gates a tier (tier N needs lab level N). This covers the defenses, the economy buildings, DJ Babyface, the Brisket King's altar and the Fuel Station.
- New perk trees are added with one call (`registerPerkTree`, see docs/PERKS.md).

### New: Fuel Station, spells and the hotbar

- **Fuel Station** (a Kwik Trip; Economy tab, from Village Hall 2, 8 levels, four pictures, growing each level). Level 1 costs 400 gold; later levels cost Burgers. It opens a window like the RV Lab's: **Brew Spells**, and a **Perks** tab (*Potency*, *Spread*, *Refinery*).
- **Six spells**, opened by the station's level: Karuba Coffee (**Rage**), Donut (**Heal**), Ice Bag (**Freeze**), Spicy Tornado (**Heat Field**), Chocolate Milk (**Invisibility**) and Energy Drink (**Lightning Strike**, which hits the toughest enemies in its circle hard). Each is brewed with Burgers and used once; your Village Hall level sets how many you can carry (1 to 5). Every spell has its own icon art.
- **A guided first spell:** at Village Hall 2 the guide walks you through building the station and brewing a free first Karuba Coffee; its hotbar slot pulses until you cast it.
- **The hotbar** (bottom middle, during waves) replaces the old ability buttons: your spells, **Brisket Feast** and DJ Babyface's **Drop the Beat**, each with a number key (F for the Feast). Click a spell, then the map, to drop it (a ring shows its radius). Clicking the hero, his altar or the DJ booth now only selects them. The building info panel steps aside when it would cover the hotbar.

### New defense: Spear Thrower

- A long-range sniper (Defenses tab, from Village Hall 3; 1 / 2 / 3 allowed at Village Hall 3 / 5 / 8; 10 levels). Range 8.5, a heavy throw every 2.5 s, ground and air. The spear flies on through a short line behind its first target, piercing at 100% / 75% / 50% / 25%. Five pictures in four facings (it turns toward its target), its own spear, two throw sounds and a hit sound, and three perk paths (*Impaler*, *Hunter*, *Throwing Arm*).

### The Diddypult

- **The final unlock:** it now opens at Village Hall 10 and is last in the shop. It has **5 levels, one new picture each** (Levels 4 and 5 are new), hitting much harder per level so it holds up at Village Hall 10, with cheaper top levels.

### The Brisket King

- **Knocked out in a raid, he stays down until it ends** (no sleep cycle mid-raid), with a KO effect over his head. The new **Second Wind** perk gets him back up after 20 s at 40% health.
- **Always-on health bar** with his level drawn on the new crown picture. **Rage look** while Brisket Feast is active: a red tint and anger puffs. A soft light surrounds him at night.
- **New poses:** standing, both attacks (alternating), sleeping, waking up, defeated, and a select pose when you click him. Brisket Feast has its own sound; he snores softly while asleep.
- His ability and its description are on every hero info page, and the altar's shop info has a button that opens his Hero page.
- **His upgrades cost Burgers** (see Burgers above).

### Waves

- **Wave markers:** for each corner the next wave attacks from, a red arrow disc and the enemy types with counts sit on the map at the back of that path, always visible, the same size at any zoom, and sliding in along the path when the HUD would cover them. **Fog** drifts over the back of every path where enemies come onto the map.
- **Random corners:** every wave picks how many corners it uses and which ones at random, at every Village Hall level, and its enemy types come **mixed together** instead of one type after another.
- **The wave countdown is back:** Start Wave gives you 30 seconds before the attack, with a red "!" over each path the enemies will use and the planning music, which ends as the wave hits. Build during it, press **Start Now** to skip it, or **Cancel** to put the wave back. The tutorial's first wave counts down 10 seconds.

### Walls

- **Walls upgrade all at once:** click any wall and press **Upgrade Walls** to raise every wall one level, for walls placed x the new level's price (all or nothing; each level still needs its Village Hall). The per-wall upgrade and "Select connected walls" are gone. New walls are built at your current wall level. Prices are much lower: 10 / 20 / 40 / 80 / 150 / 300 / 500 / 800 per wall per level (was up to 4,000), so 132 walls go to Level 8 for 105,600. Existing villages bring every wall to its most common level (ties go to the higher one).

### Characters and art

- **Mr. Least replaces the Goyum Goblin:** the sneaky gold thief is now a smug man in a sharp suit (walking, attack and death pictures; a little taller). He works exactly as before.
- **Animated title screen:** the loading screen and title menu are a living scene. The logo drops in and pulses; Gandolf, the archer and a worker gnome stand by the mortar, facing a crowd of enemies, all breathing gently; the crocodile plane flies past, the balloon bobs, embers drift and the wizard's staff glows. While the game loads, the mortar fires its man at the enemies; when loading finishes he hovers at the top of his arc on the title menu.
- **Gnomes at work:** a gnome working at a building (mining, repairing) shows a working pose. New gnome picture.
- **Skibidi Toilet** has an attack picture; new Tank and Diddypult pictures.

### Interface

- **Fixes for overlapping UI:** the RV Lab window no longer sits under its title bar, long window titles shrink clear of the close button, shop cards keep names, "Village Hall N required" and traits apart, the Villages list never runs a long name under the Play button, the Start Wave button is sized to its hint, How to Play's stat tiles no longer let a long value run into its label (the Fuel Station's "New spell at level" tile), the RV Lab guide's note in the research window stays clear of the grid, and an upgrade that can't be bought yet still says what it costs in ("600 Burgers", not "600").
- **Leagues:** the Profile shows every league's badge and the wave it takes (yours tagged YOU), and How to Play has a Leagues tab. Leagues are much harder: Bronze needs wave 5, Silver 20, Gold 40, Crystal 70, Champion 110, WarLord 160 (was 1 / 4 / 7 / 10 / 15 / 25). The Leaderboard and the Profile now agree on your league (the server used to count waves by Village Hall level).
- **Graphics setting** (Settings and the pause menu): **Auto / High / Low**. Low draws fewer particles, fog puffs, night glows and floating numbers; Auto switches to Low by itself when the frame rate stays low.

### Balance

- Village Halls 2-4 had waves far harder than the defenses they allow; they're toned down, and Village Hall 5 has a scripted base wave of its own. Late waves grow faster from there (enemy count x1.18 and health x1.14 per Village Hall, was x1.15 / x1.1).
- Bitcoin Mine Levels 6-10 make 12-33% more gold. Cannon damage +10%; Locklair Tower and Firework Launcher -10% (the Spear Thrower shares air cover now); Litman Mortar -5%, Gandolf -7%; F.L.O.C.K Tower and Tower of Rah upgrades cheaper.

### Accounts, saves and sync safety

- **Safer saving across tabs and devices:** opening a village in a second tab tells the first, which stops saving it ("This village was opened in another tab", with **Reload here and take over**). A tab or device with an older copy can no longer overwrite newer progress: the server refuses it, and that copy is kept as a backup you can **Restore** from Villages → Import from this device. Unsent progress left on a device is merged by the server's revision instead of the device clock.
- **Play Offline:** if the server can't be reached when you start, the login screen offers **Retry** and **Play Offline** (your villages from this device, as the last account that logged in here); everything is sent at the next login. The leaderboard and achievement rewards wait until then.
- **Shared devices:** each account's unsent copies wait for that account only; Villages no longer offers another account's copies. Log Out also forgets the remembered email and clears the saved login, even offline.
- **Account and save fixes:** the 5-village limit holds when two tabs create villages at once (a database lock); logging out mid-upload and another player logging in can't put the upload in the wrong account, and nothing is sent once the login changed (another tab logging in as someone else); a game keeps saving into the village it started in, whatever the session does next; switching villages starts a clean game (a leftover HUD piece from the last one could crash it); a save the game can't read is kept on the device before a fresh start replaces it; an old-version village on the device imports as a current save; a village update that changed nothing on the server (deleted elsewhere) stays unsent instead of being dropped; and saves from every version (1 to 7) load, while corrupt or tampered ones are rejected without crashing.

### Performance and stability

- Faster drawing for slow devices and late waves: cached circles, arcs and shapes, a pooled and capped layer of floating numbers, health bars that redraw only when they change, and a faster gnome lookup.
- Very high waves (tested to 500+) stay stable: Da Baby Car's burst is capped, a bad frame time can no longer reach the game rules, spells check where they're cast, and sounds are skipped while the browser still has audio locked.
- Fixed a test that failed now and then (the two-tab test's message timing).

### Cleanup

- Unused images and sounds moved out of the shipped game into `unused-assets/` (outside `public/`), with a list of where each came from; the old research point token is kept there too.
- Removed code left over from replaced systems and duplicated helpers (unused functions, the old wall group upgrade, the unused `UNLOADED_FILES` list), and brought comments and docs up to date.

## 0.4.1

- **Brisket King's health bar** now rides along with him when he hops walls (and with the bounce in his step), and sits above his tallest pose, so it never covers him.
- **Brisket Feast from the altar:** clicking his altar (or him) during a wave sets off Brisket Feast. When it can't be used right now, the reason floats over him ("Used this wave", "He's asleep") and the altar is selected as usual.

## 0.4.0

- **Perk bar on every perk building:** every building with a perk tree (defenses, the Brisket King's altar, mines, storages, houses, DJ Babyface) shows its 5-slot perk bar next to its level from the start, empty until perks are researched in the RV Lab.
- **New hero: the Brisket King**, a melee hero who guards his altar (Defenses tab, from Village Hall 4, 10 levels).
  - He roams his area when there's no enemy to fight, walking around buildings and hopping over walls. In a wave he charges ground enemies near his altar, and they fight back.
  - The altar has five pictures as it levels up, one per 2 levels, and sits flush on its tiles.
  - After a wave he naps to heal (longer the more he was hurt); knocked out, he sleeps 2 minutes. He sleeps through any wave you start meanwhile. While he naps, a blue sleep bar over him fills as he heals, with the time left above it.
  - Click him during a wave for **Brisket Feast**: a heal, a speed and damage boost, and a slam.
  - Upgrading the altar levels him up, and he has a 3-path perk tree in the RV Lab.
  - His altar's info panel has a **Hero** tab: his portrait, health, damage, attack speed, guard range, status (with the nap timer) and Feast charges, plus what the next level adds.
  - His health bar wears a dark purple crown badge with his level, so he stands out from buildings and enemies.
  - He and his altar each have their own click sound.
- **Sky:** dusk and dawn now have their own pictures. Day fades into the dusk sky, then into night, and dawn runs the same way back, with buildings and enemies tinted warm in between.
- **DJ Babyface:** its level 2, 3 and 4 pictures now show as it is upgraded (level 5 shows the level 4 picture for now).

- **Phones and tablets:** the game plays by touch, sideways.
  - **Moving around:** drag to pan and pinch with two fingers to zoom.
  - **Placing:** a new building's ghost appears on a free spot. Drag it, or tap where it should go, then tap **Place** (or the ghost itself). **Cancel** / **Put Back** stop. Walls continue the row after each Place.
  - **Tapping:** small buttons are easier to hit by touch, and nothing stays highlighted after a tap.
  - **Screen:** holding the phone upright shows "Turn your phone sideways" and pauses the game. A full screen button sits on the title, login and pause screens; on iPhone, Add to Home Screen opens the game full screen instead.
  - **Browser:** the page no longer zooms, scrolls or pull-to-refreshes under your fingers, and How to Play shows touch controls.
- **Economy perk trees:** the Bitcoin Mine, Storage, Villager House and DJ Babyface each get 3 paths x 5 tiers in the RV Lab (60 new perks, e.g. auto-collecting mines, interest-paying storages, a gnome militia, an auto-DJ). The research window now has Defenses / Economy tabs.
- **New building: DJ Babyface**, a utility booth (Economy tab, from Village Hall 5, 5 levels).
  - Gnomes nearby work faster.
  - Defeating enemies fills its hype meter; when it's full, click the booth during a wave to Drop the Beat, and defenses in range fire much faster for a few seconds.
  - At night its light show keeps enemies in range from being restless.
  - Selecting it lights up every building in its range in purple, so you can see what it boosts.
- **New enemy: Skibidi Toilet**, a burrower in waves from Village Hall 5.
  - It tunnels underground, under your walls, to the nearest building, pops up to attack it, then tunnels on to the next.
  - Underground nothing can hit it, unless a F.L.O.C.K Tower sees it.
- **New enemy: Da Baby Car**, a raid boss mixed into every 2nd normal wave from Village Hall 6 (two from Village Hall 9).
  - It drives in a straight line for your Village Hall, smashing walls in one hit and ramming through any other building.
  - It has about 6 Tanks' health. When destroyed it bursts into a crowd of the wave's ground troops, and more of them in later waves.
  - The top bar warns you before such a wave.
- **Fixed: severe lag in late waves.** The enemies' path finder could re-check the same tiles over and over once walls got tough, so a single frame could freeze for many seconds around wave 100+. It's now exact and much faster: the worst frame at wave 128 went from about 16 s to under 30 ms.
- **Crowd cap for huge waves:** a wave never sends more than 400 enemies. Past that, each enemy is tougher instead (health, damage and rewards scaled, and they come further apart), so late waves are as hard and pay as much, with far less to draw. Wave 128: 401 enemies at ×4.55 instead of ~1,800.
  - Area damage (splash, pools, traps, quakes, Starfall, Ring of Fire, area poison and burns) hits a packed enemy about pack^0.66 times over, since it stands for a crowd. Without this, capped waves took 25-30% less damage than the crowds they replace. Tuned in simulations to within about 5% of the uncapped waves. Single-target shots are unchanged.
- **Enemy levels:** enemies show a level badge on their health bar, like buildings (dark red). It's how many times a basic one's health they have: wave 1 enemies are level 1, a packed wave-128 Grunt is about level 71.
- **Wall Breaker nerfed slightly:** its blast does 2,400 to walls (was 3,000), so Levels 7-8 take two blasts, and its radius is 1.75 tiles (was 2).
- **Wall level 8:** a lava tower is the new top wall (Village Hall 10, 3,800 HP). Wall levels now unlock at Village Hall 1, 2, 3, 5, 7, 8, 9 and 10, and walls grow clearly with level, from a thin post to a big tower.
- **Wave stars:** every wave is rated 1-3 stars by how much of your village survives (walls don't count). 3 stars pays +50% gold and RP, 2 stars +20%. The wave pill shows the rating live, and there's a new Star Collector achievement.
- **First-time tips:** the guide explains research points, wave stars, special waves, Da Baby Car, restless nights and edit mode the first time each one comes up ("Got it" / "No more tips").
- **Research tree:** tiers beyond your RV Lab's level stay hidden until it levels up.
- **New art:**
  - **Cannon:** four facings per level. It turns toward the enemy it's shooting, and looks around at random when there's nothing to shoot.
  - **Litman Mortar:** a right-facing picture per level. It faces left or right toward its target, and turns at random when idle.
  - **Storage:** three gold-fill pictures per level, switching at 1/3 and 2/3 of your max gold.
  - **DJ Babyface:** pictures for levels 2-4.
  - **Beat-ready icon:** shown over DJ Babyface when Drop the Beat is ready.
- **New sounds:** a beat-drop sound for Drop the Beat, and an ability-unlocked sound when a building gets a new ability tier. When a level-up unlocks a tier, the sound (and the "New ability!" pop) waits until the upgrade sound has finished.
- **DJ Babyface's overhead UI is cleaner:** the hype meter is a slim pill that stacks above the level chip or health bar instead of overlapping them. Between waves it only shows on hover or selection, and when it's full the beat-ready icon takes its place.
- **Cleanup:** removed leftover files from the project folder, and two unused sounds (the old dusk countdown music and tick) that were still being downloaded.
- **Docs:** [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md), a one-document overview of the project for presentations (pitch, features, numbers, architecture, engineering highlights, demo script). The README is brought up to date: touch support, waves on demand, gnome behavior, wall numbers and open questions.
- **Removed the outlines on hidden buildings:** in a packed village they covered everything. Fading and tile-first clicks still handle buildings behind others.

## 0.3.0

### RV Lab and defense abilities
- **New building: the RV Lab** (Economy tab, from Village Hall 4, 5 levels, one picture per level). A book bobs over it when research is ready, and clicking it opens its info panel, whose Research button opens the research window.
- **Ability trees for every defense:** three paths (A, B, C) of five tiers each, every tier unique to its building. Each one either covers a weakness or doubles down on a strength.
- **One pick per tier, made in the lab:** at each tier you pick Path A, B or C for a defense type, in any mix. Picks are final.
  - The pick goes straight onto every building of that type whose level is high enough (2 / 4 / 6 / 8 / 10). Lower-level buildings get it when upgraded. Nothing is bought per building.
- **Research points (RP):** earned from kills (tougher enemies give more) and by beating waves. Research costs 80 / 240 / 600 / 1,400 / 3,000 RP per tier.
- **Research window:** laid out as a skill tree, with a details panel that shows what each perk does, which of your buildings get it, and what it needs.
- **RV Lab guide:** a short follow-up tutorial with a free first research.
- **Existing villages are converted automatically** (save version 5). At each tier, the option most of a type's buildings had bought is kept, and research that isn't kept is refunded in RP.

### Day, night and waves
- **The day/night cycle runs on its own** (about 8 minutes: day 4 min, dusk 30 s, night 3 min, dawn 30 s). A sun or moon clock shows under the gold bar.
- **Start Wave works any time:** the wave attacks at whatever time it is.
- **Restless nights:** while it's dark, attacking enemies deal +25% damage and move 15% faster, but kills (and the wave's research points) pay +25%. A banner and the wave pill show it.
- **Night lighting:** enemy glows and building lights only show once it's dark.
- **New sounds:** day and night ambience replace the village music between waves and crossfade with the cycle. The attack music still plays during waves.
- **Free rebuilds:** everything destroyed in a wave is rebuilt for free when you beat it. During a wave you can still pay to rebuild a building early.

### Walls
- **Seven wall levels, one picture each**, including the new skull and lava walls. They unlock at Village Hall 1, 2, 3, 5, 7, 9 and 10.
- **New rubble** for destroyed level 6 and 7 walls.
- **Much cheaper walls:** 10 / 25 / 60 / 150 / 350 / 800 / 1,800 gold.
- Older walls keep their picture (save version 4).

### A less cluttered village
- **Clicks pick the building on the tile under the cursor first**, so tall buildings in front no longer steal clicks. A white outline shows what you're hovering.
- **See-through buildings:** buildings in front of the hovered or selected one fade to see-through.
- **Labels only when needed:** the level and tier pips are one small chip, shown only on the hovered or selected building (and in edit mode). Damaged buildings always show their health bar.
- **Ground plots:** a soft dirt plot under each building shows which tiles it uses.

### Also new
- **Profile:** a profile pill (top left) with your league, rank, achievements and lifetime stats, plus a badge for unclaimed rewards and news. Achievement sound.
- **Layout editor:** move buildings in edit mode, with a hotbar, Remove All and Save.
- **Other:** sign-up "are you human?" check (Cloudflare Turnstile), and the version label.
- **How to Play:** restructured, with pages for buildings, upgrades and the RV Lab.

## 0.2.0

- Online accounts (Supabase): login, up to 5 villages per account, achievements, leaderboard and league badges. Served from GitHub Pages at `/BrainRot-Tower-Defense/`.
