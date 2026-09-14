import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { execSync } from "node:child_process";
import { writeFileSync, rmSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { bumpVersion, validateBumpType, bumpScaffoldVersion, assertCleanWorkingTree } from "../../../scripts/scaffold-release";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const RELEASE_SCRIPT = path.join(ROOT, "scripts/scaffold-release.ts");

let tempDir: string;

function run(cmd: string): string {
  return execSync(cmd, { cwd: tempDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
}

function readPkg(): any {
  return JSON.parse(readFileSync(path.join(tempDir, "package.json"), "utf-8"));
}

describe("bumpVersion (pure)", () => {
  it("patch: 1.0.0 → 1.0.1", () => {
    expect(bumpVersion("1.0.0", "patch")).toBe("1.0.1");
  });

  it("minor: 1.0.0 → 1.1.0", () => {
    expect(bumpVersion("1.0.0", "minor")).toBe("1.1.0");
  });

  it("major: 1.0.0 → 2.0.0", () => {
    expect(bumpVersion("1.0.0", "major")).toBe("2.0.0");
  });

  it("patch: 0.0.0 → 0.0.1", () => {
    expect(bumpVersion("0.0.0", "patch")).toBe("0.0.1");
  });

  it("minor: 1.2.3 → 1.3.0", () => {
    expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0");
  });

  it("major: 1.2.3 → 2.0.0", () => {
    expect(bumpVersion("1.2.3", "major")).toBe("2.0.0");
  });
});

describe("validateBumpType (pure)", () => {
  it("accepts patch", () => {
    expect(validateBumpType("patch")).toBe("patch");
  });

  it("accepts minor", () => {
    expect(validateBumpType("minor")).toBe("minor");
  });

  it("accepts major", () => {
    expect(validateBumpType("major")).toBe("major");
  });

  it("rejects invalid input", () => {
    expect(validateBumpType("invalid")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(validateBumpType("")).toBeNull();
  });
});

describe("scaffold-release.ts (integration)", () => {
  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "scaffold-release-test-"));
    run("git init");
    run('git config user.email "test@test.com"');
    run('git config user.name "Test"');
    writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test", scaffold: { version: "1.0.0" } }, null, 2) + "\n",
    );
    run("git add -A && git commit -m 'init'");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("patch bump: 1.0.0 → 1.0.1", () => {
    run(`bun run ${RELEASE_SCRIPT} patch`);
    const pkg = readPkg();
    expect(pkg.scaffold.version).toBe("1.0.1");
    const tags = run("git tag").trim();
    expect(tags).toContain("scaffold-v1.0.1");
  });

  it("minor bump: 1.0.0 → 1.1.0", () => {
    run(`bun run ${RELEASE_SCRIPT} minor`);
    const pkg = readPkg();
    expect(pkg.scaffold.version).toBe("1.1.0");
    const tags = run("git tag").trim();
    expect(tags).toContain("scaffold-v1.1.0");
  });

  it("major bump: 1.0.0 → 2.0.0 with warning", () => {
    const output = run(`bun run ${RELEASE_SCRIPT} major`);
    const pkg = readPkg();
    expect(pkg.scaffold.version).toBe("2.0.0");
    expect(output).toContain("MAJOR VERSION BUMP");
    expect(output).toContain("full merge");
    const tags = run("git tag").trim();
    expect(tags).toContain("scaffold-v2.0.0");
  });

  it("rejects invalid bump type", () => {
    let threw = false;
    try {
      run(`bun run ${RELEASE_SCRIPT} invalid`);
    } catch (e: any) {
      threw = true;
      expect(e.stderr || e.stdout || "").toContain("Usage");
    }
    expect(threw).toBe(true);
  });

  it("rejects when working tree is dirty", () => {
    writeFileSync(path.join(tempDir, "package.json"), '{"dirty": true}');
    let threw = false;
    try {
      run(`bun run ${RELEASE_SCRIPT} patch`);
    } catch (e: any) {
      threw = true;
      expect(e.stderr || e.stdout || "").toContain("uncommitted changes");
    }
    expect(threw).toBe(true);
  });

  it("bumpScaffoldVersion writes correct version to disk", () => {
    const version = bumpScaffoldVersion("patch", tempDir);
    expect(version).toBe("1.0.1");
    const pkg = readPkg();
    expect(pkg.scaffold.version).toBe("1.0.1");
  });

  it("assertCleanWorkingTree throws on dirty tree", () => {
    writeFileSync(path.join(tempDir, "package.json"), '{"dirty": true}');
    expect(() => assertCleanWorkingTree(tempDir)).toThrow("uncommitted changes");
  });
});
