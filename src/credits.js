// Shown on the Credits tab of the home screen's Settings window (SettingsWindow.buildCredits). Edit freely: each
// section gets a small heading; `people` rows are drawn as two columns (name | what they did; a role can be a list of
// lines, one under the other), `lines` centered. The window shrinks the spacing and text if it all doesn't fit.
export const CREDITS_TEAM = [
  { name: 'Brady Messick', role: ['Programming & game concept', 'UI/UX, sound design & playtesting'] },
  { name: 'Robert', role: 'Code' },
  { name: 'Cole Martin', role: 'Game art, sound effects, UI/UX' },
  { name: 'Nathan DiCarlo', role: 'Testing' }
];

export const CREDITS_NOTES = [
  'Font: Lilita One by Juan Montoreano (SIL Open Font License)',
  'Made with Phaser'
];

export const CREDITS_SECTIONS = [
  { title: 'Team', people: CREDITS_TEAM },
  {
    title: 'Audio',
    people: [
      { name: 'Supercell', role: 'Sound effects' },
      { name: 'Pixabay', role: 'Sound effects (pixabay.com)' }
    ],
    lines: ["Menu Music: 'Bomboclat Wallahi' by TR3N TEN (Produced by Tren Tenovic)."]
  },
  {
    title: 'Assets',
    people: [
      { name: 'Supercell', role: 'Inspiration' },
      { name: 'ChatGPT', role: 'AI-generated images' }
    ]
  },
  { title: 'Font & Engine', lines: CREDITS_NOTES }
];

// Supercell's Fan Content Policy asks for this notice; drawn small at the bottom of the tab.
export const CREDITS_DISCLAIMER = 'This content is unofficial and is not endorsed by Supercell. For more information see '
  + 'Supercell\'s Fan Content Policy: www.supercell.com/fan-content-policy.';
