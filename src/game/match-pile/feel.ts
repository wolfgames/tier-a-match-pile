// what_in: nothing â a declarative contract.
// what_out: feedback registry (U2/U8), hint gating (U3/U4), debug probe shapes.
// why_here: tests/unit/tier-a/feel.test.ts and tests/e2e/ui-contract.spec.ts read it;
//           the controller wires feedback FROM this registry, never beside it.
// Contract: tier-a-generation-v4/references/ux-contract.md

export interface Feedback {
  tween: string;
  vfx: string;
  sfx: string;
}

export const REQUIRED_EVENTS = [
  'input', 'submit', 'invalid', 'correct', 'partial', 'miss', 'hint', 'win', 'lose', 'button',
] as const;
export type RequiredEvent = (typeof REQUIRED_EVENTS)[number];
// ponytail: extend per game, e.g. 'undo' | 'flag' | 'merge'.
export type GameEvent = RequiredEvent;
export type FeedbackRegistry = Record<GameEvent, Feedback>;

export const feedbackRegistry: FeedbackRegistry = {
  input: { tween: 'tile-tap-bounce', vfx: 'none', sfx: 'softPing' },
  submit: { tween: 'tray-slot-pop', vfx: 'tray-pop', sfx: 'tileSelect' },
  invalid: { tween: 'tile-shake', vfx: 'none', sfx: 'tileInvalid' },
  correct: { tween: 'tile-clear-pop', vfx: 'sparkle-burst', sfx: 'tileCorrect' },
  partial: { tween: 'tray-cascade', vfx: 'cascade-sparkle', sfx: 'tilePartial' },
  miss: { tween: 'tile-shake', vfx: 'none', sfx: 'tileMiss' },
  hint: { tween: 'hint-glow-pulse', vfx: 'hint-glow', sfx: 'hint' },
  win: { tween: 'win-burst', vfx: 'centre-burst', sfx: 'win' },
  lose: { tween: 'lose-shake', vfx: 'none', sfx: 'lose' },
  button: { tween: 'button-press', vfx: 'none', sfx: 'buttonTap' },
};

/** U3/U4: the hint exists always, shows only in real play, greys once spent. */
export const hintVisibility = (a: { levelIndex: number; phase: string; ftueLevels: number; spent: boolean }) => {
  const visible = a.phase === 'playing' && a.levelIndex > a.ftueLevels;
  return { visible, enabled: visible && !a.spent };
};

/** `window.__GAME_DEBUG__.feel()` */
export interface FeelProbe {
  legendVisible: boolean;
  hintVisible: boolean;
  hintEnabled: boolean;
  levelIndex: number;
  phase: string;
  theme: 'light' | 'dark';
  /** U8: last fired feedback, stamped by the controller when it dispatches from the registry. */
  lastFx: { event: GameEvent; targetLabel: string; t: number } | null;
  lastSubmitT: number | null;
  /** U12: the FTUE step's copy + the real control it names (null once FTUE is past). */
  ftueTarget: string | null;
  ftueCopy: string | null;
}
