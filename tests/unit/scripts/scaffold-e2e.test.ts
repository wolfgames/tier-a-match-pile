import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SYNC_SCRIPT = path.join(ROOT, "scripts/scaffold-sync.ts");
const RELEASE_SCRIPT = path.join(ROOT, "scripts/scaffold-release.ts");
const ROLLBACK_SCRIPT = path.join(ROOT, "scripts/scaffold-rollback.ts");
const DRIFT_SCRIPT = path.join(ROOT, "scripts/scaffold-drift.ts");

let scaffoldDir: string;
let gameDir: string;
let base: string;

function runIn(dir: string, cmd: string, env?: Record<string, string>): string {
  return execSync(cmd, {
    cwd: dir,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...env },
    timeout: 15000,
  });
}

function readPkg(dir: string): any {
  return JSON.parse(readFileSync(path.join(dir, "package.json"), "utf-8"));
}

function latestCommitMsg(dir: string): string {
  return runIn(dir, "git log -1 --format=%s").trim();
}

describe("scaffold e2e workflow", () => {
  beforeEach(() => {
    base = mkdtempSync(path.join(tmpdir(), "scaffold-e2e-"));
    scaffoldDir = path.join(base, "scaffold");
    gameDir = path.join(base, "game");

    // Set up scaffold repo
    mkdirSync(scaffoldDir, { recursive: true });
    runIn(scaffoldDir, "git init");
    runIn(scaffoldDir, 'git config user.email "test@test.com"');
    runIn(scaffoldDir, 'git config user.name "Test"');

    mkdirSync(path.join(scaffoldDir, "src/core/systems"), { recursive: true });
    mkdirSync(path.join(scaffoldDir, "src/modules/primitives"), { recursive: true });
    mkdirSync(path.join(scaffoldDir, "src/game"), { recursive: true });

    writeFileSync(path.join(scaffoldDir, "src/core/index.ts"), 'export const version = "1.0.0";\n');
    writeFileSync(path.join(scaffoldDir, "src/modules/primitives/button.ts"), "export const Button = {};\n");
    writeFileSync(path.join(scaffoldDir, "src/game/config.ts"), 'export const game = "scaffold";\n');
    writeFileSync(
      path.join(scaffoldDir, "package.json"),
      JSON.stringify({ name: "scaffold", scaffold: { version: "1.0.0" } }, null, 2) + "\n",
    );
    writeFileSync(path.join(scaffoldDir, "vite.config.ts"), "export default {};\n");
    writeFileSync(path.join(scaffoldDir, "tsconfig.json"), "{}\n");
    writeFileSync(path.join(scaffoldDir, "vitest.config.ts"), "export default {};\n");
    writeFileSync(path.join(scaffoldDir, "biome.json"), "{}\n");
    writeFileSync(path.join(scaffoldDir, ".gitattributes"), "src/game/** merge=ours\n");

    runIn(scaffoldDir, "git add -A && git commit -m 'initial scaffold v1.0.0'");

    // Tag initial release
    runIn(scaffoldDir, 'git tag -a scaffold-v1.0.0 -m "Scaffold release v1.0.0"');

    // Clone to create game repo
    runIn(base, `git clone ${scaffoldDir} game`);
    runIn(gameDir, 'git config user.email "test@test.com"');
    runIn(gameDir, 'git config user.name "Test"');

    // Customize game
    writeFileSync(path.join(gameDir, "src/game/config.ts"), 'export const game = "my-game";\n');
    writeFileSync(
      path.join(gameDir, "package.json"),
      JSON.stringify({ name: "my-game", scaffold: { version: "1.0.0" } }, null, 2) + "\n",
    );
    runIn(gameDir, "git add -A && git commit -m 'customize game'");
    runIn(gameDir, "git remote rename origin scaffold");
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it("release: bumps version, creates tag, generates changelog", () => {
    // Make a change in scaffold
    writeFileSync(path.join(scaffoldDir, "src/core/index.ts"), 'export const version = "1.1.0";\n');
    runIn(scaffoldDir, "git add -A && git commit -m 'feat: update core'");

    // Run release
    runIn(scaffoldDir, `bun run ${RELEASE_SCRIPT} minor`);

    // Verify version bump
    const pkg = readPkg(scaffoldDir);
    expect(pkg.scaffold.version).toBe("1.1.0");

    // Verify tag
    const tags = runIn(scaffoldDir, "git tag -l 'scaffold-v*'");
    expect(tags).toContain("scaffold-v1.1.0");

    // Verify changelog
    const changelog = readFileSync(path.join(scaffoldDir, "CHANGELOG.md"), "utf-8");
    expect(changelog).toContain("## 1.1.0");
    expect(changelog).toContain("feat: update core");
  });

  it("sync: pulls scaffold update into game, preserves game files", () => {
    // Update scaffold
    writeFileSync(path.join(scaffoldDir, "src/core/index.ts"), 'export const version = "updated";\n');
    runIn(scaffoldDir, "git add -A && git commit -m 'update core'");

    // Sync game
    runIn(gameDir, `bun run ${SYNC_SCRIPT}`);

    // Core updated
    const core = readFileSync(path.join(gameDir, "src/core/index.ts"), "utf-8");
    expect(core).toContain("updated");

    // Game preserved
    const game = readFileSync(path.join(gameDir, "src/game/config.ts"), "utf-8");
    expect(game).toContain("my-game");

    // Metadata updated
    const pkg = readPkg(gameDir);
    expect(pkg.scaffold.syncedAt).toBeTruthy();
    expect(pkg.scaffold.syncedFrom).toBeTruthy();
  });

  it("rollback: reverts a sync commit", () => {
    // Update scaffold and sync
    writeFileSync(path.join(scaffoldDir, "src/core/index.ts"), 'export const version = "new";\n');
    runIn(scaffoldDir, "git add -A && git commit -m 'update'");
    runIn(gameDir, `bun run ${SYNC_SCRIPT}`);

    // Verify sync happened
    const coreAfterSync = readFileSync(path.join(gameDir, "src/core/index.ts"), "utf-8");
    expect(coreAfterSync).toContain("new");

    // Rollback
    runIn(gameDir, `bun run ${ROLLBACK_SCRIPT}`);

    // Core should be reverted
    const coreAfterRollback = readFileSync(path.join(gameDir, "src/core/index.ts"), "utf-8");
    expect(coreAfterRollback).toContain('version = "1.0.0"');
  });

  it("rollback: refuses if latest commit is not a sync", () => {
    let threw = false;
    try {
      runIn(gameDir, `bun run ${ROLLBACK_SCRIPT}`);
    } catch (e: any) {
      threw = true;
      expect((e.stderr || "") + (e.stdout || "")).toContain("not a scaffold sync");
    }
    expect(threw).toBe(true);
  });

  it("drift: reports clean when no local changes", () => {
    const output = runIn(gameDir, `bun run ${DRIFT_SCRIPT}`);
    expect(output).toContain("No drift detected");
  });

  it("drift: detects local modifications to scaffold paths", () => {
    // Modify a scaffold-owned file locally
    writeFileSync(path.join(gameDir, "src/core/index.ts"), 'export const version = "hacked";\n');
    runIn(gameDir, "git add -A && git commit -m 'local hack'");

    let threw = false;
    try {
      runIn(gameDir, `bun run ${DRIFT_SCRIPT}`);
    } catch (e: any) {
      threw = true;
      expect((e.stderr || "") + (e.stdout || "")).toContain("src/core/index.ts");
    }
    expect(threw).toBe(true);
  });

  it("full workflow: release → sync → verify drift clean", () => {
    // 1. Make scaffold change
    writeFileSync(path.join(scaffoldDir, "src/core/index.ts"), 'export const version = "1.1.0";\n');
    runIn(scaffoldDir, "git add -A && git commit -m 'feat: new core feature'");

    // 2. Release
    runIn(scaffoldDir, `bun run ${RELEASE_SCRIPT} minor`);
    const scaffoldPkg = readPkg(scaffoldDir);
    expect(scaffoldPkg.scaffold.version).toBe("1.1.0");

    // 3. Sync game
    runIn(gameDir, `bun run ${SYNC_SCRIPT}`);
    const gamePkg = readPkg(gameDir);
    expect(gamePkg.scaffold.version).toBe("1.1.0");

    // 4. Verify no drift after sync
    const driftOutput = runIn(gameDir, `bun run ${DRIFT_SCRIPT}`);
    expect(driftOutput).toContain("No drift detected");

    // 5. Game files untouched
    const gameConfig = readFileSync(path.join(gameDir, "src/game/config.ts"), "utf-8");
    expect(gameConfig).toContain("my-game");

    // 6. Commit history is clean
    const syncMsg = latestCommitMsg(gameDir);
    expect(syncMsg).toMatch(/^chore: sync scaffold to/);
  });
});
