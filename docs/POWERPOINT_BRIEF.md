# Brief for an AI: build a PowerPoint presentation for "Italian Brainrot Tower Defense"

You are being asked to create a PowerPoint presentation (.pptx) about a video game that a small student team built. Everything you need to know is in this document. **Use only the facts written here. Do not invent features, numbers, quotes, release dates, or team members.** If something you want to say isn't in this document, leave it out.

*This brief describes version 0.5.0.*

---

## 1. What I want from you

- **Deliverable:** one `.pptx` file, about **14 slides** (the outline in section 4 has 15; see the cut note at its end), 16:9.
- **Speaker notes on every slide:** 2 to 4 sentences I can say out loud, written in plain, friendly language.
- **Length when presented:** about 8 to 10 minutes (plus an optional 5-minute live demo, see section 7).
- **Tone:** confident, a little playful (the game is a meme game), but clear and professional. Not salesy.
- **Audience (assumption, change if I tell you otherwise):** classmates and an instructor who have never seen the game. Assume they know basic tech words but not game-design jargon, so explain "tower defense" in one line.
- **Words per slide:** short. Max 5 bullets, ideally under 12 words each. Big pictures beat paragraphs.

If anything below is unclear, make a sensible choice and tell me what you chose in one sentence at the end. Don't ask me a long list of questions first.

---

## 2. The game in one paragraph

**Italian Brainrot Tower Defense** is a single-player base-builder tower defense that runs in a web browser (desktop, phones and tablets, no install). You mine gold (Bitcoin), build and upgrade defenses on an isometric grid, and survive waves of internet "Italian Brainrot" meme characters (Tung Tung Tung Sahur, Tralalero Tralala, Bombadillo Crocadillo and more). Defeated enemies and beaten waves also pay **Burgers**, the second currency, spent on perks, spells and some upgrades. A wave only starts when the player presses **Start Wave**, and every wave is tougher than the last, so the goal is to **survive as long as possible**. It mixes *Clash of Clans* (build and upgrade a village) with *Bloons TD* (deep upgrade paths for every tower, endless waves).

- **Play it:** https://bmessick102.github.io/BrainRot-Tower-Defense/
- **Code:** https://github.com/bmessick102/BrainRot-Tower-Defense
- **Current version:** 0.5.0

## 3. The team

| Person | Role |
| --- | --- |
| Brady Messick | Code; owns the working prototype |
| Robert | Code |
| Cole Martin | Game art, sound effects, UI/UX |
| Nathan DiCarlo | Testing, Kanban board |

The code was written with an **AI coding assistant** under the team's direction: Brady set features and design decisions, Cole made all the art and sound, Nathan tested. The AI asked design questions before building each feature and the team chose the answers. Every change was checked with automated tests, a production build and screenshots in a headless browser.

---

## 4. Slide-by-slide outline

Follow this order. "Visual" says what picture to use (files are listed in section 6).

**1. Title.** "Italian Brainrot Tower Defense". Subtitle: "A browser base-builder tower defense where memes attack your village". Team names small at the bottom. *Visual:* the title background image (or the screenshot of the animated title screen), full-bleed, with a dark overlay behind the text.

**2. The pitch (the 10-second version).** Large quote-style line: "Build a village. Survive the brainrot. Last as long as you can." Under it, three icons or short phrases: *Build and upgrade*, *Research perks*, *Survive endless waves*. Mention the two inspirations (Clash of Clans, Bloons TD). *Visual:* a screenshot of a built-up village.

**3. How a round works (the core loop).** A circular or left-to-right diagram of six steps: Earn gold, Build, Upgrade, Research, Defend (press Start Wave), Repeat. One short line under each. Facts: mines fill with gold you click to collect; gnome villagers mine extra and repair buildings; upgrades are instant (no timers); the Village Hall unlocks new buildings; defeated enemies and beaten waves pay Burgers (beating a wave pays 15 x the wave number), which buy perks and spells. New players get a guided tutorial, first-time tips for each system, and a How to Play screen (Basics, Buildings, Upgrades, Enemies and Leagues tabs). *Visual:* simple icons or small cropped building art per step (the gold coin and the burger icon), plus the shop and How to Play screenshots.

**4. Your village: buildings.** Show a grid of building pictures with names. **19 building types.** Defenses: Cannon, Locklair Tower (archer), Litman Mortar, Gandolf Tower (wizard), Firework Launcher (anti-air only), Spear Thrower (long-range sniper, ground and air), Mousetrap (hidden trap), F.L.O.C.K Tower (marks and reveals enemies), Tower of Rah (heating beam), Brisket King Altar (the hero's home), and **The Diddypult** (long-range oil pools), now the **final unlock at Village Hall 10**. Economy and support: Village Hall, Bitcoin Mine, Bitcoin Storage, Villager House (gnome workers), RV Lab (research), Fuel Station (spells), DJ Babyface (booster), walls. Callout: "10 levels for most buildings; every few levels the picture changes." *Visual:* a collage of top-level building art.

New in 0.5.0, worth one line on this slide or in its notes: the **Spear Thrower** (from Village Hall 3, 10 levels): range 8.5 (the Cannon is 6), a heavy throw every 2.5 s that hits ground and air, and the spear flies on through the enemies behind its first target, piercing at 100% / 75% / 50% / 25%.

**5. The enemies.** Show a row or grid of enemy pictures with a one-line job each:
- Tung Tung Tung Sahur: the everyday foot soldier (Grunt)
- Cappuccino Assasino: throws shuriken from a distance (Slinger)
- Bombadillo Crocadillo: flying bomber (only anti-air can hit it)
- Tripi Tropi Tropi Tripa: slow, huge health (Tank)
- Tralalero Tralala: sneaker-wearing shark that leaps over walls (Wall Jumper)
- Mr. Least: a smug thief in a sharp suit who goes for your Mines and Storage and starts invisible (new in 0.5.0: he replaced the old goblin thief and works the same way)
- Boneca Ambalabu: rolls a bomb-filled tire at your walls (Wall Breaker)
- Neegy Balloon: floating balloon that drops Neegy paratroopers on your anti-air
- Skibidi Toilet: burrows under walls
- Da Baby Car: the raid boss (5,400 health), rams straight at your Village Hall
Callout: "11 enemy types." *Visual:* the enemy art.

**6. Waves that keep getting harder.** Facts: waves start when the player presses Start Wave, whatever the time of day, then a **30-second countdown** lets you build before the attack (Start Now skips it). Every wave adds about **+8% more enemies and +5% more health** than the one before, forever, so even staying at the same Village Hall level gets harder. The Village Hall level decides *which* enemy types can appear (no flyers before you can build anti-air). New in 0.5.0: **wave markers** at the back of each path show where the next wave comes from and which enemies (with counts); **fog** drifts where enemies enter the map; every wave picks its **corners at random**, and its troop types come **mixed together**. **Every 3rd wave is a special wave**, announced in advance with a red warning on the Start Wave button: *Swarm* (hordes of weak enemies), *Air Raid* (flyers only), *Ground Assault* (no flyers), *Heist* (mostly gold thieves), *Siege* (tanks and wall breakers). Clearing a special wave pays bonus gold. *Visual:* a screenshot of a wave in progress.

**7. Day and night.** Facts: a full day/night cycle takes about **8 minutes** and runs on its own (day 4 min, dusk 30 s, night 3 min, dawn 30 s). The map visibly changes through dawn, day, dusk and night, and buildings light up at night. **Fighting at night makes enemies "restless": they hit harder and move faster, but pay 25% more gold and Burgers.** So *when* you fight is a choice. *Visual:* the same village by day and at night side by side (or the four map pictures: dawn, day, dusk, night).

**8. The RV Lab: perks paid in Burgers.** Facts: **Burgers** (renamed from "research points" in 0.5.0, with a burger icon) are earned by defeating enemies and surviving waves. They are **capped by the RV Lab's level** (400 with no lab, then 700 / 1,500 / 3,500 / 6,500 / 10,000), so you spend them instead of hoarding. Every defense and economy building type has **3 paths (A, B, C) with 5 tiers each**: **240 perks** in 16 trees. Your **first pick locks that building type to one path**; a **paid reset** (half of what its perks cost, no refund) lets it switch. A perk applies to **every** building of that type at once, **whatever the building's level**; only the RV Lab's level decides which tiers are open. Examples of the flavor: mines that auto-collect, storages that earn interest, a gnome militia, an auto-DJ. *Visual:* a screenshot of the RV Lab research window.

**9. Fuel Station: spells and the hotbar.** New in 0.5.0. Facts: the **Fuel Station** (a gas station, from Village Hall 2, 8 levels) brews **six food spells** with Burgers, each used once in a raid: **Karuba Coffee (Rage)**, **Donut (Heal)**, **Ice Bag (Freeze)**, **Spicy Tornado (Heat Field)**, **Chocolate Milk (Invisibility)** and **Energy Drink (Lightning Strike**, which hits the toughest enemies in its circle hard). The station's level opens new spells; the Village Hall level sets how many you can carry (1 to 5). The guide walks you through building it and brewing a free first Karuba Coffee. The **hotbar** at the bottom middle of the screen during waves holds your spells plus Brisket Feast and Drop the Beat: click a slot (or press its number key), then click the map. *Visual:* the six spell icons and a screenshot of the Fuel Station window or the hotbar in a wave.

**10. Heroes and helpers: the Brisket King and DJ Babyface.** Facts about the **Brisket King** (hero, from Village Hall 4): a melee hero who guards his altar and clubs enemies with a brisket. **Brisket Feast**, once per wave from the hotbar (or the F key): +40% health, +50% damage and +40% speed for 6 seconds, plus a slam that stuns nearby enemies. Knocked out in a raid, he **stays down until it ends**; the **Second Wind** perk gets him back up after 20 s at 40% health. After a wave he naps to heal. Building his altar costs 3,000 gold; his Levels 2-10 cost **Burgers**. Facts about **DJ Babyface** (utility building): gnomes working near the booth mine and repair faster; every enemy you defeat fills a "hype" meter; when it's full you can **Drop the Beat** from the hotbar to make nearby defenses fire faster for several seconds; at night its light show calms enemies. 5 levels, 4 pictures. *Visual:* the Brisket King art and the DJ Babyface pictures.

**11. Staying alive: friendly rules.** Facts: destroyed buildings are rebuilt **free** after every beaten wave, so a bad wave never wipes you out; the Village Hall earns a trickle of gold as a safety net; the stakes come from **wave stars** (1 to 3 stars by how much of your village survives; 3 stars pay +50% of the wave's gold and Burgers, 2 stars +20%). New in 0.5.0: **walls upgrade all at once** (one "Upgrade Walls" button raises every wall a level; 8 wall levels, cheap on purpose). Edit mode: pick up your whole base into a hotbar (like Clash of Clans), re-lay it out, and save. *Visual:* a screenshot of the wave-cleared banner with stars.

**12. Online: accounts, achievements, leagues.** Facts: players log in with email and password; each account can have up to **5 villages**; cloud saves; **26 achievements** with gold rewards (Village, Battle and Builder groups); a global **leaderboard** ranked by furthest wave survived, with six **leagues**: Bronze (wave 5), Silver (20), Gold (40), Crystal (70), Champion (110), WarLord (160). The server checks wave progress so scores can't be faked easily. New in 0.5.0, **safer saving**: opening a village in a second tab tells the first one to stop saving it, an older copy on another tab or device can no longer overwrite newer progress (it's kept as a backup you can restore), and **Play Offline** lets you keep playing when the server can't be reached (everything is sent at the next login). *Visual:* the six league badges in a row, labeled with their waves, or the Profile window's league strip.

**13. Art and sound.** Facts: all art and sound effects were made by teammate Cole Martin: **236 images** and **55 sound and music files** (music for title, village, planning and attack, plus ambience that crossfades from day to night, and a sound for nearly every action). New in 0.5.0: an **animated title screen** (the logo drops in, the heroes breathe, the crocodile plane flies past, and while the game loads the mortar fires its man at the enemies; when loading finishes he hovers at the top of his arc), Mr. Least, new Brisket King poses, spell icons, gnome work poses, the Spear Thrower's pictures and new Diddypult pictures. A simple script (`npm run prepare-art`) crops, resizes and registers new art so artists can just drop files in. *Visual:* the title screen screenshot, plus a few pieces of art.

**14. How we built it (tech and process).** Facts: JavaScript (ES modules), **Phaser 3.90** game engine, **Vite** build tool, **Supabase** (login, database, leaderboard), hosted free on **GitHub Pages** and deployed automatically on every push. About **23,900 lines** of source code and **588 automated tests** (60 test files) that run in under 30 seconds. The key design idea: **all game rules are plain functions that never touch the graphics engine**, so they're easy to test; **every number (costs, health, timings) lives in one config file**, so balancing never means hunting through code. Process: the team wrote a full design spec first (a "build charter"), then built iteratively from playtesting. For 0.5.0, the **balance pass used a headless simulation** that plays waves through the real game rules at every Village Hall level and reports where a village first loses. *Visual:* a simple 3-box diagram: "Config (all numbers)" -> "Game rules (tested)" -> "Graphics and sound (Phaser)", with "Supabase" on the side.

**15. Challenges we solved + what's next.** Two columns.
- *Solved:* (1) **Late-game lag**: around wave 100 the game froze; profiling showed 96% of time in enemy pathfinding; after the fix the worst frame went from **16 seconds to under 30 milliseconds**. (2) **Huge waves**: past 400 enemies, each sprite stands in for several (more health, damage and reward) so difficulty is the same with far fewer sprites. (3) **Slow devices**: faster drawing (cached shapes, fewer redraws) and a **Graphics setting** (Auto / High / Low; Auto switches to Low by itself when the frame rate stays low); very high waves (tested to 500+) stay stable. (4) **Two tabs or devices overwriting progress**: every save is checked against the server's revision. (5) **Changing rules without breaking saves**: save migrations convert every older village (save versions 1 to 7 all load).
- *Next:* late-game rules (escalation past Village Hall 10, milestone rewards, whether Retry stays unlimited), something to spend Burgers on once every perk tree is full, more playtesting of the balance, more art (a fifth DJ Babyface picture).
End with a big "Thanks! Play it:" and the link, and "Questions?".

(If you need to cut to ~13 slides, merge 10 into 9 and 13 into 14.)

---

## 5. Style guide

- **Feel:** bright, chunky, game-UI look: dark slate header bars, warm cream "panel" backgrounds, orange and gold accents, green for positive buttons, red for danger. Rounded corners.
- **Colors (approx.):** dark slate `#3a424c`, cream `#f6f1e6`, orange `#f2a227`, gold `#ffc83a`, green `#6cbf2c`, red `#e2442f`, blue `#3d8fe0`.
- **Font:** the game uses **Lilita One** (a free Google font, SIL Open Font License; the file is `public/assets/fonts/LilitaOne-Regular.ttf`) for headings. Use it for slide titles if available, and a clean sans-serif (Calibri or Arial) for body text.
- **Backgrounds:** use the game's map art or the title screen image darkened behind big text, and cream panels for content.
- **Layout:** one idea per slide, a large picture on at least 10 of the slides, consistent title position, no walls of text.
- **Do not:** use stock photos of real people, add logos of other games, or put the game's characters in unrelated settings. Don't alter the game art.

---

## 6. Pictures to use

I will attach image files for you (the file names are listed so you know what each one is; they are in `public/assets/images/`). If I did not attach a picture you need, leave a clearly marked placeholder box labeled with the file name, rather than drawing your own version.

| Use | Files |
| --- | --- |
| Title and backgrounds | title scene: `title_bg.png` (landscape), `title_logo.png`, `title_wizard.png`, `title_archer.png`, `title_mortar_fire.png`, `title_flyer.png`; map: `game_map_grid.png` (day), `game_map_grid_dusk.png`, `game_map_grid_night.png`, `game_map_grid_dawn.png` |
| Enemies | `enemy_grunt.png`, `enemy_slinger.png`, `enemy_bomber.png`, `enemy_tank.png`, `enemy_shark.png`, `enemy_thief.png` (Mr. Least), `enemy_breaker.png`, `enemy_balloon.png`, `enemy_neegy.png`, `enemy_toilet.png`, `enemy_babycar.png` |
| Buildings (top level) | `bld_townHall_lv5.png`, `bld_mine_lv5.png`, `bld_storage_lv5.png`, `bld_house_lv5.png`, `bld_cannon_lv5.png`, `bld_archer_lv5.png`, `bld_mortar_lv5.png`, `bld_wizard_lv5.png`, `bld_firework_lv5.png`, `bld_spear_lv5.png`, `bld_flock_lv5.png`, `bld_mousetrap_lv5.png`, `bld_ra_lv4.png`, `bld_catapult_lv5.png`, `bld_altar_lv5.png`, `bld_rvlab_lv5.png`, `bld_fuelStation_lv4.png`, `bld_wall_lv8.png` |
| DJ Babyface | `bld_dj_lv1.png` to `bld_dj_lv4.png` |
| The Brisket King | `hero_brisket.png`, `hero_brisket_attack.png`, `hero_brisket_sleep.png`, `hero_brisket_select.png`, `ui_hero_crown.png`, `ui_feast_ready.png` |
| Spells (in `images/spells/`) | `ui_spell_rage.png`, `ui_spell_heal.png`, `ui_spell_freeze.png`, `ui_spell_heat.png`, `ui_spell_invisibility.png`, `ui_spell_lightning.png` |
| Leagues | `ui_league_bronze.png`, `ui_league_silver.png`, `ui_league_gold.png`, `ui_league_crystal.png`, `ui_league_champion.png`, `ui_league_warlord.png` |
| Other | `ui_achievement.png` (trophy), `ui_coin.png` (Bitcoin coin), `ui_research_point.png` (the burger icon), `ui_start_button.png` |

**Screenshots of the running game (I'll supply these; ask me for any that are missing):** (a) the animated title screen with the hovering mortar man, (b) a built-up village by day, (c) the same village at night, (d) the shop, (e) the RV Lab research window, (f) the Fuel Station window, (g) a wave in progress with the hotbar and spells, (h) the wave-cleared banner with stars, (i) the Profile window showing the league strip, (j) How to Play.

---

## 7. Optional extra: a 5-minute live demo script (put it in the last slide's notes)

1. Title screen (the mortar man hovering over the enemies), log in, show the village list.
2. Collect from a mine, show gnomes working, open the shop.
3. Open the RV Lab and research one perk; "New ability!" pops over every building of that type.
4. Open the Fuel Station and brew a spell.
5. Press Start Wave (at night if you can): the wave markers and the countdown, then the "restless" banner; cast the spell from the hotbar, set off Brisket Feast, and Drop the Beat when the meter fills.
6. Beat the wave: the cleared banner with stars, and everything rebuilds for free.
7. Open the Profile: achievements, league badges, leaderboard.

---

## 8. Quality checklist before you hand it back

- Every number on a slide appears in this document.
- No slide has more than 5 bullets or any paragraph longer than 2 lines.
- Every slide has speaker notes.
- The online slide lists the six leagues with their exact waves (5, 20, 40, 70, 110, 160).
- The waves slide says +8% enemies and +5% health per wave, and special waves every 3rd wave.
- The currency is called **Burgers** everywhere (never "RP"; "research points" only when saying it was renamed).
- The "What's next" list doesn't list spells (they're done).
- Team names and roles match section 3 exactly.
- At the end of your reply, list any placeholder pictures you left and any choices you made.
