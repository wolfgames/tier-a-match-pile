import { type Accessor } from 'solid-js';
import { useManifest } from '@wolfgames/components/solid';
import type { GameData } from '~/game/config';

/**
 * Typed accessor for game data from the manifest provider.
 * Returns the raw game data cast to the GameData schema type.
 */
export function useGameData(): {
  gameData: Accessor<GameData | null>;
  mode: Accessor<'standalone' | 'injected'>;
  injectData: (data: GameData) => void;
} {
  const { gameData, mode, injectData } = useManifest();

  return {
    gameData: gameData as Accessor<GameData | null>,
    mode,
    injectData: injectData as (data: GameData) => void,
  };
}
