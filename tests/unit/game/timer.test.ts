/**
 * Match Pile — Timer system spec (red phase).
 *
 * Countdown Timer is a required core system per docs/GAME-DESIGN.md#timer and
 * tier-a/REFERENCE_MATRIX.json (R-TIMER-BUDGET, R-TIMER-FAIL, R-TIMER-PAUSE).
 * None of it is implemented yet. See tier-a/evidence/red/*.txt for the
 * recorded runs.
 */

import { describe, it, expect } from "vitest";
import { createGameWorld } from "~/game/match-pile/ecs/plugin";
import { loadLevel } from "~/game/match-pile/ecs/agentPlugin";

describe("Timer system (red phase — unimplemented)", () => {
  it("R-TIMER-BUDGET — a tickTimer transaction exists and tracks a millisecond-precision budget/remaining pair", async () => {
    const timerModule = await import("~/game/match-pile/ecs/transactions/tickTimer").catch(() => null);
    expect(timerModule, "ecs/transactions/tickTimer does not exist yet").not.toBeNull();
  });

  it("R-TIMER-FAIL — reaching 0ms remaining before Orders complete flips the run to lost", async () => {
    const timerModule = await import("~/game/match-pile/ecs/transactions/tickTimer").catch(() => null);
    expect(timerModule, "cannot exercise R-TIMER-FAIL — the module does not exist yet").not.toBeNull();
    if (!timerModule) return;
    const tick = (timerModule as { tickTimer?: (store: unknown, args: { nowMs: number }) => void }).tickTimer;
    expect(tick, "tickTimer export does not exist yet").toBeTypeOf("function");
  });

  it("R-TIMER-PAUSE — the timer resource does not advance while timerRunning is false (FTUE instruction states)", async () => {
    const resourcesModule = await import("~/game/match-pile/ecs/resources").catch(() => null);
    expect(resourcesModule, "ecs/resources module exists (from Phase 1 build)").not.toBeNull();
    const resources = (resourcesModule as { resources?: Record<string, unknown> })?.resources;
    // FAILS today — no timerRunning/timerRemainingMs/timerBudgetMs resource fields exist yet.
    expect(resources && "timerRunning" in resources, "no timerRunning resource field yet").toBe(true);
    expect(resources && "timerRemainingMs" in resources, "no timerRemainingMs resource field yet").toBe(true);
  });
});

describe("tickTimer / expireTimer — direct, headless coverage (Phase 1 Timer implementation)", () => {
  it("remaining decreases by dtMs while timerRunning", () => {
    const db = createGameWorld();
    loadLevel(db, 1, 0);
    expect(db.resources.timerRunning).toBe(true);
    const before = db.resources.timerRemainingMs;
    db.transactions.tickTimer({ dtMs: 1000 });
    expect(db.resources.timerRemainingMs).toBe(before - 1000);
  });

  it("remaining does NOT decrease when timerRunning is false", () => {
    const db = createGameWorld();
    loadLevel(db, 1, 0);
    db.resources.timerRunning = false;
    const before = db.resources.timerRemainingMs;
    db.transactions.tickTimer({ dtMs: 1000 });
    expect(db.resources.timerRemainingMs).toBe(before);
  });

  it("reaching 0 while phase==='playing' flips phase to 'lost' and stops the timer", () => {
    const db = createGameWorld();
    loadLevel(db, 1, 0);
    const budget = db.resources.timerBudgetMs;
    db.transactions.tickTimer({ dtMs: budget + 1000 });
    expect(db.resources.timerRemainingMs).toBe(0);
    expect(db.resources.pile.phase).toBe("lost");
    expect(db.resources.timerRunning).toBe(false);
  });

  it("ticking a timer that's already not 'playing' (e.g. 'won') is a no-op — does not resurrect it to 'lost'", () => {
    const db = createGameWorld();
    loadLevel(db, 1, 0);
    // Directly force a 'won' phase for test setup only (production code writes via transactions).
    db.resources.pile = { ...db.resources.pile, phase: "won" };
    const before = db.resources.timerRemainingMs;
    db.transactions.tickTimer({ dtMs: 1000 });
    expect(db.resources.timerRemainingMs).toBe(before);
    expect(db.resources.pile.phase).toBe("won");
    expect(db.resources.timerRunning).toBe(false);
  });
});
