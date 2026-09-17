import type { DynamicDataRegistry } from "@wolfgames/client";
import { matchPileDifficultySchema } from "./match-pile-difficulty";
import { matchPileScoringSchema } from "./match-pile-scoring";
import { matchPileContentSchema } from "./match-pile-content";

/**
 * Not yet registered/deployed against Wolf's backend (see each schema's `schema.ts` header) — the
 * DynamicData client falls back to `defaultData` (today's exact hardcoded values) for every key
 * here until `wolf-dev schema register`/`deploy` and `wolf-dev schema data create` are run.
 */
export const registry = {
  "match-pile-difficulty": { schema: matchPileDifficultySchema, bundleSyncEnabled: false },
  "match-pile-scoring": { schema: matchPileScoringSchema, bundleSyncEnabled: false },
  "match-pile-content": { schema: matchPileContentSchema, bundleSyncEnabled: false },
} satisfies DynamicDataRegistry;
