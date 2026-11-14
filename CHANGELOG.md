# Changelog

The version shows in the bottom-left corner of every screen (`package.json` `version` plus the commit). Details for everything below are in [README.md](README.md).

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
- **Hidden building outlines:** buildings that are mostly covered get a thin light-blue outline.
- **Labels only when needed:** the level and tier pips are one small chip, shown only on the hovered or selected building (and in edit mode). Damaged buildings always show their health bar.
- **Ground plots:** a soft dirt plot under each building shows which tiles it uses.

### Also new
- **Profile:** a profile pill (top left) with your league, rank, achievements and lifetime stats, plus a badge for unclaimed rewards and news. Achievement sound.
- **Layout editor:** move buildings in edit mode, with a hotbar, Remove All and Save.
- **Other:** sign-up "are you human?" check (Cloudflare Turnstile), and the version label.
- **How to Play:** restructured, with pages for buildings, upgrades and the RV Lab.

## 0.2.0

- Online accounts (Supabase): login, up to 5 villages per account, achievements, leaderboard and league badges. Served from GitHub Pages at `/BrainRot-Tower-Defense/`.
