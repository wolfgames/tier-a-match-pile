/**
 * Local fallback player id: minted and persisted when there is no backend
 * session (offline, backend down, or a storage-partitioned third-party frame).
 */

/**
 * Local-fallback key. Matches the `ANONYMOUS_ID_KEY` game-components uses in
 * `analytics-state.core.ts` so both resolve to the same player; keep them in
 * lockstep. Planned to change — the two implementations will consolidate.
 */
export const PLAYER_ID_KEY = 'player_id';

/** Prefers `crypto.randomUUID`, falling back for non-secure contexts (plain HTTP). */
export function generatePlayerId(): string {
  const cryptoObj =
    typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return fallbackUuid();
}

function fallbackUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const r = (Math.random() * 16) | 0;
    const v = char === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** The persisted local id, minting one on first use. Ephemeral if storage is blocked. */
export function getOrCreateLocalPlayerId(): string {
  const existing = readStoredPlayerId();
  if (existing) return existing;
  const id = generatePlayerId();
  persistPlayerId(id);
  return id;
}

/**
 * Persist an already-resolved player id (e.g. the backend uuid returned by a
 * successful `identify()`) onto the same `player_id` key the local fallback
 * reads. This makes the resolved id **sticky**: once the backend has been
 * reached, a later `identify()` timeout falls back to that same uuid instead of
 * minting a fresh local one, so a flaky network can't split one player into two
 * ids across sessions. No-op if storage is blocked.
 */
export function rememberResolvedPlayerId(id: string): void {
  persistPlayerId(id);
}

function readStoredPlayerId(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(PLAYER_ID_KEY);
  } catch {
    return null;
  }
}

function persistPlayerId(id: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PLAYER_ID_KEY, id);
  } catch {
    // Storage blocked (quota / partitioned frame) — id stays ephemeral.
  }
}
