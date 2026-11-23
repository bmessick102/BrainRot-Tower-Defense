# Brief for an AI: build a PowerPoint presentation for "Italian Brainrot Tower Defense"

You are being asked to create a PowerPoint presentation (.pptx) about a video game that a small student team built. Everything you need to know is in this document. **Use only the facts written here (and in README.md, which is the source of truth). Do not invent features, numbers, quotes, release dates, or team members.** If something you want to say isn't in this document, leave it out.

*This brief describes version 0.9.1.* The deck built from it is `docs/presentation/Italian_Brainrot_TD_v0.9.1.pptx` (the v0.8.8 deck is in git history) (the old v0.5 deck, `Italian_Brainrot_TD_v0.5.0.pptx`, is kept for reference).

---

## 1. What I want from you

- **Deliverable:** one `.pptx` file, **27 slides**, 16:9, saved as `docs/presentation/Italian_Brainrot_TD_v<package.json version>.pptx`.
- **One story:** a player's journey from the first ruined Village Hall to the late game. Each slide reveals the next buildings, features and enemies the player meets, in that order. It should feel like a **game trailer in slides**: short punchy headlines, big pictures, building excitement.
- **Speaker notes on every slide:** 2 to 3 simple sentences to say out loud.
- **Words per slide:** at most about 15 (headline plus one line), except the enemy and building grids (a name plus 3-6 words each). Plain language a 12-year-old gets. No code terms, config keys or file names on slides; words players see in the game are fine (Burgers, Village Hall, Mastery).
- **Every enemy appears** (24 in all), on the slide for the Village Hall where players meet it (section 4).
- **File size:** compress pictures; aim under about 40 MB (the v0.9.1 deck is about 23 MB).

If anything below is unclear, make a sensible choice and say what you chose in one sentence at the end.

---

## 2. The game in one paragraph

**Italian Brainrot Tower Defense** is a free, single-player base-builder tower defense that runs in a web browser (desktop, phones and tablets, no install). Every new game starts with the Village Hall in **ruins**: you rebuild it, mine gold (Bitcoin), build and upgrade defenses on an isometric grid, and survive endless waves of internet "Italian Brainrot" meme characters. A wave only starts when you press **Start Wave**, and every wave is tougher than the last, so the goal is to **survive as long as possible**. Defeated enemies and beaten waves also pay **Burgers**, the second currency, spent on perks, spells, hero levels and Mastery. Village Halls go up to **15**; each one unlocks new buildings and new enemies. Late in the game, two top-level defenses (Level 10; the Diddypult's top is Level 5) can **merge** into one giant building with a special ability. Players have accounts with cloud saves, leagues, a leaderboard of every village, profiles, and can visit other players' villages.

- **Play it:** https://bmessick102.github.io/BrainRot-Tower-Defense/
- **Code:** https://github.com/bmessick102/BrainRot-Tower-Defense
- **Current version:** 0.9.1
- It is an unofficial fan game, not endorsed by Supercell (the game's Credits carry Supercell's Fan Content Policy notice).

## 3. The team

| Person | Role |
| --- | --- |
| Brady Messick | Creator: the game concept, the design and every part of the game (code, art, sound, UI, testing) |
| Robert | Code |
| Cole Martin | Game art, sound effects, UI/UX |
| Nathan DiCarlo | Testing, Kanban board |

(These are the README's roles. The in-game Credits, `src/credits.js`, word some roles differently and also credit Supercell and Pixabay for sound effects and ChatGPT for AI-generated images, so **don't claim all art and sound was made by the team**.)

**How we built it:** JavaScript, the **Phaser 3** game engine, **Vite**, and **Supabase** for logins, saves and the leaderboard; hosted on GitHub Pages. The code was written with an **AI coding assistant** under Brady's direction. The game rules are plain functions with automated tests, and the tests run on every push before the game is published.

---

## 4. Slide-by-slide outline

Follow this order. Every content slide has a **stage marker** at the top right: a gold-rimmed pill ("VILLAGE HALL 3") with a row of 15 dots, filled up to that hall, so the progression is obvious. "Cards" are rounded dark panels with a cut-out picture on a soft glow: **red rim = enemy, green = your building, purple = new feature, orange = hero, gold = merged**.

**1. Title.** The game logo over the title-screen art; tagline **"Memes are coming for your village."**; small line "Created by Brady Messick · Free in your browser · v0.9.1". Cut-outs: Tung Tung Tung Sahur, the Sneaker Shark, the crocodile bomber.

**2. The idea in one breath.** "Build a village. Survive the brainrot." / "Endless waves. Free in your browser." Three icon rows: Build and upgrade · Beat endless meme waves · Play free, even on phones. Screenshot of a village by day.

**3. "A bigger battlefield."** (marker: THE MAP, no dots; v0.9) Two framed screenshots: the whole new 40 x 40 map with a red marker at each of its 7 entrances ("THE NEW 40 x 40 MAP"), and troops crossing the bridge ("OVER THE BRIDGE"). Chips: "40 x 40 tiles of room to build" · "7 ways in, never the lake" · "All 7 open by Village Hall 13".

**4. "Grass grows. Buildings clear it."** (v0.9.1) "Just for looks: nothing ever gets in your way." A close-up of a Cannon on cleared grass among grass tufts. Rows: grass tuft "Grass tufts dot the field" · Cannon "Build on one and it vanishes" · Village Hall "Solid ground under buildings".

**5. It starts in ruins.** (marker: THE START, no dots) "Rebuild the hall. Mine gold. Place your first Cannon." The ruined hall → Village Hall 1, and a 4-step loop ring: **Earn → Build → Upgrade → Start Wave**.

**6. Village Hall 1: "Then the first meme marches in."** "Waves come only when you press Start Wave." Buildings: Cannon, Bitcoin Mine, Villager House (gnomes mine and repair), Walls. Enemy: **Tung Tung Tung Sahur**.

**7. Village Hall 2: "More towers. Sneakier memes."** Buildings: Locklair Tower, Litman Mortar, Mousetrap. Enemies: **Cappuccino Assasino**, **Mr. Least**.

**8. Village Hall 2: "Snacks become spells."** The Fuel Station brews six spells with Burgers, cast from the hotbar: Karuba Coffee (Rage), Donut (Heal), Ice Bag (Freeze), Spicy Tornado (Heat Field), Chocolate Milk (Invisibility), Energy Drink (Lightning Strike). The first Karuba Coffee is free. Burgers are won by beating enemies and waves.

**9. Village Hall 3: "Then the sky fills with bombers."** New enemies: **Bombadillo Crocadillo**, **Tralalero Tralala**, **Boneca Ambalabu**, **Neegy Balloon** (with a small **Neegy**). "Your answer": Gandolf Tower, Firework Launcher, Spear Thrower, F.L.O.C.K Tower.

**10. Village Hall 4: "Spend Burgers on new powers."** The RV Lab: every defense has 3 perk paths of 5 tiers; one pick upgrades every building of that type; the first pick locks the path (a paid reset lets you switch). Screenshot of the research window.

**11. Village Hall 4: "A king joins the fight."** The Brisket King guards his altar; Brisket Feast (once per wave) heals him, powers him up and slams nearby enemies. His levels cost Burgers. Enemies: **Tripi Tropi Tropi Tripa**, **John Pork**.

**12. Village Hall 5: "Drop the beat. Freeze the field."** DJ Babyface (Drop the Beat: nearby defenses fire faster), KSI Tower (ice bottles slow enemies). Enemies: **Skibidi Toilet**, **Bri Bri Bicus Dicus** (with the armor shield, `ui_armor_shield`, under his card text).

**13. "When night falls, memes get restless."** (marker: NIGHTFALL) The day/night cycle runs on its own (about 8 minutes). Restless nights: enemies hit harder and move faster, but pay +25% gold and Burgers. With no raid on, heroes walk home and sleep at their altar. Day and night screenshots side by side. (Day and night isn't tied to a Village Hall; it sits here in the story.)

**14. Village Hall 6: "The dead rise. The cold creeps in."** Tower of Rah (a beam that heats up on one enemy). Enemies: **Rahhh Skeleton** (with a small **Skeleton**), **Frigo Camillo**.

**15. Village Hall 6: "Then the boss drives in."** **Da Baby Car**, the raid boss, drives straight at the Village Hall and bursts into troops when it falls. Every wave has a theme (e.g. Dash Gang, Air Raid, Jungle Stampede, Iron Legion); every 10th wave is a Boss Wave. Battle screenshot.

**16. Village Hall 7: "Boulders from above. Dashes below."** Enemies: **La Vaca Saturno**, **Quandale Dingle** (walls stop his dash).

**17. Village Hall 8: "A second hero takes the stage."** The Hatsune Queen: crossbow hero, hits ground and air; Encore Cloak (vanish, heal, hit harder). Enemies: **Big Yahu**, **Bombombini Gusini**.

**18. Village Halls 9-10: "The ground shakes. The jungle calls."** **Lirili Larila** (VH9); The Diddypult (VH10, baby-oil pools that slow); **Brr Brr Patapim** (VH10, with a small **Chimpanzini Bananini**).

**19. Village Halls 11-15: "Five more Village Halls."** **Grimace Golem** (VH11, the last enemy). What each hall adds: 11: Tower of Rah, Gandolf, Diddypult, KSI, Cannon, Mine, Storage, House · 12: Tower of Rah, Gandolf · 13: Diddypult, KSI, Locklair, Storage · 14: Cannon, Mortar, Spear Thrower, F.L.O.C.K · 15: Tower of Rah, Firework, Mine, Storage, House · every hall +12 walls.

**20. Merging: "Two maxed towers. One giant."** "Merge two top-level defenses. Unlock a special ability." Two top-level copies merge (Level 10; the Diddypult at Level 5; it still counts as two). Eight cards, each with its ability icon: Mega Cannon (Rolling Thunder), Locklair Citadel (Ballista Bolt), Litman Triple Mortar (Triple Strike), Missile Silo (Sky Net), Gandolf the Grand (You Shall Not Pass), F.L.O.C.K Mothership (Triple Zap), Harpoon Ballista (Reel In), KSI Frost Fortress (Shatter: chilled foes burst). The ninth, the Diddy Trebuchet, has its own slide (22).

**21. "Then go for gold."** The gold Mastery column in the RV Lab: 3 Mastery tiers per merged tower, paid in Burgers; the gear badge marks a merged building.

**22. "Then the barrels fly."** (marker: LATE GAME) "Two Level 5 Diddypults merge into the Diddy Trebuchet." A screenshot of a barrel burst into five oil pools beside the Trebuchet; card: the Diddy Trebuchet, "Barrel Burst: oil jugs everywhere"; chips "Bursts into 4 oil jugs" (its ability icon) · "Hits twice as hard" (the Diddypult).

**23. "Lose a fight, never your village."** Free rebuilds after every wave · Wave stars (up to 3) · 2x and 4x speed · Edit mode (rearrange the base; no selling since v0.8.0).

**24. "Climb the leagues. Visit any village."** Accounts and cloud saves (up to 5 villages), 26 achievements, the six leagues with their waves (Bronze 5, Silver 20, Gold 40, Crystal 70, Champion 110, WarLord 160), the leaderboard (one row per village), player profiles and visiting. Leaderboard and visit screenshots.

**25. "Polished down to the title screen."** Animated title screen, What's New, How to Play, the home-screen app icon; a band of cut-outs with "Game art and sound effects by Brady Messick and teammate Cole Martin, who also shaped the game UI".

**26. "Created by Brady Messick."** The four team cards (initials, name, role; Brady's says "Game creator: the concept, the design and every part of the game.") and a "How we built it" band (section 3).

**27. Closer.** App icon; **"Play free in your browser."**; the link; "Desktop, phones and tablets. No install."; small "Unofficial fan game. Not endorsed by Supercell." Behind the dark panel (80% opaque, so the text stays clear) and around the icon, all 24 enemies as cut-outs: flyers in the sky, the big ones on the hills, a crowd under the panel and three in the front corners.

### Every enemy, by the Village Hall where it joins (check against README and `src/enemyText.js`)

| Hall | Enemies (job in a few words) |
| --- | --- |
| 1 | Tung Tung Tung Sahur (everyday foot soldier) |
| 2 | Cappuccino Assasino (throws from a distance), Mr. Least (invisible gold thief) |
| 3 | Bombadillo Crocadillo (flying bomber), Tralalero Tralala (leaps walls), Boneca Ambalabu (blows up walls), Neegy Balloon (drops Neegies) |
| 4 | Tripi Tropi Tropi Tripa (slow tank, huge health), John Pork (silences F.L.O.C.K Towers) |
| 5 | Skibidi Toilet (tunnels under walls), Bri Bri Bicus Dicus (armor first, then health) |
| 6 | Rahhh Skeleton (summons Skeletons), Frigo Camillo (aura slows defenses), Da Baby Car (raid boss) |
| 7 | La Vaca Saturno (bouncing boulders), Quandale Dingle (dash and stun) |
| 8 | Big Yahu (calls in missiles), Bombombini Gusini (fire-breathing flying goose) |
| 9 | Lirili Larila (earthquake stomps) |
| 10 | Brr Brr Patapim (drops Chimpanzini Bananinis) |
| 11 | Grimace Golem (goo trail angers troops) |

Sub-troops (Neegy, Skeleton, Chimpanzini Bananini) appear smaller next to whoever brings them. That's 24.

---

## 5. Style guide

- **Feel:** the game's own chunky, rounded look: dark rounded panels with colored rims, gold accents, white headline text with a dark outline.
- **Colors** (from `src/theme.js`): deep green `#173A12` (base), gold `#FFD84A`, purple `#9B59E8`, orange `#F2A227`, green `#6CBF2C`, red `#E2442F`, blue `#3D8FE0`, dark frame `#1B1712`, stone `#EFE9DC`.
- **Fonts:** **Lilita One** for headlines (the game's font, SIL Open Font License, `public/assets/fonts/LilitaOne-Regular.ttf`; embed it in the .pptx so other computers show it), **Calibri** for body text.
- **Backgrounds:** the title art and the map art (day, dusk, night), blurred and darkened toward deep green or purple. The title and closing slides use the title art unblurred, darker at the bottom.
- **Layout:** title top left (Lilita One 38 pt), a gold subtitle line under it, the stage marker top right, cards and screenshots below; slide number and a small footer at the bottom. Screenshots sit in gold-rimmed frames at their real aspect ratio.
- **Do not:** use stock photos of real people, add logos of other games, or alter the game art.

---

## 6. Pictures to use

- **Cut-outs** (transparent PNGs in `art-source/`): enemies `enemies/enemy_<kind>.png` (grunt, slinger, thief, bomber, shark, breaker, balloon, neegy, tank, pork, toilet, bicus, skeleton, bones, frigo, babycar, vaca, quandale, yahu, bombo, lirili, patapim, chimp, grimace); buildings `buildings/bld_<type>_lv1..lv5.png` (townHall also lv0 = the ruins; ra lv1-4; fuelStation lv1-4; wall lv1-8) and the merged ones `bld_cannon_merged_dl`, `bld_archer_merged`, `bld_mortar_merged`, `bld_firework_merged_left`, `bld_wizard_merged`, `bld_flock_merged` (no Spear Thrower merged picture yet); heroes `heroes/hero_brisket*.png`, `hero_queen*.png`; spells `spells/ui_spell_*.png`; UI `ui/` (coin, burger `ui_research_point`, league badges, medals, merge gear, Feast and Encore icons, edit-layout button); gnomes `villagers/`.
- **Title and map:** `art-source/title/` (title_bg, title_logo...), `art-source/map/` (day, dusk, night, dawn). Logo `docs/branding/Italian_Brainrot_TD_Logo.png`, app icon `docs/branding/app_icon.png`.
- **Smooth corners:** square pictures (screenshots, the app icon) are clipped to rounded rectangles matching their frame's corners (the app icon on its own: 22% corners), never square corners inside a rounded frame.
- **Screenshots** (fresh for v0.8.3): a village by day and the same at night, Da Baby Car leading a themed wave with the hotbar, the RV Lab research window, the RV Lab with the gold Mastery column, the merge window, the Fuel Station window, What's New, How to Play (Enemies tab), the leaderboard, a player card, visiting a village, the title screen. **No email address may show in any screenshot** (the game shows usernames only).
- **How the v0.8.3 screenshots were made:** the dev server with `?backend=local` and headless Chrome. The local backend's database (`ibtd.dev.db` in localStorage) was seeded with demo accounts (made-up usernames like BrainrotBoss and TungTungTitan) and villages built with the game's own rules (a Village Hall 15 village with every merged defense, a Village Hall 8 village), so the leaderboard and profiles have rows. Those players are demo data, not real players.

---

## 7. Optional extra: a 5-minute live demo script

1. Title screen (animated), log in, What's New, the village list.
2. Collect from a mine, open the shop, show gnomes working.
3. Open the RV Lab: research a perk ("New ability!" pops over every building of that type); show the gold Mastery column on a merged tower.
4. Open the Fuel Station and brew a spell.
5. Press Start Wave (at night if you can): the wave markers and countdown, the themed-wave name, then cast a spell from the hotbar, set off Brisket Feast and Encore Cloak, and toggle 2x speed.
6. Beat the wave: the cleared banner with stars, everything rebuilds for free.
7. Leaderboard → a player's profile → Visit their village.

---

## 8. Quality checklist before you hand it back

- Every fact on a slide is in this document or README.md; the team names and roles match section 3.
- All 24 enemies appear, each on its Village Hall's slide, with a picture and a short job.
- The merging slide shows all seven merged buildings with their abilities.
- The online slide lists the six leagues with their exact waves (5, 20, 40, 70, 110, 160).
- The currency is called **Burgers** everywhere; no selling is mentioned as a feature (it was removed in v0.8.0).
- Every slide has speaker notes; no slide goes over about 15 words outside the card grids.
- Render every slide to an image and check: no text overflowing or cut off, nothing overlapping, text readable on its background, no email in any screenshot.
- At the end of your reply, list any facts you left out because you couldn't confirm them, and any choices you made.
