# Changelog

The version shows in the bottom-left corner of every screen (`package.json` `version` plus the commit). Details for everything below are in [README.md](README.md).

## 0.6.0

A feature release (the 13-item "Fixes & Features Batch 2"). Details in [README.md](README.md): KSI Tower, Village Hall 11, and the enemy list under Walls and pathfinding. Saves load as they are (still save version 7). **Database:** run [supabase/migration-2026-11-21-village-hall-11.sql](supabase/migration-2026-11-21-village-hall-11.sql) (or all of schema.sql) so the leaderboard counts Village Hall 11; the game works without it.

### New
- **KSI Tower** (Village Hall 5): an ice tower that splashes ground and air enemies and chills them (30-50% slower, icy blue). Slows never stack (the strongest wins); bosses take half. Perk paths Blizzard, Fully Frozen and Snowball.
- **Five new enemies:** John Pork (VH4, silences F.L.O.C.K Towers with a phone call), Rahhh Skeleton (VH6, a shield bash that enrages enemies around him), La Vaca Saturno (VH7, a tanky flyer whose boulders bounce 3 times), Big Yahu (VH8, missiles with a red target ring first), Brr Brr Patapim (VH9, earthquakes that hit every building and wall around him).
- **Village Hall 11** (250,000 gold), the new top level, with **the shared building limit:** the per-type caps become one pool of 56 buildings (any mix); copies past a type's cap cost +50% each (compounding). Unique buildings and walls keep their caps; Village Hall 11 adds 12 walls. Village Hall 10 keeps the usual caps. The shop shows "Buildings n / 56".
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
