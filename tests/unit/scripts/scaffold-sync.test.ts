import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyScaffoldSyncMeta } from "../../../scripts/scaffold-sync";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SYNC_SCRIPT = path.join(ROOT, "scripts/scaffold-sync.ts");

let scaffoldDir: string;
let gameDir: string;

function runIn(dir: string, cmd: string): string {
  return execSync(cmd, { cwd: dir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
}

function readPkg(dir: string): any {
  return JSON.parse(readFileSync(path.join(dir, "package.json"), "utf-8"));
}

describe("applyScaffoldSyncMeta (pure)", () => {
  it("merges scaffold version from scaffold package", () => {
    const gamePkg = JSON.stringify({ name: "my-game", scaffold: { version: "1.0.0" } });
    const scaffoldPkg = JSON.stringify({ name: "scaffold", scaffold: { version: "1.2.0" } });
    const result = JSON.parse(applyScaffoldSyncMeta(gamePkg, scaffoldPkg, "2025-01-01", "abc123"));
    expect(result.scaffold.version).toBe("1.2.0");
    expect(result.scaffold.syncedAt).toBe("2025-01-01");
    expect(result.scaffold.syncedFrom).toBe("abc123");
  });

  it("preserves game name and other fields", () => {
    const gamePkg = JSON.stringify({ name: "my-game", dependencies: { foo: "1.0.0" }, scaffold: { version: "1.0.0" } });
    const scaffoldPkg = JSON.stringify({ name: "scaffold", scaffold: { version: "2.0.0" } });
    const result = JSON.parse(applyScaffoldSyncMeta(gamePkg, scaffoldPkg, "2025-06-15", "def456"));
    expect(result.name).toBe("my-game");
    expect(result.dependencies.foo).toBe("1.0.0");
    expect(result.scaffold.version).toBe("2.0.0");
  });

  it("creates scaffold field if missing in game pkg", () => {
    const gamePkg = JSON.stringify({ name: "my-game" });
    const scaffoldPkg = JSON.stringify({ name: "scaffold", scaffold: { version: "1.0.0" } });
    const result = JSON.parse(applyScaffoldSyncMeta(gamePkg, scaffoldPkg, "2025-01-01", "abc123"));
    expect(result.scaffold.version).toBe("1.0.0");
  });

  it("falls back to game version if scaffold has no version", () => {
    const gamePkg = JSON.stringify({ name: "my-game", scaffold: { version: "0.5.0" } });
    const scaffoldPkg = JSON.stringify({ name: "scaffold" });
    const result = JSON.parse(applyScaffoldSyncMeta(gamePkg, scaffoldPkg, "2025-01-01", "abc123"));
    expect(result.scaffold.version).toBe("0.5.0");
  });

  it("falls back to 0.0.0 if neither has version", () => {
    const gamePkg = JSON.stringify({ name: "my-game" });
    const scaffoldPkg = JSON.stringify({ name: "scaffold" });
    const result = JSON.parse(applyScaffoldSyncMeta(gamePkg, scaffoldPkg, "2025-01-01", "abc123"));
    expect(result.scaffold.version).toBe("0.0.0");
  });

  it("output ends with trailing newline", () => {
    const gamePkg = JSON.stringify({ name: "my-game" });
    const scaffoldPkg = JSON.stringify({ name: "scaffold", scaffold: { version: "1.0.0" } });
    const output = applyScaffoldSyncMeta(gamePkg, scaffoldPkg, "2025-01-01", "abc123");
    expect(output.endsWith("\n")).toBe(true);
  });
});

describe("scaffold-sync.ts (integration)", () => {
  beforeEach(() => {
    // Create a "scaffold" bare repo to act as the remote
    const base = mkdtempSync(path.join(tmpdir(), "scaffold-sync-test-"));
    scaffoldDir = path.join(base, "scaffold");
    gameDir = path.join(base, "game");

    // Set up scaffold repo
    mkdirSync(scaffoldDir, { recursive: true });
    runIn(scaffoldDir, "git init");
    runIn(scaffoldDir, 'git config user.email "test@test.com"');
    runIn(scaffoldDir, 'git config user.name "Test"');

    // Create scaffold structure
    mkdirSync(path.join(scaffoldDir, "src/core/systems"), { recursive: true });
    mkdirSync(path.join(scaffoldDir, "src/modules/primitives"), { recursive: true });
    mkdirSync(path.join(scaffoldDir, "src/game"), { recursive: true });

    writeFileSync(path.join(scaffoldDir, "src/core/index.ts"), 'export const version = "1.0.0";\n');
    writeFileSync(path.join(scaffoldDir, "src/core/systems/audio.ts"), "export const audio = {};\n");
    writeFileSync(path.join(scaffoldDir, "src/modules/primitives/button.ts"), "export const Button = {};\n");
    writeFileSync(path.join(scaffoldDir, "src/game/config.ts"), 'export const game = "scaffold-template";\n');
    writeFileSync(
      path.join(scaffoldDir, "package.json"),
      JSON.stringify({ name: "scaffold", scaffold: { version: "1.2.0" } }, null, 2) + "\n",
    );
    writeFileSync(path.join(scaffoldDir, "vite.config.ts"), "export default {};\n");
    writeFileSync(path.join(scaffoldDir, "tsconfig.json"), "{}\n");
    writeFileSync(path.join(scaffoldDir, "vitest.config.ts"), "export default {};\n");
    writeFileSync(path.join(scaffoldDir, "biome.json"), "{}\n");
    writeFileSync(path.join(scaffoldDir, ".gitattributes"), "src/game/** merge=ours\n");

    runIn(scaffoldDir, "git add -A && git commit -m 'scaffold v1.2.0'");

    // Clone scaffold to create a "game" repo
    runIn(base, `git clone ${scaffoldDir} game`);
    runIn(gameDir, 'git config user.email "test@test.com"');
    runIn(gameDir, 'git config user.name "Test"');

    // Customize game-side files
    writeFileSync(path.join(gameDir, "src/game/config.ts"), 'export const game = "my-game";\n');
    writeFileSync(
      path.join(gameDir, "package.json"),
      JSON.stringify({ name: "my-game", scaffold: { version: "1.0.0" } }, null, 2) + "\n",
    );
    runIn(gameDir, "git add -A && git commit -m 'customize game'");

    // Now update scaffold with new content
    writeFileSync(path.join(scaffoldDir, "src/core/index.ts"), 'export const version = "1.2.0";\n');
    writeFileSync(path.join(scaffoldDir, "src/core/systems/audio.ts"), "export const audio = { volume: 1 };\n");
    runIn(scaffoldDir, "git add -A && git commit -m 'scaffold update'");

    // Rename the origin remote to "scaffold" (the sync script expects a "scaffold" remote)
    runIn(gameDir, "git remote rename origin scaffold");
  });

  afterEach(() => {
    // Clean up both dirs (they share a parent)
    const base = path.dirname(scaffoldDir);
    rmSync(base, { recursive: true, force: true });
  });

  it("syncs scaffold-owned paths into the game repo", () => {
    runIn(gameDir, `bun run ${SYNC_SCRIPT}`);

    // Core files should be updated
    const coreIndex = readFileSync(path.join(gameDir, "src/core/index.ts"), "utf-8");
    expect(coreIndex).toContain('version = "1.2.0"');

    const audioFile = readFileSync(path.join(gameDir, "src/core/systems/audio.ts"), "utf-8");
    expect(audioFile).toContain("volume: 1");
  });

  it("does not modify game-owned files", () => {
    runIn(gameDir, `bun run ${SYNC_SCRIPT}`);

    const gameConfig = readFileSync(path.join(gameDir, "src/game/config.ts"), "utf-8");
    expect(gameConfig).toContain('"my-game"');
  });

  it("updates scaffold sync metadata in package.json", () => {
    runIn(gameDir, `bun run ${SYNC_SCRIPT}`);

    const pkg = readPkg(gameDir);
    expect(pkg.scaffold.version).toBe("1.2.0");
    expect(pkg.scaffold.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(pkg.scaffold.syncedFrom).toBeTruthy();
    expect(typeof pkg.scaffold.syncedFrom).toBe("string");
  });

  it("adds scaffold remote automatically if missing", () => {
    runIn(gameDir, "git remote remove scaffold");

    const output = execSync(`bun run ${SYNC_SCRIPT}`, {
      cwd: gameDir,
      encoding: "utf-8",
      env: { ...process.env, SCAFFOLD_URL: scaffoldDir },
      timeout: 15000,
    });
    expect(output).toContain("Adding scaffold remote");

    // Verify the remote was added and sync completed
    const remotes = runIn(gameDir, "git remote -v");
    expect(remotes).toContain("scaffold");
  });

  it("rejects when working tree is dirty", () => {
    writeFileSync(path.join(gameDir, "package.json"), '{"dirty": true}');
    let threw = false;
    try {
      runIn(gameDir, `bun run ${SYNC_SCRIPT}`);
    } catch (e: any) {
      threw = true;
      expect((e.stderr || "") + (e.stdout || "")).toContain("uncommitted changes");
    }
    expect(threw).toBe(true);
  });
});
