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

v0.6 drops (KSI Tower, the five v0.6 enemies, the Skeleton, spell sounds); sounds were installed to `art-source/audio/`, whose game copies `npm run prepare-audio` makes:

| Dropped file | Installed as |
| --- | --- |
| `Big Yahu Defeated Pose.png` | `art-source/enemies/enemy_yahu_death.png` |
| `Big Yahu Enemy Attack Pose.png` | `art-source/enemies/enemy_yahu_attack.png` |
| `Big Yahu Enemy Idle.png` | `art-source/enemies/enemy_yahu.png` |
| `Brr Brr PataPim Attack Pose Image.png` | `art-source/enemies/enemy_patapim_attack.png` |
| `Brr Brr Patapim Death Pose.png` | `art-source/enemies/enemy_patapim_death.png` |
| `Brr Brr Patapim Idle Image.png` | `art-source/enemies/enemy_patapim.png` |
| `John Pork Attack Pose.png` | `art-source/enemies/enemy_pork_attack.png` |
| `John Pork Calling Pose.png` | `art-source/enemies/enemy_pork_call.png` |
| `John Pork Death Pose.png` | `art-source/enemies/enemy_pork_death.png` |
| `John Pork Enemy.png` | `art-source/enemies/enemy_pork.png` |
| `KSI Tower Bottle projectile image.png` | `art-source/projectiles/proj_ksi.png` |
| `KSI Tower L1.png` | `art-source/buildings/bld_ksi_lv1.png` |
| `KSI Tower L2.png` | `art-source/buildings/bld_ksi_lv2.png` |
| `KSI Tower L3.png` | `art-source/buildings/bld_ksi_lv3.png` |
| `KSI Tower L4.png` | `art-source/buildings/bld_ksi_lv4.png` |
| `KSI Tower L5.png` | `art-source/buildings/bld_ksi_lv5.png` |
| `La Vaca Saturno Attack Image.png` | `art-source/enemies/enemy_vaca_attack.png` |
| `La Vaca Saturno Boulder Projectile Image.png` | `art-source/projectiles/proj_vaca.png` |
| `La Vaca Saturno Death Image.png` | `art-source/enemies/enemy_vaca_death.png` |
| `La Vaca Saturno Idle.png` | `art-source/enemies/enemy_vaca.png` |
| `Rahhh Skeleton Attack pose image.png` | `art-source/enemies/enemy_skeleton_attack.png` |
| `Rahhh Skeleton Death Frame Image.png` | `art-source/enemies/enemy_skeleton_death.png` |
| `Rahhh Skeleton Idle.png` | `art-source/enemies/enemy_skeleton.png` |
| `Rahhh Skeleton Rage Ability Image.png` | `art-source/enemies/enemy_skeleton_rage.png` |
| `Spawned Skelaton image.png` | `art-source/enemies/enemy_bones.png` |
| `Spawned Skeleton Attack Image.png` | `art-source/enemies/enemy_bones_attack.png` |
| `Spawned Skeloton death image.png` | `art-source/enemies/enemy_bones_death.png` |
| `Brr Brr Patapim Walking Sound effect.mp3` | `art-source/audio/sfx_patapim_quake.mp3` |
| `Freeze Spell Deploy Sound Effect.mp3` | `art-source/audio/sfx_spell_freeze.mp3` |
| `Heal Spell Sound Effect.mp3` | `art-source/audio/sfx_spell_heal.mp3` |
| `Heat Field Spell Sound Effect.mp3` | `art-source/audio/sfx_spell_heat.mp3` |
| `Invisibility Spell Sound Effect.mp3` | `art-source/audio/sfx_spell_invisibility.mp3` |
| `John Pork Calling Sound.mp3` | `art-source/audio/sfx_pork_call.mp3` |
| `KSI Tower Projectile Impact.mp3` | `art-source/audio/sfx_ksi_impact.mp3` |
| `La Vaca Saturno Projectile Impact.mp3` | `art-source/audio/sfx_vaca_impact.mp3` |
| `Lightning Spell Sound Effect.mp3` | `art-source/audio/sfx_spell_lightning.mp3` |
| `Rage Spell Sound Effect.mp3` | `art-source/audio/sfx_spell_rage.mp3` |
| `Rahhh Skeleton Ability Sound effect.mp3` | `art-source/audio/sfx_skeleton_rage.mp3` |
| `Rahhh Skeleton Attack Sound effect.mp3` | `art-source/audio/sfx_skeleton_attack.mp3` |
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

v0.7 drops (Bri Bri Bicus Dicus, Frigo Camillo, Bombombini Gusini, Lirili Larila, Chimpanzini Bananini):

| Dropped file | Installed as |
| --- | --- |
| `Chimanzini bananini Death Pose.png` | `art-source/enemies/enemy_chimp_death.png` |
| `Chimpanzini Bananini Image.png` | `art-source/enemies/enemy_chimp.png` |
| `Chimpanzini bananini Attack Image.png` | `art-source/enemies/enemy_chimp_attack.png` |
| `Frigo Camillo Death Pose.png` | `art-source/enemies/enemy_frigo_death.png` |
| `Frigo Camillo Idle Image.png` | `art-source/enemies/enemy_frigo.png` |
| `Frigo Camillo attack Pose.png` | `art-source/enemies/enemy_frigo_attack.png` |
| `Lirili Larila Attack Pose Image.png` | `art-source/enemies/enemy_lirili_attack.png` |
| `Lirili Larila Death pose.png` | `art-source/enemies/enemy_lirili_death.png` |
| `Lirili Larila Idle Image.png` | `art-source/enemies/enemy_lirili.png` |
| `bombombini gusini Attack Pose.png` | `art-source/enemies/enemy_bombo_attack.png` |
| `bombombini gusini Death pose.png` | `art-source/enemies/enemy_bombo_death.png` |
| `bombombini gusini idle image.png` | `art-source/enemies/enemy_bombo.png` |
| `bri bri bicus dicus attack pose image.png` | `art-source/enemies/enemy_bicus_attack.png` |
| `bri bri bicus dicus idle image.png` | `art-source/enemies/enemy_bicus.png` |
| `bri bri bicus dicus armor break sound.mp3` | `art-source/audio/sfx_bicus_armor_break.mp3` |
| `Leaderboard 1st Gold Medal Icon.png` | `art-source/ui/ui_medal_1.png` |
| `Leaderboard 2nd Silver Medal Icon.png` | `art-source/ui/ui_medal_2.png` |
| `Leaderboard 3rd bronze medal icon.png` | `art-source/ui/ui_medal_3.png` |

v0.7.1 voice lines (lirili cropped to 3 s):

| Dropped file | Installed as |
| --- | --- |
| `brri-brri-dicus-bicus-bombicus.mp3` | `art-source/audio/sfx_bicus_voice.mp3` |
| `47-frigo-camelo.mp3` | `art-source/audio/sfx_frigo_voice.mp3` |
| `brr-brr-patapim.mp3` | `art-source/audio/sfx_patapim_voice.mp3` |
| `lirili-larila.mp3` | `art-source/audio/sfx_lirili_voice.mp3` |
| `Da Baby Car Sound Effect.mp3` | `art-source/audio/sfx_babycar_voice.mp3` (v0.7.1, Da Baby Car's voice line) |

v0.8.0 new enemies (Quandale Dingle, Grimace Golem):

| Dropped file | Installed as |
| --- | --- |
| `Quandale Dingle Idle Image.png` | `art-source/enemies/enemy_quandale.png` |
| `Quandale Dingle Attack Pose.png` | `art-source/enemies/enemy_quandale_attack.png` |
| `Quanddale dingle death pose.png` | `art-source/enemies/enemy_quandale_death.png` |
| `Grimace Enemy Idle.png` | `art-source/enemies/enemy_grimace.png` |
| `Grimace Enemy Attack.png` | `art-source/enemies/enemy_grimace_attack.png` |
| `Grimace Enemy death image.png` | `art-source/enemies/enemy_grimace_death.png` |
| `Quandale Dingle Dash Start Sound Effect.mp3` | `art-source/audio/sfx_quandale_dash.mp3` |
| `Quandale dingle troop random sound effect.mp3` | `art-source/audio/sfx_quandale_voice.mp3` |
| `Gear Icon Image.png` | `art-source/ui/ui_merge_gear.png` (v0.8.0, the badge over merged defenses) |
| `Merged Locklair Tower.png` | `art-source/buildings/bld_archer_merged.png` (v0.8.0, the Locklair Citadel) |
| `Merged Mortar Image.png` | `art-source/buildings/bld_mortar_merged.png` (v0.8.0, the merged Mortar, three barrels) |
| `Merged Litman Mortar V2.png` | `art-source/buildings/bld_mortar_merged.png` (v0.8.0, replaces the first merged Mortar picture) |
| `Litman MultiMortar Image V2.png` | `art-source/buildings/bld_mortar_merged.png` (v0.8.1, replaces the v0.8.0 merged Mortar picture) |
| `Merged Gandolf Tower.png` | `art-source/buildings/bld_wizard_merged.png` (v0.8.2, Gandolf the Grand) |
| `Cloack Icon for Hatsune Queen Ability.png` | `art-source/ui/ui_encore_ready.png` (v0.8.2, the Hatsune Queen's Encore Cloak icon) |
| `Spear_Thrower_Merged.zip` (`Spear_Thrower_Merged_down_left/_down_right/_up_left/_up_right.png`) | `art-source/buildings/bld_spear_merged_dl/_dr/_ul/_ur.png` (v0.8.6, the Harpoon Ballista, 4 facings) |
| `Merged FLOCK Tower.png` | `art-source/buildings/bld_flock_merged.png` (v0.8.3; the same file, installed then) |
| `ui_ability_*.png` (7), `ui_merge_gear.png`, `ui_armor_shield.png` | dropped already named, moved straight to `art-source/ui/` (v0.8.5: merged ability icons, the new merge gear (replaces `Gear Icon Image.png`), the armor shield) |
| `Merged Firework Launcher aimed left image 2.png` | `art-source/buildings/bld_firework_merged_left.png` (v0.8.0, merged Firework Launcher, aiming left) |
| `Merged Firework Launcher aimed right Image.png` | `art-source/buildings/bld_firework_merged_right.png` (v0.8.0, aiming right) |
| `merged cannon_sprites.zip` (and an identical `cannon_sprites.zip`) | `art-source/buildings/bld_cannon_merged_dl/_dr/_ul/_ur.png` (v0.8.0, the Mega Cannon, 4 facings) |

v0.8 drops (the Hatsune Queen):

| Dropped file | Installed as |
| --- | --- |
| `Hatsune Queen Alter Level 1.png` ... `Level 5.png` | `art-source/buildings/bld_queenAltar_lv1.png` ... `lv5.png` |
| `Hatsune Queen Idle Image.png` | `art-source/heroes/hero_queen.png` |
| `hatsune Queen shooting pose image.png` | `art-source/heroes/hero_queen_attack.png` |
| `Hatsune Queen Sleeping or Knocked out pose.png` | `art-source/heroes/hero_queen_sleep.png` (also her knocked-out picture) |
| `hatsune queen clicked on sound.mp3` | `art-source/audio/sfx_queen_select.mp3` |
| `Merge Building Sound.mov` | `art-source/audio/sfx_merge.mp3` (v0.8.0, audio extracted with ffmpeg; plays when two buildings merge) |
| `New Perk Unlocked sound.mp3` | `art-source/audio/sfx_ability_unlocked.mp3` (v0.8.0, replaces the old perk-researched sound) |
| `sfx_ability_unlocked_v1.mp3` | the old perk-researched sound it replaced (kept for reference) |
