# Enemy art

Put the enemy pictures in this folder, then run `npm run prepare-art` from the project folder. The game uses them right away; until a file exists, the game shows a colored shape.

## File names (exact, lowercase)

| File | Enemy | What it does | Shown in game at about |
| --- | --- | --- | --- |
| `enemy_grunt.png` | Grunt | Small, weak, comes in big swarms, punches buildings | 40 px tall |
| `enemy_slinger.png` | Slinger | Ranged attacker, throws things from 5 tiles away | 44 px tall |
| `enemy_bomber.png` | Bomber | Flies over everything and drops bombs | 46 px tall |
| `enemy_tank.png` | Tank | Big, slow, very tough melee bruiser | 62 px tall |
| `enemy_shark.png` | Sneaker Shark | Fast raider that leaps over walls | 50 px tall |
| `enemy_pork.png` (+ `_attack`, `_call`, `_death`) | John Pork | Phones in to silence F.L.O.C.K Towers | 54 px tall |
| `enemy_skeleton.png` (+ `_attack`, `_rage`, `_death`) | Rahhh Skeleton | Bashes his shield (`_rage`) to summon Skeletons | 52 px tall |
| `enemy_bones.png` (+ `_attack`, `_death`) | Skeleton | Summoned by Rahhh Skeletons (drawn facing left) | 38 px tall |
| `enemy_bicus.png` (+ `_attack`) | Bri Bri Bicus Dicus | Armored legionary: armor before health (idle faces left) | 56 px tall |
| `enemy_frigo.png` (+ `_attack`, `_death`) | Frigo Camillo | Cold aura that slows defenses (faces left) | 58 px tall |
| `enemy_bombo.png` (+ `_attack`, `_death`) | Bombombini Gusini | Fire-breathing flyer (draw it flying, no shadow) | 60 px tall |
| `enemy_lirili.png` (+ `_attack`, `_death`) | Lirili Larila | Earthquake tank (Brr Brr Patapim's old ability) | 82 px tall |
| `enemy_chimp.png` (+ `_attack`, `_death`) | Chimpanzini Bananini | Dropped by Brr Brr Patapim; dives into a building | 40 px tall |
| `enemy_vaca.png` (+ `_attack`, `_death`) | La Vaca Saturno | Flyer throwing bouncing boulders (draw it flying, no shadow) | 64 px tall |
| `enemy_yahu.png` (+ `_attack`, `_death`) | Big Yahu | Calls missiles down | 56 px tall |
| `enemy_patapim.png` (+ `_attack`, `_death`) | Brr Brr Patapim | Drops Chimpanzinis as he walks in (v0.7) | 82 px tall |

Optional extras (the enemies' projectiles):

| File | What it is |
| --- | --- |
| `proj_slinger.png` | What the Slinger throws (a shuriken; spins in flight) |
| `proj_bomb.png` | The Bomber's bomb (drawn with its nose pointing left; the game turns it nose-down as it falls) |

These go in `art-source/projectiles/` instead of this folder.

## How to draw them

- **PNG with a transparent background.** A painted checkerboard isn't transparency: those files get skipped with a warning.
- **Facing right is easiest.** The game flips each enemy to face the way it's walking. Art facing left works too: add its kind to `FACES_LEFT` in `src/objects/EnemyView.js` (the Bomber and Sneaker Shark are already there).
- **Feet at the bottom of the picture.** The game stands the bottom edge of the image on the ground. Extra empty space around the drawing is trimmed off automatically.
- **Bomber:** draw just the flyer, with no shadow. The game adds a shadow on the ground and floats the bomber above it.
- **Any size works.** Around 512 px tall is plenty; the script shrinks it. Keep the four enemies in a similar style so the size differences read clearly: Grunt smallest, Tank biggest.
- Names are working names (see the README's open questions). If they change, the file names can stay the same.
