// Local DynamicData schema scaffold for `match-pile-content` (see `wolf-dev schema create --key
// match-pile-content`). Not yet registered/deployed against Wolf's backend. `defaultData` is the
// current 24-item tenant vocabulary exactly as shipped today
// (src/game/match-pile/generator/objectTypes.ts#OBJECT_TYPE_POOL) — a reskin/relaunch can swap
// this list via CMS instead of a redeploy, once populated.
import { type } from "arktype";
import { DEFAULT_CONTENT_POOL } from "../../src/game/match-pile/config/dynamicGameConfig";

export const MatchPileContentDef = type("string[]");

export const defaultData: typeof MatchPileContentDef.infer | null = DEFAULT_CONTENT_POOL as string[];
