# Italian Brainrot Tower Defense: Project Overview

A reference for presenting the project. Each section is roughly one slide. For full technical detail, see [README.md](../README.md); for what changed in each version, see [CHANGELOG.md](../CHANGELOG.md).

- **Play it:** https://bmessick102.github.io/BrainRot-Tower-Defense/
- **Code:** https://github.com/bmessick102/BrainRot-Tower-Defense
- **Version:** 0.3.0 live, with the next release (in the CHANGELOG's "Unreleased" section) in progress

---

## 1. The pitch

**A base-builder tower defense where Italian Brainrot memes attack your village, and you survive as long as you can.**

It's a hybrid of *Clash of Clans* (build and upgrade a village on an isometric grid) and *Bloons TD* (deep upgrade paths for every tower, endless waves that keep getting harder). It runs in the browser on desktop and on phones and tablets, with no install.

---

## 2. The team

| Person | Role |
| --- | --- |
| Brady Messick | Code; owns the working prototype |
| Robert | Code |
| Cole Martin | Game art, sound effects, UI/UX |
| Nathan DiCarlo | Testing, Kanban board |

---

## 3. The core loop

1. **Earn:** Bitcoin Mines fill with gold; click to collect. Gnome villagers mine extra and carry it to storage.
2. **Build:** spend gold in the shop on defenses, walls and economy buildings, and place them on the grid.
3. **Upgrade:** buildings level up instantly (no timers); the Village Hall unlocks new buildings.
4. **Research:** spend Burgers (the research currency) in the RV Lab on perks for every building type.
5. **Defend:** press Start Wave whenever you're ready. Enemies attack from the map edges; your defenses fight automatically, and you can trigger DJ Babyface's "Drop the Beat" mid-fight.
6. **Repeat:** every wave is tougher than the last. The goal is to survive as long as possible.

---

## 4. Content by the numbers

| | |
| --- | --- |
| Building types | 16: Village Hall, 9 defenses, walls, Bitcoin Mine, Storage, Villager House, RV Lab, DJ Babyface |
| Levels | 10 for most buildings; walls 8; Village Hall 10 |
| Enemy types | 11, including a raid boss and a burrower |
| Perks (RV Lab) | 195: 13 building types x 3 paths x 5 tiers, every one unique |
| Achievements | 26 across Village, Battle and Builder |
| Leagues | 6 leaderboard leagues (Bronze to WarLord) |
| Waves | endless, with special waves every 3rd wave and boss waves |
| Art and audio | 130 images and 46 sound and music files |

**Defenses:** Cannon, Locklair Tower, Litman Mortar, Gandolf Tower, Firework Launcher (anti-air), Mousetrap (hidden trap), F.L.O.C.K Tower (support: marks enemies, reveals hidden ones), The Diddypult (long-range oil pools), Tower of Rah (heating beam).

**Enemies:** Tung Tung Tung Sahur (Grunt), Cappuccino Assasino (ranged), Bombadillo Crocadillo (bomber), Tripi Tropi Tropi Tripa (tank), Tralalero Tralala (wall jumper), Mr. Least (invisible gold thief), Boneca Ambalabu (Wall Breaker), Neegy Balloon (drops paratroopers), Skibidi Toilet (tunnels underground), and **Da Baby Car**, a raid boss that rams straight through your walls.

---

## 5. Signature features

**Village and economy**
- Gnome villagers mine and repair on their own.
- A Village Hall income acts as a safety net so a ruined village can always recover.
- Destroyed buildings are rebuilt free after every beaten wave, so a bad wave never wipes you out.
- **DJ Babyface:** a utility booth. Gnomes nearby work faster, kills fill a hype meter, and a full meter lets you "Drop the Beat" to supercharge nearby defenses.

**RV Lab and perk trees**
- Every defense and economy building has 3 paths x 5 tiers.
- At each tier you make one pick (Path A, B or C), and picks are final.
- A pick applies to every building of that type at once.
- Each perk either covers a building's weakness or doubles down on its strength, e.g. mines that auto-collect, storages that pay interest, a gnome militia, an auto-DJ.

**Waves and stakes**
- **Endless waves.** Every 3rd wave is a special one (Air Raid, Siege, Heist...), announced in advance.
- **Wave stars:** 1-3 stars by how much of your village survives, with bonus gold and Burgers for clean defenses.
- **Day/night cycle (~8 minutes):** attacking at night makes enemies "restless" (tougher, but they pay 25% more), so when you fight is a choice.

**Readability and onboarding**
- **Crowded villages stay readable:** clicks pick the building on the tile you point at, buildings in front fade out, and labels show only on hover.
- **First-time tips** explain each system the moment it first appears, so new players aren't overwhelmed.

**Online**
- Accounts with up to 5 villages each.
- Cloud saves, achievements with gold rewards, and a global leaderboard with league badges.

---

## 6. Tech stack

| Layer | Choice |
| --- | --- |
| Language | JavaScript (ES modules) |
| Game engine | Phaser 3.90 (WebGL, falls back to Canvas) |
| Build tool | Vite 7 |
| Tests | Vitest 4: 413 tests in 48 files |
| Backend | Supabase (auth, Postgres with row-level security) |
| Hosting | GitHub Pages, deployed automatically by GitHub Actions on every push |
| Code size | about 18,300 lines across 91 source files, plus 5,500 lines of tests |

---

## 7. Architecture

```
config.js (every balance number)
      |
src/logic/  (pure game rules, no Phaser: combat, waves, economy, pathfinding, perks, saves)
      |                ^  tested by Vitest, no browser needed
GameState  (the village + an event bus: 'enemyKilled', 'waveCleared', ...)
      |
src/scenes + src/objects  (Phaser: draws the map, buildings, enemies, HUD, windows; routes input)
      |
Supabase  (accounts, cloud saves, achievements, leaderboard)
```

- **Rules are separate from drawing.** All game rules are plain functions under `src/logic/` that never touch the engine. That's why 413 tests run in seconds without a browser.
- **No hard-coded numbers.** Every cost, health value, range and timing lives in `src/config.js`, so balancing never means hunting through code.
- **Events connect the layers.** The game logic announces what happened (an enemy died, a wave was cleared), and the visuals, sounds, achievements and tutorial each react on their own.
- **Saves are versioned.** Version 5 today; old saves are upgraded automatically, e.g. old wall levels and old research converting to new systems with refunds.
- **Art pipeline.** Artists drop PNG and MP3 files into `art-source/`; one script (`npm run prepare-art`) crops, resizes and registers them, and real art replaces placeholders automatically.

---

## 8. How it was built

- **Specification first.** The team wrote a build charter: the full design, balance sheet, rules and milestones.
- **AI-assisted development with human direction.** An AI coding agent implemented the charter and every later feature, while the team set the direction:
  - *Brady:* features and design decisions.
  - *Cole:* art and sound.
  - *Nathan:* testing.
  - The agent asked design questions before building, and the team chose the answers (e.g. wave star rules, research costs, how the day/night cycle works).
- **Every change verified.** Each feature shipped with:
  - automated tests;
  - a production build check;
  - screenshots taken in a headless browser to check it on screen.
- **Iterative.** Features were added in response to playtesting: perk trees, the RV Lab, wave stars, new enemies, decluttering, performance work.

---

## 9. Engineering highlights (good "challenges we solved" slides)

**The late-game lag bug**
- **Symptom:** around wave 100+ the game froze for seconds at a time.
- **Diagnosis:** we profiled a maxed base fighting wave 128. 96% of the time was spent in enemy pathfinding. Distances were stored at low precision, so once paths ran through tough walls, rounding made the same tiles look "cheaper" again and again. One path calculation re-processed 1.6 million entries on a 992-tile map.
- **Fix:** exact distances, each tile processed once, and no memory churn.
- **Result:** the worst frame went from **16 seconds to under 30 milliseconds**. A regression test guards it.

**The crowd cap**
- **Problem:** wave 128 would send ~1,800 enemies, too many sprites to draw smoothly.
- **Fix:** past 400 enemies, each enemy instead stands for several. It gets proportionally more health, damage and reward, and arrives proportionally later, so difficulty and payouts stay the same with a quarter of the sprites.

**Readable villages**
- **Problem:** late bases got so dense that buildings hid behind each other.
- **Fix:** clicking by tile instead of by picture, see-through buildings in front of the one you're pointing at, ground plots, and labels only on hover.
- **Lesson:** we tried outlines on hidden buildings first. In a packed base they lit up everything, so we removed them. It was a useful lesson in testing ideas at the real scale.

**Changing the rules without breaking players' saves**
- **Problem:** the upgrade system changed from "buy each perk on each building" to "research once in the lab, every building gets it".
- **Fix:** a save migration converted every village. It kept the option most of that type's buildings had bought, and refunded the research that wasn't kept.

---

## 10. Design decisions worth discussing

- **Free rebuilds plus wave stars:** losing buildings never costs gold, so restarting is painless; the stakes come from bonus rewards for clean waves instead.
- **One pick per tier:** every perk choice closes the other two paths at that tier, so two players' villages end up different.
- **Night is a choice:** harder enemies for more loot, and DJ Babyface can calm them.
- **Waves on demand:** the player decides when to fight, never a timer.

---

## 11. What's next

- **Spells:** active abilities to cast mid-wave.
- **Late game:** the goal is "survive as long as possible". Still open:
  - whether a run gets limited lives;
  - escalation past Village Hall 10;
  - milestone rewards every 10 waves;
  - an endless Burger sink once every tree is full.
- **Balance pass:** many new systems were added quickly. Next is a playtest-driven tuning round, possibly with a bot that plays 30 waves and reports gold and difficulty.
- **More art:** extra level pictures for DJ Babyface, and any remaining buildings.

---

## 12. Suggested live demo (about 5 minutes)

1. **Title screen:** log in, then show the village list.
2. **The village:** collect from a mine, show the gnomes working, and open the shop.
3. **Hover a crowded corner:** buildings in front fade, and the label shows on hover.
4. **Select DJ Babyface:** every building it boosts glows purple.
5. **Open the RV Lab:** the Defenses / Economy tabs, the skill tree, and research one perk. "New ability!" pops over every building of that type.
6. **Press Start Wave at night:**
   - the "restless" banner and the live stars on the wave pill;
   - Drop the Beat when the meter fills;
   - a Skibidi Toilet tunneling under the walls, if the wave has one.
7. **Beat the wave:** the cleared banner with stars and bonus, and everything rebuilds for free.
8. **Profile:** achievements, league badge, and the leaderboard.
