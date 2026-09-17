# Match Pile — Scoring System

Match Pile's implementation of the Wolf Template Scoring System. This is the
detailed, math-and-tunables reference; `docs/GAME-DESIGN.md`'s **Scoring
Specification Boundary** section points here rather than duplicating it — if
the two ever disagree, resolve the conflict explicitly rather than silently
picking one.

`[SCORE_NAME] = Score`. `[CONTENT_UNIT] = Level`.

The goal of the system is a **granular, leaderboard-safe score**: continuous
enough that two skilled players rarely land on the same number, and normalized
so players across Levels of different difficulty can be ranked fairly. Every
choice below serves those two ends.

> Numeric defaults below are **approved Match Pile V1 tuning**, from three
dedicated tuning passes (rank tiers' multiples are the only piece still the
template's untouched starting shape). Each section below says explicitly what
changed and why.

---

## Score responsibility hierarchy

Two dedicated tuning passes separated responsibilities that were previously
tangled together. A **stable Core Match value** (3rd pass) is now the
foundation of the Score; **global completion performance** and Core together
are what mainly define a run's Score; **local millisecond timing** (how long
between this specific triple and the last one) is fine granularity only:

- **Foundation** — the **Core Match value** (§1): every completed triple
  (Order-relevant or distractor, either way) is worth a flat, stable
  `coreMatchPoints`, independent of timing. This is the majority of a
  typical Score by design — "how many successful matches did I make" should
  dominate, not incidental per-match timing noise.
- **Primary modifier** — **global completion performance** (the Pace term,
  §5, driven by total active-gameplay time `T`). Conceptually
  `mainPerformanceScore = coreMatchScore × globalPaceMultiplier` — a
  genuinely fast full run should score meaningfully higher than a slow one.
- **Secondary** — Speed Streak and Accuracy. Both still reward clean, fast
  play, but neither can by itself swing the Score dramatically.
- **Fine granularity** — exact per-triple millisecond timing (§2). This is
  what keeps two similar runs from tying on the leaderboard; by the 3rd
  pass's tuning it normally accounts for only around 5–10% of a run's Score,
  and it does not drive Mastery at all (see below).

**Score** stays granular and millisecond-precise — two runs that differ by a
few hundred milliseconds should generally still get slightly different
Scores, for leaderboard separation, but that difference should itself be
small (e.g. `1038` vs `1044`, not `162` vs `245`). **Mastery Stars** are a
different, coarser signal: they answer "how quickly did the player complete
this Level overall," computed directly from global completion time `T`, and
**never read Final Score at all**. This means Score and Stars can
legitimately diverge in precision — two runs scoring 1847 and 1854 can both
land on 3★, and that's the intended behavior, not a bug: small millisecond
differences should separate leaderboard Score without constantly flipping
the player between Star ratings.

---

## Design goals (the "why")

- **Granularity → non-duplicative leaderboards.** Every scoring input here is
  continuous, and the primary granularity engine — time-efficiency — is
  measured at **millisecond resolution** so completion speed spreads players
  across a wide, fine-grained range.
- **Reward speed, precision, and mastery** — not just completion. Whether a
  player cleared all of a Level's Orders is the floor; the score reflects *how
  well*.
- **No direct point penalties for mistakes.** Errors cost the player only
  indirectly (slower cycle times, broken streaks, a lower accuracy
  multiplier), never by subtracting points.
- **Explainable.** The results screen must make the final Score legible, even
  though the model is fine-grained underneath.
- **Deterministic.** Scoring is computed from seeded/injected game state — no
  `Math.random()` and no unsampled clock read inside scoring logic itself.
  Same inputs, same Score.
- **Fair across difficulty.** Ranking is normalized per Level (median-based),
  so a Hard or Very Hard Level that scores lower across the board doesn't
  penalize its players in the standings.

---

## Conditions of satisfaction

- Scoring uses continuous methods; no coarse buckets as the primary signal.
- Time-efficiency is measured in milliseconds.
- No direct point penalties for mistakes; errors affect Score only via slower
  cycles, streak breaks, and accuracy.
- Streaks amplify efficient, consecutive successes.
- Accuracy applies as a continuous multiplier.
- Ranking is normalized to the Level's median, not absolute cutoffs.
- Rank tiers include a floor tier (Tier 0) every finished run clears (no "no
  rank" state).
- The results screen animates a clear, legible breakdown and celebrates the
  final Score and rank — final VFX/juice is a later Polish-phase concern, not
  Phase 1 scoring logic.

---

## Match Pile event semantics (fills the template's game-specific gaps)

The template leaves "successful action," "correct," and "wrong" to the game.
For Match Pile:

- **Successful action / time-efficiency event** = a completed triple match —
  Order-relevant or distractor, both count equally.
- **Correct attempt** = a gameplay tap accepted by the rules that successfully
  selects/adds a currently-selectable item to the Slots Row.
- **Wrong attempt** = a gameplay selection rejected by the rules because the
  targeted item cannot legally be selected in the current state.
- **Never counted as wrong:** a valid partial selection that hasn't completed
  a triple yet, an Order-relevant selection, a distractor selection, a
  distractor triple match, a UI interaction, or any neutral action. This
  intentionally avoids penalizing blocker-clearing/distractor play that may be
  necessary to expose buried Order items.
- **FTUE restrictions are not player mistakes:** a tap rejected only because
  an FTUE gate temporarily restricts which tile may legally be selected
  (Level 1's guided step, Level 3's scripted demo) is never a wrong attempt —
  it never touches Accuracy or the Speed Streak. The player has no way to
  know a temporary tutorial restriction in advance, so it can't be a genuine
  mistake.
- **No "correct" tile order:** which specific tile, of several legal options,
  a player selects first is never itself a scoring input. Tile identity,
  tile position, and selection order never appear in any scoring formula —
  only whether a selection was legal (correct/wrong attempt) and the actual
  elapsed wall-clock time between successful triple matches. Two players who
  legally build the same matches in a different tile order are not
  intrinsically better or worse; their scores may still differ naturally
  because their real completion timings differ in milliseconds.
- **Speed streak:** advances on each consecutive successful triple match. A
  wrong attempt (per the definition above) between successful triples resets
  the streak to 0; valid partial selections and neutral/UI actions never
  reset it. The multiplier applies to time-efficiency points only.
- Match Pile requires completing **all** Orders to win (no partial-completion
  mode). Per §1, every completed triple (not per-Order) earns the stable
  Core Match value — resolved this way (approved, 3rd pass) rather than the
  template's original per-Order base-points concept, which had no natural
  per-Order tier to hang a value on in Match Pile's Order shape.
- Match Pile has no single high-stakes "final decisive action" distinct from
  its last triple match, so the **terminal action bonus is disabled**
  (`enabled: false`) unless a future design decision introduces one.

---

## The composite score

- **Core Match value** (stable, per completed triple — the foundation)
- **Time-efficiency points** (continuous, per successful triple match,
  milliseconds — fine granularity only)
- **Speed streak multiplier** (applies to time-efficiency points only)
- **Accuracy multiplier** (continuous, applied at run end)
- **Pace multiplier** (primary — global active-gameplay completion time)
- Terminal action bonus — **disabled** for Match Pile (see above)

### 1. Core Match value (stable, the foundation of the Score)

**Approved, 3rd pass — replaces the template's optional per-Order "base
points" concept.** Every completed triple match is a successful gameplay
action, full stop — Order-relevant or distractor, either way, and regardless
of which tile or which order the player selected. Each one is worth a flat,
timing-independent `coreMatchPoints`.

**Formula:** `coreMatchScore = completedTriples × coreMatchPoints`

**Match Pile-tuned default (approved, 3rd pass):** `coreMatchPoints = 100`.
This is the majority of a typical run's Score by design — Time-efficiency
and Streak add a small bonus on top of this per triple (see §2–3), never the
other way around. Centralized in config (`SCORING_CONFIG.coreMatchPoints`),
never hardcoded in game logic.

### 2. Time-efficiency points (continuous, milliseconds — fine granularity only)

For every successful triple match, award points from the **cycle time** `t` —
the elapsed time since the previous successful triple match, in milliseconds.
Per the responsibility hierarchy above, this term exists purely for Score
granularity/tie-reduction — it must never dominate the final Score or feed
Mastery.

```
time_points(t) = maxPoints × 1 / (1 + (t / tHalf)^gamma)
```

**Match Pile-tuned defaults (approved, 3rd pass):** `maxPoints = 12`,
`tHalf = 8000 ms`, `gamma = 1.0`. The curve *shape* (how gently it falls off
around normal human cycle times) was already tuned in the 2nd pass and is
unchanged; the 3rd pass cut the *scale* — `maxPoints` from 120 to 12 — once
the Core Match value (§1) gave every triple a stable `100`-point foundation.
Even the best realistic case (near-instant cycle time at max Speed Streak)
now adds well under a fifth of a triple's subtotal on top of that `100`, and
a typical cycle time adds roughly 5–10%. A 250–500ms gap between two
otherwise similar successful triples now moves `time_points` — and so the
whole Score — only a tiny amount; the purpose of this term is fine
leaderboard separation, not broad performance grading.

### 3. Speed streak multiplier (time-efficiency only, secondary)

A multiplier on `time_points(t)` for each consecutive successful triple match.
Per the responsibility hierarchy, Streak is a **secondary** modifier — it
rewards clean consecutive play but must not be able to massively separate two
otherwise-similar runs by itself.

- **Match Pile-tuned steps (approved, 2nd pass, unchanged in the 3rd):**
  `[1.0, 1.15, 1.3, 1.45, 1.6]` (cap at the top step). The first pass's
  `[1.0, 1.6, 2.1, 2.6, 3.1]` let one long streak nearly triple a run's
  effective time-efficiency points relative to a broken one — far too large
  a lever for a secondary modifier. The 3rd pass's much smaller
  Time-efficiency scale (§2) already keeps Streak's absolute impact tiny, so
  the steps themselves didn't need to shrink further.
- Reset: a **wrong attempt** (Match Pile semantics above) between successful
  triples resets the streak to 0.
- Valid partial selections and neutral/UI actions do **not** reset the streak.
- Applies to time-efficiency points only, never to the Core Match value.

### 4. Accuracy multiplier (continuous, run-end, secondary)

```
accuracy   = (correct + α) / (correct + λ·wrong + α + β)
multiplier = minAcc + (maxAcc − minAcc) × (accuracy ^ γ)
```

`correct`/`wrong` use the Match Pile gameplay-tap semantics above — never
solver-optimality, never an end-of-run unmatched-item tally.

**Match Pile-tuned defaults (approved, 2nd pass, unchanged in the 3rd):**
`minAcc = 0.85`, `maxAcc = 1.15` (was the template's `0.5`/`1.5` — a 3× swing
that could crush Score for a run with only a small number of genuine
mistakes), `γ = 1.95`, `λ = 1.0`, `α = β = 1`. Accuracy is a **secondary**
modifier alongside Streak — a successful run with a couple of genuine
mistakes should still produce a healthy Score. No direct point penalties
either way.

### 5. Pace multiplier (total active-gameplay time — now primary)

```
p              = clamp(0, 1, (ParTime − T) / (ParTime − AceTime))
paceMultiplier = paceMin + (paceMax − paceMin) × (p ^ γpace)
```

`T = gameplayEndMs − gameplayStartMs`, in milliseconds:

- `gameplayStartMs` — the moment normal, playable gameplay activates. For an
  ungated Level this is the moment it loads; for a gated FTUE Level (1–3)
  this is the instant its tutorial gate releases control to the player, never
  the moment the tutorial is first presented. FTUE instruction/Continue/
  paused-overlay time is excluded by construction — it never starts this
  clock.
- `gameplayEndMs` — the moment the Level's final Order is satisfied and the
  run reaches Win.

Lower `T` is better. `ParTime`/`AceTime` are per-Level benchmarks — Phase 1
uses a static, content-scaled proxy (no live per-Level time analytics exist
yet): `ParTime = expectedTriples × parMsPerTriple`, `AceTime = expectedTriples
× aceMsPerTriple`, where `expectedTriples` is the Level's own triple count.
Levels 1–3 use directly-reasoned overrides instead of the formula (see
`config.ts`'s `pace.perLevelParTimeMs`/`perLevelAceTimeMs`) — these are the
**same** references Mastery uses (§"Mastery rating" below).

**Match Pile-tuned defaults (approved, 3rd pass):** `paceMin = 0.85`,
`paceMax = 1.20`, `γpace = 1.0` (linear in `p` — smooth and continuous, no
cliffs), `parMsPerTriple = 3000`, `aceMsPerTriple = 1000` (this generic
fallback rate is unchanged — see "Mastery rating" below for why later Levels
deliberately stay less generous than Levels 1–3). Pace is a **primary** Score
term, applied on top of the Core Match value
(`mainPerformanceScore = coreMatchScore × globalPaceMultiplier`) — but now
that the Core Match value gives every run a large stable foundation, Pace no
longer needs an extreme percentage swing to still move the Score
meaningfully in absolute terms. Narrowed from the 2nd pass's `0.70`–`1.40`
(calibrated when the Core value was 0 and Pace alone had to carry the entire
"global performance" signal) to a gentler `0.85`–`1.20`. Two runs 300ms apart
in total time should still score nearly the same; a run that takes roughly
double another's total time should still show a clearly meaningful
difference.

### 6. Terminal action bonus — disabled

Not used for Match Pile (see semantics note above). If a future design
introduces one, apply it after all multipliers, unscaled, per the template.

---

## Scoring flow (per run)

1. For each successful triple match `i`:
   - Compute `t_i = now − lastSuccessTime` (milliseconds).
   - Add `coreMatchPoints + time_points(t_i) × streakStep(streakLen)`.
2. After the Level's last Order is satisfied (or the run ends in a loss):
   - Apply the **accuracy multiplier** to the subtotal.
   - Apply the **pace multiplier**.
3. Round to produce the final **Score**.
4. Separately (not derived from the Score above): compute **Mastery stars**
   directly from global active-gameplay time `T`, per "Mastery rating" below.

Steps 1–3 are the granular, millisecond-sensitive Score. Step 4 is the
coarser, stable Mastery signal — see "Score responsibility hierarchy" above
for why these are no longer the same computation.

---

## Ranking & recognition — the median-normalized model (Score-based, unchanged)

Ranking (rank tier + percentile) still normalizes the granular **Score**
against a per-Level median — this pass did not touch Ranking's architecture.
Mastery Stars, covered separately below, moved off Score entirely onto
global completion time; Ranking and Mastery are no longer required to use
the same sensitivity (see "Score responsibility hierarchy" above).

- Store a median Score per Level, with a `DEFAULT_MEDIAN` fallback for Levels
  that don't have enough plays yet.
- **Benchmark the shape on first-attempt runs only** — retries ("Try Again")
  are excluded so repeat plays can't inflate the top tiers. How-to-Play FTUE
  replays are never scored at all, so they're excluded by construction.
- Phase 1: the per-Level median is a static, data-driven value (not a live
  aggregation system). The architecture must stay compatible with a later
  first-attempt, analytics-driven median without a structural rewrite.
- **`DEFAULT_MEDIAN` is a per-completed-triple rate, not a flat absolute
  Score** — it's multiplied by a Level's own triple count, since a single
  absolute number can't fairly represent both a 2-triple FTUE Level and a
  76-triple late Level.
- **Current V1 values:** `DEFAULT_MEDIAN = 330` per triple (the fallback for
  every Level without its own entry below); `Level 1 median = 290`, `Level 2
  median = 3200` (directly measured against real, ordinary-paced play; Level
  1's 2-triple board can never build the Speed Streak longer Levels do, so
  its real per-triple rate is intrinsically below the uniform rate). Level 3
  has no clean full-run measurement yet and uses the uniform `DEFAULT_MEDIAN`
  fallback. Provisional, pending real first-attempt play data.

### Rank tiers (percentile standing)

| Tier | Multiple of median | Standing |
| --- | --- | --- |
| 5 | ≥ 2.02 × | Top 1% |
| 4 | ≥ 1.35 × | Top 10% |
| 3 | ≥ 1.22 × | Top 20% |
| 2 | ≥ 1.07 × | Top 40% |
| 1 | ≥ 0.93 × | Top 60% |
| 0 | any score | Floor tier — unranked |

Tier 0 is the floor every finished run clears — there is always a rank to
show, never a "no rank" state — but Tier 0 itself displays no percentile.
Unchanged this pass, per "do not redesign Ranking."

---

## Mastery rating (0–5 stars) — global-time-based, not Score-based

**Mastery never reads Final Score, anywhere.** It answers a single
question — *"how quickly did the player complete this Level overall?"* —
computed directly from the same global active-gameplay time `T` the Pace
multiplier uses (§5). This keeps Stars stable and readable: the same small
per-triple millisecond noise that legitimately nudges the granular Score
never flips a player between Star ratings, because Mastery never looks at
Score, Streak, or Accuracy at all — a small change in Final Score changes
Stars only if it corresponds to `T` actually crossing a real Par/Ace
boundary, which local timing noise essentially never does given how small
its contribution is (§2).

Each Level has three time references, all in milliseconds (the same
`parTimeMs`/`aceTimeMs` the Pace multiplier uses, plus one Mastery-only
reference):

- **`timerBudgetMs`** — the "barely completes, still successful" ceiling.
  **Not** the real gameplay countdown Timer's fail-budget (that's generous
  survival time — 5 minutes for FTUE — not a meaningful "still a normal
  completion" reference for a 2–12 triple Level). Defaults to
  `parTimeMs × slowCeilingMultiplierOfPar`.
- **`parTimeMs`** — a normal human target.
- **`aceTimeMs`** — an excellent human target.

Two-segment continuous interpolation across `timerBudgetMs → parTimeMs →
aceTimeMs`:

```
T >= parTimeMs:  progress = 0.5 × (timerBudgetMs − T) / (timerBudgetMs − parTimeMs)
T <  parTimeMs:  progress = 0.5 + 0.5 × (parTimeMs − T) / (parTimeMs − aceTimeMs)
progress = clamp(0, 1, progress)
stars    = round(minSuccessStars + (maxStars − minSuccessStars) × progress)
```

At `T == parTimeMs`, `progress == 0.5` in both branches (continuous), which
with the default `minSuccessStars = 1`/`maxStars = 5` lands exactly on 3
stars — Par reads as "solid middle." At `T >= timerBudgetMs`, `progress`
clamps to 0 → the 1-star floor; at `T <= aceTimeMs`, `progress` clamps to 1
→ 5 stars.

**Win floor / ceiling:** a Loss or unfinished run is always 0 stars. Any Win
is clamped to `minSuccessStars`–`maxStars` (currently 1–5) by construction —
the interpolation above can never produce less than 1 star for a completed
run, so no separate "win ? max(1, …) : 0" wrapper is needed; the caller only
adds the `won ? … : 0` branch. **There is no Level 1 special case** — every
Level, including the FTUE Levels, goes through this same formula.

**Match Pile-tuned defaults (approved):** `minStars = 0`, `maxStars = 5`,
`minSuccessStars = 1`, `slowCeilingMultiplierOfPar = 3` (the default "still
succeeded, just slow" ceiling is 3× a Level's Par time, when no explicit
`perLevelSlowCeilingMs` override exists).

**FTUE (Levels 1–3) get intentionally more welcoming references than later
Levels (approved, 3rd pass).** The 2nd pass's FTUE time references made a
normal human completion land almost exactly at Par (3 stars) — too harsh for
onboarding Levels per direct playtest feedback (3★ was common, 4★ was hard,
5★ was effectively unreachable). Retuned so Par now represents a **slower,
still-acceptable** completion rather than the average one: a normal
real-player run instead lands about three-quarters of the way from Par to
Ace, i.e. around **4 stars**, leaving genuine excellence for 5 and an
extremely slow (but still successful) run at the 1–2 star floor.
`ace = 0.6 × normal`, `par = 1.4 × normal`, where `normal` is the real,
directly-measured ordinary-pace completion time:

| Level | parTimeMs | aceTimeMs | timerBudgetMs (3× par, default) |
| --- | --- | --- | --- |
| 1 (2 triples) | 4,500 | 2,000 | 13,500 |
| 2 (10 triples) | 38,000 | 16,000 | 114,000 |
| 3 (12 triples) | 46,000 | 20,000 | 138,000 |

**Later Levels (4+) deliberately keep the more neutral 2nd-pass mapping** —
`parMsPerTriple = 3000`/`aceMsPerTriple = 1000` (unchanged, §5) — so a normal
expected performance there still lands around 3 stars, good around 4, and
excellent at 5. The extra generosity above is onboarding-specific, not a
blanket change: later Levels are not blindly copied from the FTUE
references. Provisional pending real first-attempt play data, same caveat as
the Ranking median above.

---

## Results screen

Suggested breakdown order (final VFX/juice is Polish-phase, not Phase 1 logic):

1. Best streak
2. Speed streak multiplier
3. Accuracy — percentage → multiplier
4. Total time
5. **Final Score** — the largest, most celebratory element
6. Mastery stars (0–5)
7. Rank tier + percentile (Tier 0 shows no percentile)
8. Pace multiplier (if enabled)

---

## Default tunables (summary)

Match Pile-tuned V1 values, wired to `src/game/match-pile/scoring/config.ts`
(`SCORING_CONFIG`) — provisional pending real first-attempt play data, but
approved as the current baseline (not template starting defaults anymore):

```ts
coreMatchPoints: 100,                                          // stable foundation, every completed triple
time:     { maxPoints: 12, tHalfMs: 8000, gamma: 1.0 },        // fine granularity only, ~5-10% of a typical Score
streak:   { steps: [1.0, 1.15, 1.3, 1.45, 1.6] },              // secondary
accuracy: { min: 0.85, max: 1.15, gamma: 1.95, lambdaWrong: 1.0, alpha: 1, beta: 1 }, // secondary
pace:     {                                                     // primary — also feeds Mastery
  enabled: true, min: 0.85, max: 1.20, gamma: 1.0,
  parMsPerTriple: 3000, aceMsPerTriple: 1000,                  // Level 4+ fallback (normal -> ~3 stars)
  perLevelParTimeMs: { 1: 4500, 2: 38000, 3: 46000 },          // FTUE (normal -> ~4 stars)
  perLevelAceTimeMs: { 1: 2000, 2: 16000, 3: 20000 },
},
terminal: { enabled: false, baseAward: 1500, decayRate: 0.5 },
mastery:  {                                                     // global-time-based, never reads Score
  minStars: 0, maxStars: 5, minSuccessStars: 1,
  slowCeilingMultiplierOfPar: 3, perLevelSlowCeilingMs: {},
},
ranking:  { defaultMedian: 330, perLevelMedian: { 1: 290, 2: 3200 }, firstAttemptOnly: true }, // Score-based, unchanged
```

All of the above live in config/data — never as hardcoded magic numbers in
game logic.

---

## Anti-patterns — common mistakes to avoid

- **Coarse buckets.** Flat per-Level points or a handful of score tiers
  collapse the distribution and flood the leaderboard with ties.
- **Whole-second timing.** Measuring cycle time in seconds throws away most of
  the granularity the time-efficiency curve exists to create. Use
  milliseconds.
- **Direct point penalties.** Subtracting points for a mistake feels punishing
  and is easy to exploit. Let errors cost indirectly (time, streak, accuracy).
- **Treating distractor play as a mistake.** Clearing a distractor triple —
  even one that doesn't advance any Order — is a valid success, not an
  accuracy hit. This is Match Pile's most important deviation risk: it's easy
  to accidentally wire "did this progress an Order?" into the wrong/correct
  check instead of "was this pick legal?".
- **Fine granularity dominating.** If per-triple time-efficiency is too
  steep — or its scale too large relative to the Core Match value — small
  normal timing noise between individual matches swamps the stable Core and
  global completion performance, and constantly flips Mastery between Star
  ratings. Per the "Score responsibility hierarchy" above: the Core Match
  value is the deliberately-dominant foundation; Pace (global performance)
  is the primary modifier on top of it; Streak and Accuracy are narrow
  secondary modifiers; per-triple timing is the gentlest of all, by scale
  (§2) as well as by curve shape.
- **Absolute cutoffs across difficulty.** Fixed score thresholds rank players
  on a Very Hard Level unfairly against an Easy one. Normalize to the Level's
  median.
- **Benchmarking on all runs.** Including retries in the percentile benchmark
  inflates the top tiers. Benchmark on first attempts only.
- **RNG in the scoring path.** Any randomness in scoring breaks determinism
  and leaderboard fairness. Compute from seeded/injected state.
- **No floor tier.** Leaving a "no rank" state below the lowest cutoff means
  some finished runs show nothing. Tier 0 is always shown, without a
  percentile.
- **An unexplainable score.** If the results screen can't show why the number
  is what it is, players stop trusting it.

---

## Variant note

The template's "threshold / partial-completion" variant does not apply to
Match Pile — every Order must be completed to win. The stable Core Match
value (§1) is the same per triple regardless of Level; differentiation comes
from global completion performance (Pace), Streak, Accuracy, and
per-triple time-efficiency.
