# unused-assets

Image and audio files the game does not use, kept here (outside `public/`, so Vite never ships them).
The folders under here mirror where each file came from. Nothing in `src/`, `scripts/prepare-art.mjs`,
`index.html` or the web manifest points at these files. To use one again, move it back to the same path and
run `npm run prepare-art` (an `art-source/` file also needs a matching rule in that script's `TARGETS`).

## public/ and art-source/ (in git)

| File | Why it's here |
| --- | --- |
| `public/assets/images/ui/ui_title_background.png` | The old flat title picture (logo painted in). It was listed in the manifest but never loaded (`UNLOADED_FILES`); the title screen is now the animated `TitleBackdropScene`. Kept as that scene's layout reference. |
| `art-source/ui/ui_title_background.png` | Its full-size original (the `prepare-art` source of the file above). |
| `public/assets/images/ui/ui_research_point_flask_v1.png` | The old research point (RP) token: a gold hexagon with a book and flask. In 0.5.0 research points became **Burgers** and the burger picture took over the same key, `ui_research_point`. |
| `art-source/ui/ui_research_point_flask_v1.png` | Its full-size original. |

Older versions of the title picture (`ui_title_background_v1`-`v5`) are in `docs/archive/`.

## root/ (on disk only, git-ignored)

Raw files that were dropped into the project root to be installed. Each one is byte-for-byte the same as a
file the game already uses, so they're only originals with their first names:

| Dropped file | Installed as |
| --- | --- |
| `Archer Character.png` | `art-source/title/title_archer.png` |
| `Gandolf Character.png` | `art-source/title/title_wizard.png` |
| `Mortar Firing Image.png` | `art-source/title/title_mortar_fire.png` |
| `Character Flying out of Mortar Image.png` | `art-source/title/title_flyer.png` |
| `Flying guy Pose Image.png` | `art-source/title/title_flyer_pose.png` |
| `IBTD base background no characters.png` | `art-source/title/title_bg.png` |
| `Brisket King interact pose.png` | `art-source/heroes/hero_brisket_select.png` |
| `Hero UI crown image.png` | `art-source/ui/ui_hero_crown.png` |
| `Gnome Blade.png` | `art-source/villagers/villager_gnome.png` |
| `gnome interact pose image.png` | `art-source/villagers/villager_gnome_work.png` |
| `Mr Least Character Image(replaces Goyum Goblin).png` | `art-source/enemies/enemy_thief.png` |
| `Mr Least Attack Frame.png` | `art-source/enemies/enemy_thief_attack.png` |
| `Mr. Least Death Frame.png` | `art-source/enemies/enemy_thief_death.png` |
| `skibidi Toilet Attack Image.png` | `art-source/enemies/enemy_toilet_attack.png` |
| `Fuel Station Level 1.png` ... `Level 4.png` | `art-source/buildings/bld_fuelStation_lv1.png` ... `lv4.png` |
| `The Diddypult Level 4.png`, `Level 5.png` | `art-source/buildings/bld_catapult_lv4.png`, `lv5.png` |
| `Spear_Thrower.zip` (20 PNGs: levels 1-5, facings NE/NW/SE/SW) | `art-source/buildings/bld_spear_lv1..5_ur/_ul/_dr/_dl.png` (SW is also the plain `bld_spear_lvN.png`) |
| `Burger Icon Image(replaces RP).png` | `art-source/ui/ui_research_point.png` (the Burger icon) |
| `Spear Thrower Projectile.png` | `art-source/projectiles/proj_spear.png` |
| `Rage Spell Image(Karuba Coffee).png` | `art-source/spells/ui_spell_rage.png` |
| `Healing Spell Icon(Donut).png` | `art-source/spells/ui_spell_heal.png` |
| `Freeze spell image (Ice Bag).png` | `art-source/spells/ui_spell_freeze.png` |
| `Burn Spell Image(Spicy Tornado).png` | `art-source/spells/ui_spell_heat.png` |
| `Invisibility Spell Icon(Chocolate Milk).png` | `art-source/spells/ui_spell_invisibility.png` |
| `Lightning Spell Icon(energy Drink).png` | `art-source/spells/ui_spell_lightning.png` |
| `Spear thrower sound 1.mp3`, `sound 2.mp3` | `public/assets/audio/sfx_spear_fire1.mp3`, `sfx_spear_fire2.mp3` |
| `Spear thrower hit enemy sound effect.mp3` | `public/assets/audio/sfx_spear_hit.mp3` |

## Not here on purpose

- `docs/archive/` and `docs/branding/` are already archives (old art versions, the original logo the icons are made from).
- `dist/` is build output.
