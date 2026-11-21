# Notes for agents working on Italian Brainrot Tower Defense

The README is the full reference (every system, file and number). This file holds the rules for things agents add
over and over, starting with the release notes.

## Patch notes (the in-game "What's New") and CHANGELOG.md

Every release that players will notice updates **both**:

1. `src/patchNotes.js`: the What's New window players see on the title screen (written for players).
2. `CHANGELOG.md`: the developer changelog (written for the team, may name files and config keys).

### Version

- Bump `version` in `package.json` (and the two matching lines in `package-lock.json`) and set the same value as
  `PATCH_NOTES.version` (a test checks they match). Use semver: a new feature or a reworked system is a minor bump
  (0.7.0), fixes and small tweaks are a patch bump (0.7.1).
- Never edit the notes of a version that is already live (pushed to `main`): add a new version instead, or players
  who already saw the window won't see the change (it only reopens when `version` changes).
- `PATCH_NOTES.title` is `What's New in v0.7` for a minor release, `What's New in v0.7.1` for a patch.

### Sections (fixed order, skip empty ones)

| `type` | Heading | What goes there |
| --- | --- | --- |
| `feature` | New Features | Something players couldn't do or meet before: a new building, enemy, screen, mode or system. |
| `change` | Changes | An existing thing that works differently now: a rework, a new look, new effects, a moved unlock. |
| `balance` | Balance | Numbers only: costs, health, damage, limits, wave strength, rewards. |
| `fix` | Bug Fixes | Something that was broken and now works as intended. |

Write the fix as what players saw ("Enemies crossing a destroyed building were drawn under its rubble"), then what it
does now. If an entry could fit two sections, use the first one in the table.

### Order inside a section

1. **Biggest change first**: how much it changes the game for a player (a new online feature or a new enemy before a
   new picture; a rework before a tweak).
2. **Then newest first** among changes of about the same size (0.7.0 before 0.6.3).

A release lists its own changes **and** the entries of the recent patches before it (since the last minor release),
merged into the same sections and sorted by the rules above, so players who skipped a patch still see it. Drop the
older minor release's entries when a new minor release ships.

### Each entry

```js
{ version: '0.7.0', icon: { enemy: 'bicus' }, title: 'New enemy: Bri Bri Bicus Dicus (from Village Hall 5)',
  text: 'An armored legionary. Its armor bar has to be broken before it takes any health damage...' }
```

- `version`: the release the change shipped in (shown as a small tag after the title).
- `icon`: `{ building: type, level }` (that level's picture), `{ enemy: kind }`, `{ spell: kind }`, `{ hero: true }`
  (the Brisket King) or `{ texture: key }`. Pick the thing the entry is about. A building icon above Level 1 is loaded
  up front automatically (src/assetPlan.js).
- `title`: short, says what changed; name the unlock hall for new things ("(from Village Hall 6)"). No "Fixed:" or
  "New:" prefix needed: the section says it.
- `text`: one to three short sentences in plain words for players: what it is or does, and what to do about it. No
  file names, config keys or code terms. It must fit the row (the window shrinks long text, but keep it under ~300
  characters).

### CHANGELOG.md

Add a `## <version>` section at the top with a one-line summary (and any **Database:** migration to run), then the
same four groups as headings in the same order: `### New Features`, `### Changes`, `### Balance`, `### Bug Fixes`,
each sorted biggest first, then newest first. Unlike the What's New, the changelog is for developers: name the
files, config keys and numbers, and say what an older save or village does.

### Check

`npm test` (tests/v07.test.js checks the What's New format: section order, versions, every entry complete), then open
the title screen and page through What's New to check that nothing overflows.
