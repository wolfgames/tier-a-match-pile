// what_in: nothing — a declarative name→sprite-key map.
// what_out: `SFX` — every sound the game plays, keyed by the name feel.ts's registry rows use
//           (the first block below) plus the real gameplay/VFX/results hook points this audio
//           pass wires up (the second block) — see audio/manager.ts for playback and the screen
//           controllers (gameController.ts, screens/startView.ts, screens/resultsView.ts) for
//           call sites.
// why_here: feel.test asserts every feedbackRegistry row names a real SFX key; audio-setup.md
//           §sprite naming. The feel.ts block's keys are load-bearing for that test — never
//           rename or remove them.
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
  buttonTap: 'sfx-ui-button-tap',
  star: 'sfx-star',

  // Real gameplay/VFX/results hook points (SFX + BGM pass).
  tileClick: 'sfx-tile-click',
  matchDiscard: 'sfx-match-discard',
  matchOrder: 'sfx-match-order',
  orderComplete: 'sfx-order-complete',
  winBurst1: 'sfx-win-burst-1',
  winBurst2: 'sfx-win-burst-2',
  winBurst3: 'sfx-win-burst-3',
  winCelebration: 'sfx-win-celebration',
  resultsReveal: 'sfx-results-reveal',
  star1: 'sfx-star-1',
  star2: 'sfx-star-2',
  star3: 'sfx-star-3',
  star4: 'sfx-star-4',
  star5: 'sfx-star-5',
} as const;

export type SfxKey = keyof typeof SFX;

export const MUSIC = {
  start: 'music-start',
  game: 'music-game',
  results: 'music-results',
} as const;
