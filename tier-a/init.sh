#!/usr/bin/env bash
# tier-a/init.sh â deterministic Phase 1 bootstrap (F6). No LLM judgement lives here.
# Usage: bash <skill>/assets/init.sh <slug> <repo-dir> [tenant=wolf]   (run from anywhere)
# The repo is ALWAYS provided by the user (a template-amino clone, already `nucleo game init`-ed).
# This script never clones, pulls or fetches. Does: identity â copy contract files (match-pile replaced)
#       â merge scripts â devDeps incl. typescript â BUILD_MANIFEST/TENANT/BASELINE â preflight.  Idempotent.
set -euo pipefail
SLUG="${1:?slug}"; REPO="${2:?repo dir}"; TENANT="${3:-wolf}"
HERE="$(cd "$(dirname "$0")" && pwd)"; SKILL="$(dirname "$HERE")"
SHEET="$SKILL/references/brand-sheets/$TENANT.tokens.json"
[ -f "$SHEET" ] || { echo "BLOCKED: no brand sheet for tenant '$TENANT' â copy wolf.tokens.json to references/brand-sheets/$TENANT.tokens.json and fill the four colours"; exit 2; }
# A half-filled sheet is the classic new-partner bug: colours changed, marks still Wolf's.
jq -e --arg t "$TENANT" '(.primary and .secondary and .accent and .onPrimary and .logo and .watermark)
  and ($t == "wolf" or ((.logo + .watermark) | test("mark-wolf") | not))' "$SHEET" >/dev/null 2>&1 \
  || { echo "BLOCKED: $SHEET incomplete â needs primary/secondary/accent/onPrimary/logo/watermark, and a non-wolf tenant must not leave logo/watermark pointing at mark-wolf"; exit 2; }

[ -d "$REPO/.git" ] || { echo "BLOCKED: $REPO is not a git repo â provide the template-amino clone (nucleo game init done); this pipeline never clones"; exit 2; }
[ -d "$REPO/src/core" ] && [ -d "$REPO/src/game" ] || { echo "BLOCKED: $REPO does not look like template-amino (src/core, src/game missing)"; exit 2; }
cd "$REPO"; mkdir -p tier-a/evidence/red tier-a/scripts tests/unit/tier-a tests/unit/game tests/e2e "src/game/$SLUG"
git rev-parse HEAD > /dev/null
BASE=$(git rev-parse HEAD)

# --- identity (slug everywhere the template names mygame) ------------------------------------
# wolf-game-kit.json is the user's: it must already carry the slug; never rewrite it.
[ -f wolf-game-kit.json ] || { echo "BLOCKED: wolf-game-kit.json missing â run nucleo game init first"; exit 2; }
[ "$(jq -r .gameSlug wolf-game-kit.json)" = "$SLUG" ] || { echo "BLOCKED: wolf-game-kit.json gameSlug=$(jq -r .gameSlug wolf-game-kit.json) != $SLUG â fix one or the other"; exit 2; }
jq --arg s "game-amino-$SLUG" '.name=$s' package.json > .pkg.tmp && mv .pkg.tmp package.json
[ -f game.json ] && jq --arg s "$SLUG" '.slug=$s | .id=$s' game.json > .g.tmp && mv .g.tmp game.json || true

# --- contract files ---------------------------------------------------------------------------
cp "$HERE"/feel.ts "$HERE"/inspector.ts "$HERE"/brand.tokens.json "src/game/$SLUG/"
cp "$HERE"/feel.test.ts "$HERE"/architecture.test.ts "$HERE"/ftue.test.ts tests/unit/tier-a/
cp "$HERE"/solvability.test.ts tests/unit/game/
cp "$HERE"/ui-contract.spec.ts "$HERE"/lazy-assets.spec.ts "$HERE"/playwright.config.ts tests/e2e/
cp "$HERE"/gate.sh "$HERE"/classify-failure.ts "$HERE"/converge.ts "$HERE"/archive-transcripts.sh "$HERE"/stryker.conf.json tier-a/
cp "$0" tier-a/init.sh
grep -q "tier-a/run-\*/transcripts/" .gitignore 2>/dev/null || printf "\n# tier-a phase transcripts stay local (gate Q3 reads them from disk)\ntier-a/run-*/transcripts/\n" >> .gitignore
grep -rl match-pile "src/game/$SLUG" tests tier-a | xargs -r sed -i "s/match-pile/$SLUG/g"

# --- tenant â tokens ---------------------------------------------------------------------------
jq --slurpfile t "$SHEET" '
  .tenant=$t[0].tenant | .displayName=$t[0].displayName | .link=$t[0].link
  | .type = (.type + ($t[0].type // {}) + {body: ($t[0].type.body // $t[0].type.display)})
  | .light += {primary:$t[0].primary, secondary:$t[0].secondary, accent:$t[0].accent, onPrimary:$t[0].onPrimary}
  | .dark  += {primary:$t[0].primary, secondary:$t[0].secondary, accent:$t[0].accent, onPrimary:$t[0].onPrimary}' \
  "src/game/$SLUG/brand.tokens.json" > .tok.tmp && mv .tok.tmp "src/game/$SLUG/brand.tokens.json"
cp "$SHEET" tier-a/TENANT.json
# The sheet's logo + watermark are asset ids, not tokens: they belong to the asset set, where gate
# C2b already demands a cdnPath + verified for every required id. Seeded here so no agent re-derives them.
[ -f tier-a/ASSET_SET.json ] || echo '{}' > tier-a/ASSET_SET.json
jq --slurpfile t "$SHEET" --arg p "data-levels-$SLUG" '
  .required = (((.required // []) + ([$t[0].logo, $t[0].watermark] | map(select(type == "string") | ltrimstr("asset://")))) | unique)
  | .pack = (.pack // $p)' tier-a/ASSET_SET.json > .as.tmp && mv .as.tmp tier-a/ASSET_SET.json

# --- scripts + deps ---------------------------------------------------------------------------
jq -s '.[0] * {scripts: (.[0].scripts + (.[1] | del(._comment)))}' package.json "$HERE/package-scripts.json" > .pkg.tmp && mv .pkg.tmp package.json
FONTS=$(jq -r '[.type.display,.type.body,.type.numeric]|unique[]|ascii_downcase|gsub(" ";"-")|"@fontsource/"+.' "src/game/$SLUG/brand.tokens.json" | tr '\n' ' ')
bun add -d typescript@5 fast-check @stryker-mutator/core @stryker-mutator/vitest-runner @playwright/test $FONTS >/dev/null
bun install >/dev/null
bunx playwright install chrome >/dev/null 2>&1 || true

# --- manifest + baseline -----------------------------------------------------------------------
COMP=$(jq -r .version node_modules/@wolfgames/components/package.json 2>/dev/null || echo unknown)
jq -n --arg r "$(git remote get-url origin 2>/dev/null || echo none)" --arg sha "$BASE" --arg c "$COMP" --arg t "$TENANT" \
  '{remote:$r, sha:$sha, baseCommit:$sha, clonedAt:(now|todate), componentsTag:$c, tenant:$t}' > tier-a/BUILD_MANIFEST.json
{ bun run typecheck 2>&1 || true; bun run test:run 2>&1 || true; } | grep -oE '(src|tests)/[^ :]+\.tsx?' | sort -u | jq -R . | jq -s '{failingFiles: .}' > tier-a/BASELINE.json

bash tier-a/gate.sh --preflight
echo "INIT_OK slug=$SLUG tenant=$TENANT base=$BASE components=$COMP"
