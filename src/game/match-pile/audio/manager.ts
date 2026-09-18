// what_in: an `AudioLoader` (deps.coordinator.audio from GameControllerDeps/StartScreenDeps/
//          ResultsScreenDeps — the same real Howler-backed facade across every screen).
// what_out: `MatchPileAudioManager` — one named method per real gameplay/VFX/results hook point
//           this SFX+BGM pass wires up (see gameController.ts, screens/startView.ts,
//           screens/resultsView.ts, screens/startViewScene.ts, screens/resultsViewScene.ts,
//           settingsPanel.ts for the call sites). Extends the scaffold's `BaseAudioManager`
//           per docs/recipes/audio-setup.md rather than a parallel playback path.
//           `getAudioManager()` — a SHARED singleton (same pattern as world.ts's getGameWorld()):
//           the cover screen starts the gameplay loop early ("must sound since the cover
//           screen"), and the game screen must NOT restart it on mount — a fresh
//           BaseAudioManager instance per screen has no memory of a track already playing on
//           the shared Howl, so it would stop-and-replay from 0 on every screen transition.
// why_here: audio/sounds.ts owns the name→sprite-key catalog only (feel.test.ts pins its
//           feel.ts-contract keys); this is the first real consumer of that catalog plus the
//           additional keys this pass adds for the events feel.ts's registry doesn't cover
//           (order-complete, win bursts + celebration cheer, results reveal, star pings — none
//           of those are per-tap feedbackRegistry events).
//
// Mixing follows the task's stated priority: highest emphasis on Game Win / Order Complete,
// medium on Order-match / star reveal, quiet+short on the frequent Tile Click / Match Discard /
// UI tap so repetition never fatigues (docs/recipes/audio-setup.md's own "Set appropriate
// volumes" guidance, SFX ~0.5-0.8) — Game Win's own cues (bursts + celebration) run louder than
// that range on purpose, since it's the single loudest moment in the game.
import type { AudioLoader } from '~/core/systems/assets/loaders/audio';
import { BaseAudioManager, type SoundDefinition } from '~/core/systems/audio';
import { SFX, MUSIC } from './sounds';

export const SFX_CHANNEL = 'audio-sfx-match-pile';
export const MUSIC_CHANNEL = 'audio-music-match-pile';

const sfx = (sprite: string, volume: number): SoundDefinition => ({ channel: SFX_CHANNEL, sprite, volume });

// Three hand-off variations so repeated fireworks bursts never sound identical (task spec).
// Bumped to the loudest tier in the game (was 0.8) — the win moment should read as the clear
// peak over every other cue.
const WIN_BURSTS: readonly SoundDefinition[] = [
  sfx(SFX.winBurst1, 1),
  sfx(SFX.winBurst2, 1),
  sfx(SFX.winBurst3, 1),
];

// One clip per earned star — a baked-in ascending pitch progression (no runtime playback-rate
// knob exists on AudioLoader/PlayOptions, so the progression lives in the five source clips
// themselves). Star 5 carries a stronger accent via a higher default volume only.
const STARS: readonly SoundDefinition[] = [
  sfx(SFX.star1, 0.7),
  sfx(SFX.star2, 0.72),
  sfx(SFX.star3, 0.75),
  sfx(SFX.star4, 0.78),
  sfx(SFX.star5, 0.9),
];

const GAME_MUSIC: SoundDefinition = { channel: MUSIC_CHANNEL, sprite: MUSIC.game, volume: 0.3, loop: true };
const RESULTS_MUSIC: SoundDefinition = { channel: MUSIC_CHANNEL, sprite: MUSIC.results, volume: 0.35, loop: true };

export class MatchPileAudioManager extends BaseAudioManager {
  // Tracks which track THIS manager last started — BaseAudioManager's own bookkeeping
  // (currentMusicChannel/currentMusicId) is protected and both tracks share one channel, so it
  // can't tell "game" apart from "results" on its own.
  private currentTrackSprite: string | null = null;

  constructor(audioLoader: AudioLoader) {
    super(audioLoader);
  }

  /** Starts `track` only if it isn't already the one playing — repeated calls across screen
   * mounts (cover → game) must never stop-and-replay a track that's already running.
   * `startMusic()` (inherited) calls `this.stopMusic()` internally, which is OUR override and
   * clears `currentTrackSprite` — so it must be (re)set AFTER that call returns, never before,
   * or every call here would see a permanently-null `currentTrackSprite` and never skip. */
  private playMusicOnce(track: SoundDefinition): void {
    if (this.currentTrackSprite === track.sprite && this.isMusicPlaying()) return;
    this.startMusic(track);
    this.currentTrackSprite = track.sprite;
  }

  override stopMusic(): void {
    this.currentTrackSprite = null;
    super.stopMusic();
  }

  /** Any standard UI button press — PLAY, settings, Next Level/Try Again, Main Menu, FTUE
   * controls. Kept quiet since it fires on nearly every screen. */
  playButtonTap(): void {
    this.playSound(sfx(SFX.buttonTap, 0.5));
  }

  /** Every accepted tile tap, whether or not it completes a triple — pairs with Fx.tapFeedback's
   * bounce+sparkle. Frequent, so deliberately subtle. */
  playTileClick(): void {
    this.playSound(sfx(SFX.tileClick, 0.45));
  }

  /** A completed triple that does NOT progress an active Order — neutral, not a failure cue,
   * quieter/lower-energy than playMatchOrder. Pairs with Fx.matchDiscard. */
  playMatchDiscard(): void {
    this.playSound(sfx(SFX.matchDiscard, 0.5));
  }

  /** A completed triple that DOES progress an active Order — brighter and a step louder than
   * discard/tile-click, reinforcing "this counted." Pairs with Fx.matchComplete's ring. */
  playMatchOrder(): void {
    this.playSound(sfx(SFX.matchOrder, 0.7));
  }

  /** An Order reaching completion — one of the two highest-emphasis cues. Pairs with
   * Fx.orderComplete's sparkle + spin-fade. */
  playOrderComplete(): void {
    this.playSound(sfx(SFX.orderComplete, 0.85));
  }

  /** One celebratory burst from the win-fireworks sequence — call once per wave (Fx.winFireworks
   * fires three staggered waves) with an incrementing `wave` so consecutive bursts pick a
   * different variation instead of repeating the same clip. */
  playWinBurst(wave: number): void {
    this.playSound(WIN_BURSTS[((wave % WIN_BURSTS.length) + WIN_BURSTS.length) % WIN_BURSTS.length]);
  }

  /** One-shot cheer/fanfare layered under the very first fireworks burst — call once per win,
   * not once per wave (unlike playWinBurst). The single loudest cue in the game. */
  playWinCelebration(): void {
    this.playSound(sfx(SFX.winCelebration, 0.95));
  }

  /** Short flourish for the gameplay → Results hand-off, timed to when the Results screen begins
   * appearing (its first paint only, never a resize repaint). */
  playResultsReveal(): void {
    this.playSound(sfx(SFX.resultsReveal, 0.75));
  }

  /** One ping per EARNED star only (caller must skip unearned slots) — `index` is 0-based
   * (0..4); star 5 (index 4) carries the strongest accent. */
  playStar(index: number): void {
    this.playSound(STARS[Math.max(0, Math.min(STARS.length - 1, index))]);
  }

  /** Light, relaxed loop — started as early as the cover screen and left running into gameplay
   * (idempotent: a screen mount that finds it already playing does nothing, so the cover→game
   * transition never stops-and-replays it). Respects audioState.musicEnabled() via
   * BaseAudioManager.startMusic(). */
  startGameplayMusic(): void {
    this.playMusicOnce(GAME_MUSIC);
  }

  /** Slightly more celebratory loop for Results — a real track switch (always stops whatever was
   * playing first via BaseAudioManager.startMusic()'s own stopMusic() call), the closest this
   * API allows to a smooth hand-off without a per-instance fade primitive on AudioLoader. */
  startResultsMusic(): void {
    this.playMusicOnce(RESULTS_MUSIC);
  }
}

let sharedManager: MatchPileAudioManager | null = null;

/** One manager instance for the whole app lifetime (mirrors world.ts's getGameWorld()) — the
 * cover screen, game screen, and results screen all call this instead of constructing their own,
 * so BGM state (which track, whether it's already playing) survives screen transitions instead
 * of resetting on every mount. `audioLoader` is the same coordinator.audio singleton on every
 * call; only the first call's value is used. */
export function getAudioManager(audioLoader: AudioLoader): MatchPileAudioManager {
  if (!sharedManager) sharedManager = new MatchPileAudioManager(audioLoader);
  return sharedManager;
}
