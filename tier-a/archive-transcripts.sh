#!/usr/bin/env bash
# tier-a/archive-transcripts.sh <phase> â copy this session's JSONL transcripts (incl. subagents)
# into tier-a/run-<date>/transcripts/ at every phase exit (Q5.11). Gate row Q3 counts them.
set -u
PHASE="${1:?phase}"
SLUG=$(jq -r ".projects[\"$(pwd)\"]" "$HOME/.gemini/projects.json")
if [ "$SLUG" = "null" ]; then SLUG=$(basename "$(pwd)"); fi
PROJ="$HOME/.gemini/tmp/$SLUG/chats"
OUT="tier-a/run-$(date +%F)/transcripts"; mkdir -p "$OUT"
n=0
if [ -d "$PROJ" ]; then
  while IFS= read -r f; do cp "$f" "$OUT/$PHASE-$(basename "$f")"; n=$((n+1)); done < <(find "$PROJ" -name '*.jsonl' -mmin -720 2>/dev/null)
fi
echo "ARCHIVED phase=$PHASE files=$n â $OUT"
