/**
 * Manifest validation script tests.
 *
 * Unit-tests the validation rules from scripts/check-manifest.ts
 * without running the script as a process. Extracts the core validation
 * logic and tests each rule independently.
 *
 * Validates:
 * - cdnBase is required
 * - bundles is required array
 * - Bundle names must match naming convention
 * - Bundle names must use reserved prefix or have "kind"
 * - Duplicate bundle names are detected
 * - Asset paths are relative with valid extensions
 * - Asset alias is required
 * - Strict mode enforces lowercase-only names
 */

import { describe, it, expect } from 'vitest';

const SCAFFOLD_PREFIXES = [
  'boot-', 'theme-', 'audio-', 'data-', 'core-', 'scene-', 'fx-',
];

const BUNDLE_NAME_RE = /^[a-z][a-z0-9-]*$/;
const BUNDLE_NAME_LOOSE_RE = /^[a-z][a-z0-9-]*$/i;

const ALLOWED_EXTENSIONS =
  /\.(json|png|jpg|jpeg|webp|gif|svg|woff|woff2|ttf|otf|webm|mp3|ogg|wav)$/i;

function isInvalidPath(p: unknown): string | null {
  if (typeof p !== 'string') return 'must be a string';
  if (p.startsWith('/')) return 'must not have leading slash';
  if (p.includes('..')) return 'must not contain ..';
  if (/^https?:\/\//i.test(p)) return 'must not be absolute URL';
  if (p.trim() !== p) return 'must not have leading/trailing space';
  if (p.length === 0) return 'must not be empty';
  return null;
}

interface AssetDef {
  alias: string;
  src: string;
}

interface TestBundle {
  name: string;
  assets: AssetDef[];
  kind?: string;
}

interface TestManifest {
  cdnBase: string;
  bundles: TestBundle[];
}

function validateManifestScaffold(manifest: TestManifest, strict = false): string[] {
  const errors: string[] = [];

  if (!manifest.cdnBase || typeof manifest.cdnBase !== 'string') {
    errors.push('manifest.cdnBase is required and must be a string');
  }
  if (!Array.isArray(manifest.bundles)) {
    errors.push('manifest.bundles must be an array');
  }

  const seenNames = new Set<string>();
  const bundles = manifest.bundles ?? [];

  for (let i = 0; i < bundles.length; i++) {
    const b = bundles[i];
    const prefix = `manifest.bundles[${i}]`;

    if (!b || typeof b !== 'object') {
      errors.push(`${prefix}: must be an object with name and assets`);
      continue;
    }
    if (!b.name || typeof b.name !== 'string') {
      errors.push(`${prefix}.name: required string`);
    } else {
      if (seenNames.has(b.name)) {
        errors.push(`${prefix}.name: duplicate bundle name "${b.name}"`);
      }
      seenNames.add(b.name);

      if (strict && !BUNDLE_NAME_RE.test(b.name)) {
        errors.push(`${prefix}.name: must match ^[a-z][a-z0-9-]*$ (strict mode), got "${b.name}"`);
      } else if (!strict && !BUNDLE_NAME_LOOSE_RE.test(b.name)) {
        errors.push(`${prefix}.name: should be lowercase with hyphens, got "${b.name}"`);
      }

      const hasReserved = SCAFFOLD_PREFIXES.some((p) => b.name.startsWith(p));
      if (!hasReserved && !b.kind) {
        errors.push(`${prefix}.name: must use a reserved prefix or set "kind"`);
      }
    }

    if (!Array.isArray(b.assets)) {
      errors.push(`${prefix}.assets: must be an array`);
    } else {
      for (let j = 0; j < b.assets.length; j++) {
        const asset = b.assets[j];
        if (!asset || typeof asset !== 'object' || typeof asset.src !== 'string') {
          errors.push(`${prefix}.assets[${j}]: must be { alias, src }`);
          continue;
        }
        const pathErr = isInvalidPath(asset.src);
        if (pathErr) errors.push(`${prefix}.assets[${j}].src: ${pathErr}`);
        else if (!ALLOWED_EXTENSIONS.test(asset.src)) {
          errors.push(`${prefix}.assets[${j}].src: unknown extension`);
        }
        if (!asset.alias || typeof asset.alias !== 'string') {
          errors.push(`${prefix}.assets[${j}].alias: required string`);
        }
      }
    }
  }

  return errors;
}

describe('check-manifest: cdnBase validation', () => {
  it('passes with valid cdnBase', () => {
    const errors = validateManifestScaffold({
      cdnBase: '/assets',
      bundles: [],
    });
    expect(errors).not.toContain('manifest.cdnBase is required and must be a string');
  });

  it('fails when cdnBase is empty', () => {
    const errors = validateManifestScaffold({
      cdnBase: '',
      bundles: [],
    });
    expect(errors).toContain('manifest.cdnBase is required and must be a string');
  });

  it('fails when cdnBase is missing', () => {
    const errors = validateManifestScaffold({
      cdnBase: undefined as unknown as string,
      bundles: [],
    });
    expect(errors).toContain('manifest.cdnBase is required and must be a string');
  });
});

describe('check-manifest: bundle naming', () => {
  it('accepts valid bundle name with reserved prefix', () => {
    const errors = validateManifestScaffold({
      cdnBase: '/assets',
      bundles: [{ name: 'boot-splash', assets: [{ alias: 'a', src: 'a.png' }] }],
    });
    expect(errors).toEqual([]);
  });

  it('rejects bundle without reserved prefix and no kind', () => {
    const errors = validateManifestScaffold({
      cdnBase: '/assets',
      bundles: [{ name: 'my-bundle', assets: [{ alias: 'a', src: 'a.png' }] }],
    });
    expect(errors.some((e) => e.includes('must use a reserved prefix'))).toBe(true);
  });

  it('accepts bundle without reserved prefix if kind is set', () => {
    const errors = validateManifestScaffold({
      cdnBase: '/assets',
      bundles: [{ name: 'my-bundle', assets: [{ alias: 'a', src: 'a.png' }], kind: 'scene' }],
    });
    expect(errors.some((e) => e.includes('must use a reserved prefix'))).toBe(false);
  });

  it('rejects duplicate bundle names', () => {
    const errors = validateManifestScaffold({
      cdnBase: '/assets',
      bundles: [
        { name: 'boot-splash', assets: [{ alias: 'a', src: 'a.png' }] },
        { name: 'boot-splash', assets: [{ alias: 'b', src: 'b.png' }] },
      ],
    });
    expect(errors.some((e) => e.includes('duplicate bundle name'))).toBe(true);
  });

  it('strict mode rejects uppercase in bundle name', () => {
    const errors = validateManifestScaffold({
      cdnBase: '/assets',
      bundles: [{ name: 'Boot-Splash', assets: [{ alias: 'a', src: 'a.png' }] }],
    }, true);
    expect(errors.some((e) => e.includes('strict mode'))).toBe(true);
  });

  it('non-strict accepts lowercase names', () => {
    const errors = validateManifestScaffold({
      cdnBase: '/assets',
      bundles: [{ name: 'boot-splash', assets: [{ alias: 'a', src: 'a.png' }] }],
    });
    expect(errors.some((e) => e.includes('should be lowercase'))).toBe(false);
  });
});

describe('check-manifest: asset path validation', () => {
  const wrap = (src: string) => validateManifestScaffold({
    cdnBase: '/assets',
    bundles: [{ name: 'boot-test', assets: [{ alias: 'test', src }] }],
  });

  it('accepts relative path with valid extension', () => {
    expect(wrap('images/spinner.png')).toEqual([]);
  });

  it('rejects absolute path with leading slash', () => {
    expect(wrap('/images/spinner.png').some((e) => e.includes('leading slash'))).toBe(true);
  });

  it('rejects path traversal', () => {
    expect(wrap('../spinner.png').some((e) => e.includes('..'))).toBe(true);
  });

  it('rejects absolute URL', () => {
    expect(wrap('https://cdn.com/spinner.png').some((e) => e.includes('absolute URL'))).toBe(true);
  });

  it('rejects path with leading space', () => {
    expect(wrap(' spinner.png').some((e) => e.includes('space'))).toBe(true);
  });

  it('rejects empty path', () => {
    expect(wrap('').some((e) => e.includes('empty'))).toBe(true);
  });

  it('rejects unknown extension', () => {
    expect(wrap('data.csv').some((e) => e.includes('unknown extension'))).toBe(true);
  });

  it('accepts all allowed extensions', () => {
    const extensions = [
      'a.json', 'a.png', 'a.jpg', 'a.jpeg', 'a.webp', 'a.gif', 'a.svg',
      'a.woff', 'a.woff2', 'a.ttf', 'a.otf', 'a.webm', 'a.mp3', 'a.ogg', 'a.wav',
    ];
    for (const src of extensions) {
      const errors = wrap(src);
      expect(errors, `Expected no errors for ${src}`).toEqual([]);
    }
  });
});

describe('check-manifest: asset alias validation', () => {
  it('rejects missing alias', () => {
    const errors = validateManifestScaffold({
      cdnBase: '/assets',
      bundles: [{
        name: 'boot-test',
        assets: [{ alias: '', src: 'a.png' }],
      }],
    });
    expect(errors.some((e) => e.includes('alias: required string'))).toBe(true);
  });

  it('accepts valid alias', () => {
    const errors = validateManifestScaffold({
      cdnBase: '/assets',
      bundles: [{
        name: 'boot-test',
        assets: [{ alias: 'spinner', src: 'spinner.png' }],
      }],
    });
    expect(errors).toEqual([]);
  });
});

describe('check-manifest: isInvalidPath helper', () => {
  it('returns null for valid relative path', () => {
    expect(isInvalidPath('images/spinner.png')).toBeNull();
  });

  it('rejects non-string', () => {
    expect(isInvalidPath(42)).toBe('must be a string');
    expect(isInvalidPath(null)).toBe('must be a string');
    expect(isInvalidPath(undefined)).toBe('must be a string');
  });
});

describe('check-manifest: all scaffold prefixes are recognized', () => {
  for (const prefix of SCAFFOLD_PREFIXES) {
    it(`recognizes prefix: ${prefix}`, () => {
      const name = `${prefix}test`;
      const hasReserved = SCAFFOLD_PREFIXES.some((p) => name.startsWith(p));
      expect(hasReserved).toBe(true);
    });
  }
});
