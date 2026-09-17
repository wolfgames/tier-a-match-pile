import type { DynamicDataSchema } from "@wolfgames/client";
import { MatchPileContentDef, defaultData } from "./schema";

export const matchPileContentSchema = {
  key: "match-pile-content",
  schema: MatchPileContentDef,
  version: 0,
  defaultData,
  migrations: {},
} satisfies DynamicDataSchema<typeof MatchPileContentDef>;
