/**
 * ECS Database Bridge
 *
 * Exposes the active game's ECS database to the Inspector panel.
 * Games call setActiveDb(db) on create and setActiveDb(null) on destroy.
 * app.tsx reads activeDb() to pass to the Inspector component.
 */
import { createSignal, createRoot } from 'solid-js';
import type { Database } from '@adobe/data/ecs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDatabase = Database<any, any, any, any, any, any, any, any>;

const [activeDb, setActiveDb] = createRoot(() => {
  return createSignal<AnyDatabase | null>(null);
});

/**
 * A dev action the active game registers to surface as a button in the
 * Inspector panel (e.g. an auto-player / bot). Generic so any game can opt in —
 * the Inspector stays game-agnostic.
 */
export type InspectorAction = {
  /** Stable id (used as the list key). */
  id: string;
  /** Reactive button label, e.g. `() => running() ? 'Stop' : 'Play'`. */
  label: () => string;
  /** Click handler. */
  run: () => void;
};

// Games set this alongside setActiveDb(db) and clear it ([]) on destroy.
const [activeInspectorActions, setActiveInspectorActions] = createRoot(() => {
  return createSignal<InspectorAction[]>([]);
});

export {
  activeDb,
  setActiveDb,
  activeInspectorActions,
  setActiveInspectorActions,
};
