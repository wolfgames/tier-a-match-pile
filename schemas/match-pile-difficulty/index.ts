import type { DynamicDataSchema } from "@wolfgames/client";
import { MatchPileDifficultyDef, defaultData } from "./schema";

export const matchPileDifficultySchema = {
  key: "match-pile-difficulty",
  schema: MatchPileDifficultyDef,
  version: 0,
  defaultData,
  migrations: {},
} satisfies DynamicDataSchema<typeof MatchPileDifficultyDef>;
