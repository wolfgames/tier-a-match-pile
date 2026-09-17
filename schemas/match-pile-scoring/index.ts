import type { DynamicDataSchema } from "@wolfgames/client";
import { MatchPileScoringDef, defaultData } from "./schema";

export const matchPileScoringSchema = {
  key: "match-pile-scoring",
  schema: MatchPileScoringDef,
  version: 0,
  defaultData,
  migrations: {},
} satisfies DynamicDataSchema<typeof MatchPileScoringDef>;
