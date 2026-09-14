export type FlagValidator = (value: unknown) => boolean;

export interface FeatureFlagConfig<T extends object> {
  /** Default values for all flags */
  defaults: T;
  /** Optional per-flag validators (keys that match T's keys) */
  validators?: Partial<Record<keyof T, FlagValidator>>;
  /** localStorage key prefix for caching (e.g. "mygame_ff_"). Resolved from config if omitted. */
  storagePrefix?: string;
  /**
   * Player id for per-user cache keying. Accepts a getter so callers can defer
   * to a value that resolves after module load (e.g. the boot-resolved player
   * id) — the provider evaluates it once at mount, post-resolution.
   */
  userId: string | (() => string);
  /** How long to wait for PostHog before falling back to defaults/cache (ms) */
  timeoutMs?: number;
}

export interface FeatureFlagState<T> {
  flags: T;
  isReady: boolean;
}
