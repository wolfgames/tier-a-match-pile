#!/usr/bin/env bash
# tier-a/gate.sh â the only RELEASE_CANDIDATE verdict. Exit 0 or the status may not be claimed.
# Usage (repo root): bash tier-a/gate.sh <slug>          â also writes tier-a/GATE.json for classify.
#                    bash tier-a/gate.sh --preflight     â tooling check only (T0).
# v4: a row is unfakeable â exit 127 (command not found) and missing tooling are FAIL, never PASS.
set -u
SLUG="${1:?usage: gate.sh <slug>|--preflight}"
fail=0; rows=()
chk() { # id owner description command
  ( eval "$4" ) >"tier-a/.gate-$1.log" 2>&1; local rc=$?  # subshell: an "exit 1" inside a row never kills the gate
  if [ $rc -eq 127 ] || grep -qE "command not found|Cannot find module|not recognized as|error: Script not found|error: script \"[^\"]*\" not found" "tier-a/.gate-$1.log"; then
    printf 'FAIL  %-6s %s  (TOOLING MISSING rc=%s, tier-a/.gate-%s.log)\n' "$1" "$3" "$rc" "$1"
    rows+=("{\"id\":\"$1\",\"owner\":\"$2\",\"status\":\"FAIL\",\"tooling\":true,\"log\":\"tier-a/.gate-$1.log\"}"); fail=1; return
  fi
  if [ $rc -eq 0 ]; then printf 'PASS  %-6s %s\n' "$1" "$3"; rows+=("{\"id\":\"$1\",\"owner\":\"$2\",\"status\":\"PASS\"}")
  else printf 'FAIL  %-6s %s  (tier-a/.gate-%s.log)\n' "$1" "$3" "$1"; rows+=("{\"id\":\"$1\",\"owner\":\"$2\",\"status\":\"FAIL\",\"log\":\"tier-a/.gate-$1.log\"}"); fail=1; fi
}

# --- tooling (T0): every binary a row below relies on must exist, or nothing else counts ----------
chk T0 ship  "tooling present: bun jq git node_modules/{typescript,vitest,@playwright/test,@stryker-mutator/core,fast-check}, Chrome" \
  'command -v bun && command -v jq && command -v git && for m in typescript vitest @playwright/test @stryker-mutator/core fast-check; do [ -d "node_modules/$m" ] || { echo "missing node_modules/$m"; exit 1; }; done && (ls /Applications/Google\ Chrome.app >/dev/null 2>&1 || command -v google-chrome || [ -f "/c/Program Files/Google/Chrome/Application/chrome.exe" ] || [ -f "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" ]) && bunx tsc --version'
[ "$SLUG" = "--preflight" ] && { [ $fail -eq 0 ] && echo "PREFLIGHT: OK" || { echo "PREFLIGHT: FAIL"; exit 1; }; exit $fail; }

# --- integrity -------------------------------------------------------------------------------
chk G1 ship  "baseline: zero failures outside tier-a/BASELINE.json"        'bun run tier-a:baseline-check'
chk G2 ship  "tests not weakened (.skip/.only/todo/retries/tolerance)"       '[ -f tier-a/BUILD_MANIFEST.json ] && ! git diff "$(jq -r .baseCommit tier-a/BUILD_MANIFEST.json)" -- tests | grep -E "^\+.*(\.skip\(|\.only\(|it\.todo|test\.todo|retries:|toleran)" | grep -q .'
chk G3 ship  "every REFERENCE_MATRIX entry has a test id that exists"        'bun run tier-a:matrix-check'
chk G4 ship  "red-phase evidence for every requirement id"                   '[ -f tier-a/REQUIREMENTS.json ] && for id in $(jq -r ".requirements[].id" tier-a/REQUIREMENTS.json); do [ -f "tier-a/evidence/red/$id.txt" ] || exit 1; done'
# --- rules / content -------------------------------------------------------------------------
chk R1 research "rules parity + property tests"                              'bunx vitest run tests/unit/game/rules.test.ts'
chk R2 research "mutation â¥ 90% on rules/ scoring/ transactions/ (100% terminal) â cached on source hash" 'h=$(cat $(git ls-files -co --exclude-standard "src/game/$SLUG/rules" "src/game/$SLUG/scoring.ts" "src/game/$SLUG/ecs/transactions" tests/unit/game tier-a/stryker.conf.json | sort) | shasum | cut -c1-12); if [ -f tier-a/reports/mutation.json ] && [ "$(cat tier-a/.mutation-hash 2>/dev/null)" = "$h" ]; then echo "R2 cache hit $h (tier-a/reports/mutation.json)"; else bun run rules:mutation && echo "$h" > tier-a/.mutation-hash; fi'
chk D1 research "solvability + generator round-trip + ladder shape"          'bunx vitest run tests/unit/game/solvability.test.ts'
chk D2 research "content pack reproducible from seeds"                       'bun run content:build && git diff --quiet -- src/game/$SLUG/data'
chk D3 research "CONTENT_REPORT.md present with funnel"                      'grep -q "generated\|validated\|shipped" tier-a/CONTENT_REPORT.md'
# --- architecture ----------------------------------------------------------------------------
chk A1 build "architecture oracle (purity, tx-only writes, controller, 150 lines, palette)" 'bunx vitest run tests/unit/tier-a/architecture.test.ts'
chk A2 build "game-hygiene audit: zero law/bridge/factory hits"               'bun run tier-a:hygiene'
chk A3 build "ecs-enforce clean"                                               'bun run tier-a:ecs-enforce'
chk A4 build "no mygame identity left"                                        '! grep -rq mygame src/game package.json wolf-game-kit.json knip.config.ts'
chk A5 build "typecheck + unit + lint:unused"                                 'bunx tsc --version >/dev/null && bun run typecheck && bun run test:run && bun run lint:unused'
# --- brand -----------------------------------------------------------------------------------
chk B1 build "brand.tokens.json: tenant colours non-null in both themes, no chartreuse"  'jq -e "[.light,.dark] | all(.primary and .secondary and .accent and .onPrimary and (.accent|ascii_downcase)!=\"#dfff00\")" src/game/$SLUG/brand.tokens.json'
chk B2 build "tenant sheet recorded (tier-a/TENANT.json â brand.tokens.json)"          'jq -e --slurpfile t src/game/$SLUG/brand.tokens.json ".tenant==\$t[0].tenant and .primary==\$t[0].light.primary" tier-a/TENANT.json'
# --- ux --------------------------------------------------------------------------------------
# One Vite build for every Playwright row below (playwright.config.ts skips its own build when set).
if [ "$SLUG" != "--preflight" ]; then ( bunx vite build >"tier-a/.gate-build.log" 2>&1 ) && export TIER_A_PREBUILT=1 || echo "WARN  vite build failed â Playwright rows will build on their own (tier-a/.gate-build.log)"; fi
chk U1 build "feel unit contract (U2 U3 U4 U8 N1 N3 N4 B1 scoring)"          'bunx vitest run tests/unit/tier-a/feel.test.ts'
chk U1b build "FTUE grammar + unloseable level 1 (U10 U11)"                    'bunx vitest run tests/unit/tier-a/ftue.test.ts'
chk U2 build "ui-contract e2e (U1 U3âU9 U9b U12 N2 N5 N8 N9, default-autoplay case) on Chrome"                 'bunx playwright test --config tests/e2e/playwright.config.ts tests/e2e/ui-contract.spec.ts'
chk U3 build "smoke e2e"                                                      'bunx playwright test --config tests/e2e/playwright.config.ts tests/e2e/smoke.spec.ts'
# --- assets ----------------------------------------------------------------------------------
chk C1 assets "lazy-assets e2e: CDN only, compressed, lazy, no 404"           'bunx playwright test --config tests/e2e/playwright.config.ts tests/e2e/lazy-assets.spec.ts'
chk C2 assets "ASSET_REPORT.json: real provenance (generate_* tool + taskId), projectId==slug, webp/webm/mp3" 'jq -e --arg s "$SLUG" "all(.assets[]; .projectId==\$s and (.generatedBy|test(\"^generate_(image|styled_image|vfx|sfx|music|tts|3d|video)$\")) and (.taskId|type)==\"string\" and (.taskId|length)>8 and (.format|test(\"^(webp|svg|webm|mp3|json)$\")))" tier-a/ASSET_REPORT.json'
chk C2b assets "every decorative asset enumerated in tier-a/ASSET_SET.json is in ASSET_REPORT.json with cdnPath" 'jq -e --slurpfile r tier-a/ASSET_REPORT.json "all(.required[]; . as \$id | \$r[0].assets | any(.logicalId==\$id and .cdnPath!=null and .verified==true))" tier-a/ASSET_SET.json'
chk C6 assets "dynamic level pack published: registry has the pack key and it is reachable"  'key=$(jq -r ".pack" tier-a/ASSET_SET.json) && grep -q "$key" assets/registry.ts && hashed=$(jq -r --arg k "$key.json" ".files[\$k] // empty" assets/asset-manifest.cdn.json) && [ -n "$hashed" ] && env=$(jq -r ".environment|ascii_downcase" wolf-game-kit.json) && curl -sfI "https://media.$env.wolf.games/games/$SLUG/data/json-data/$hashed" >/dev/null'
chk C3 assets "no raster/wav in assets/src or public (boot chrome excepted)"  '! find assets/src public/assets -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.wav" \) 2>/dev/null | grep -v "/boot-" | grep -q .'
chk C4 assets "check:assets + check:manifest + assets_verify log"             'bun run check:assets && bun run check:manifest && grep -q "verified" tier-a/.assets-verify.log'
chk C5 assets "registry + lockfile committed together"                       'git ls-files --error-unmatch assets/registry.ts assets/asset-manifest.cdn.json'
# --- qa --------------------------------------------------------------------------------------
chk Q1 ship  "artifacts/QA_REPORT.md verdict PASS"                            'grep -qw PASS artifacts/QA_REPORT.md && ! grep -qE "QA_FAIL|BLOCKED" artifacts/QA_REPORT.md'
chk Q3 ship  "phase transcripts archived (tier-a/run-*/transcripts/*.jsonl â¥ 4)"             '[ "$(ls tier-a/run-*/transcripts/*.jsonl 2>/dev/null | wc -l)" -ge 4 ]'
chk Q2 ship  "evidence screenshots + recording exist (debug aids)"            '[ "$(ls tier-a/evidence/*.png 2>/dev/null | wc -l)" -ge 10 ] && ls tier-a/evidence/*.webm >/dev/null'

printf '{"slug":"%s","rows":[%s]}\n' "$SLUG" "$(IFS=,; echo "${rows[*]}")" > tier-a/GATE.json
if [ "$fail" -eq 0 ]; then echo "GATE: RELEASE_CANDIDATE"; else echo "GATE: BLOCKED â FAIL rows are the remaining work (owners in tier-a/GATE.json)"; exit 1; fi
