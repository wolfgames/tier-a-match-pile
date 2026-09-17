// what_in: nothing — a declarative name→sprite-key map.
// what_out: `SFX` — every sound the game plays, keyed by the name feel.ts's registry rows use.
// why_here: feel.test asserts every feedbackRegistry row names a real SFX key; audio-setup.md
//           §sprite naming. Sprite ids are final; the audio-sprite JSON itself ships in Phase 2.
export const SFX = {
  softPing: 'sfx-soft-ping',
  tileSelect: 'sfx-tile-select',
  tileInvalid: 'sfx-tile-invalid',
  tileCorrect: 'sfx-tile-correct',
  tilePartial: 'sfx-tile-partial',
  tileMiss: 'sfx-tile-miss',
  hint: 'sfx-hint',
  win: 'sfx-win',
  lose: 'sfx-lose',
  buttonTap: 'sfx-button-tap',
  star: 'sfx-star',
} as const;

export type SfxKey = keyof typeof SFX;

export const MUSIC = {
  start: 'music-start',
  game: 'music-game',
  results: 'music-results',
} as const;
