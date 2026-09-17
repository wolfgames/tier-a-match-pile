// Split out from `index.ts` so pure logic (services/levels.ts, unit tests) can import the
// committed level pack without pulling in `config.ts` → the Solid screen components (which
// break when evaluated outside a browser/DOM render context, e.g. under vitest node).
import levelsPack from './match-pile/data/levels-match-pile.json';
import type { GameData } from './config';

export const defaultGameData: GameData = levelsPack as GameData;
