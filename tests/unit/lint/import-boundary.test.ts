import { describe, it, expect } from "bun:test";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const FIXTURES_DIR = path.join(ROOT, "tests/unit/lint/.fixtures");

function biomeLint(filePath: string): string {
  try {
    return execSync(`npx @biomejs/biome lint ${filePath} --diagnostic-level=error`, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e: any) {
    return (e.stdout || "") + (e.stderr || "");
  }
}

function writeFixture(relativePath: string, content: string): string {
  const fullPath = path.join(ROOT, relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
  return relativePath;
}

function cleanFixture(relativePath: string): void {
  rmSync(path.join(ROOT, relativePath), { force: true });
}

describe("Import boundary lint rules", () => {
  // --- core/ boundary ---

  it("core/ importing from ~/game/ should fail", () => {
    const file = writeFixture(
      "src/core/_boundary-test.ts",
      'export { } from "~/game/config";\n',
    );
    try {
      const output = biomeLint(file);
      expect(output).toContain("noRestrictedImports");
      expect(output).toContain("core/ must not import from game/");
    } finally {
      cleanFixture(file);
    }
  });

  it("core/ importing from ~/modules/ should fail", () => {
    const file = writeFixture(
      "src/core/_boundary-test.ts",
      'export { } from "~/modules/primitives/sprite-button";\n',
    );
    try {
      const output = biomeLint(file);
      expect(output).toContain("noRestrictedImports");
      expect(output).toContain("core/ must not import from modules/");
    } finally {
      cleanFixture(file);
    }
  });

  it("core/ importing from ~/core/ should pass", () => {
    const file = writeFixture(
      "src/core/_boundary-test.ts",
      'export { } from "~/core/config";\n',
    );
    try {
      const output = biomeLint(file);
      expect(output).not.toContain("noRestrictedImports");
    } finally {
      cleanFixture(file);
    }
  });

  // --- modules/ boundary ---

  it("modules/ importing from ~/game/ should fail", () => {
    const file = writeFixture(
      "src/modules/_boundary-test.ts",
      'export { } from "~/game/config";\n',
    );
    try {
      const output = biomeLint(file);
      expect(output).toContain("noRestrictedImports");
      expect(output).toContain("modules/ must not import from game/");
    } finally {
      cleanFixture(file);
    }
  });

  it("modules/ importing from ~/core/ should pass", () => {
    const file = writeFixture(
      "src/modules/_boundary-test.ts",
      'export { } from "~/core/config";\n',
    );
    try {
      const output = biomeLint(file);
      expect(output).not.toContain("noRestrictedImports");
    } finally {
      cleanFixture(file);
    }
  });

  // --- game/ boundary ---

  it("game/ importing from ~/core/ should pass", () => {
    const file = writeFixture(
      "src/game/_boundary-test.ts",
      'export { } from "~/core/config";\n',
    );
    try {
      const output = biomeLint(file);
      expect(output).not.toContain("noRestrictedImports");
    } finally {
      cleanFixture(file);
    }
  });

  it("game/ importing from ~/modules/ should pass", () => {
    const file = writeFixture(
      "src/game/_boundary-test.ts",
      'export { } from "~/modules/primitives/sprite-button";\n',
    );
    try {
      const output = biomeLint(file);
      expect(output).not.toContain("noRestrictedImports");
    } finally {
      cleanFixture(file);
    }
  });
});
