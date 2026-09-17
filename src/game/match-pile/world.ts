// what_in: nothing — a lazily-created singleton.
// what_out: `getGameWorld()` — the app-scoped ECS world; outlives any one screen so the
//           results screen can read the final score straight from ECS.
// why_here: ecs-gameplay.md "World is app-scoped" — screens read it, never create/destroy it.
import { setActiveDb } from '~/core/systems/ecs';
import { createGameWorld, type GameDatabase } from './ecs/plugin';

let world: GameDatabase | null = null;

export function getGameWorld(): GameDatabase {
  if (!world) {
    world = createGameWorld();
    setActiveDb(world);
  }
  return world;
}

export function disposeGameWorld(): void {
  setActiveDb(null);
  world = null;
}
