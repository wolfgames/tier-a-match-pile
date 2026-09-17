// what_in: 'light' | 'dark'.
// what_out: the active theme resource — DOM + Pixi drawers both read it back.
// why_here: A2/A3 write-site rule; N8 (dark theme parity) drives from this resource.
import type { GameStore } from '../store';

export function setTheme(store: GameStore, { theme }: { theme: 'light' | 'dark' }): void {
  store.resources.theme = theme;
}
