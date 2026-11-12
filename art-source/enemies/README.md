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
