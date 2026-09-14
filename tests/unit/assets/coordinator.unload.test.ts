/**
 * AssetCoordinator unload API tests.
 *
 * Tests unloadBundle / unloadBundles behavior using mock loaders.
 * Run: bun run test:run
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAssetCoordinator } from "@wolfgames/components/core";
import type { Manifest, LoaderAdapter } from "@wolfgames/components/core";

const createMockLoader = (): LoaderAdapter => ({
  init: vi.fn(),
  loadBundle: vi.fn(async () => {}),
  get: vi.fn(() => null),
  has: vi.fn(() => false),
  unloadBundle: vi.fn(),
  dispose: vi.fn(),
});

const minimalManifest: Manifest = {
  cdnBase: "/assets",
  localBase: "/assets",
  bundles: [
    {
      name: "theme-branding",
      assets: [
        { alias: "atlas-branding-wolf", src: "atlas-branding-wolf.json" },
      ],
    },
    {
      name: "scene-foo",
      assets: [{ alias: "scene-foo", src: "scene-foo.json" }],
    },
  ],
};

describe("AssetCoordinator unload", () => {
  let coordinator: ReturnType<typeof createAssetCoordinator>;
  let domLoader: LoaderAdapter;
  let gpuLoader: LoaderAdapter;

  beforeEach(() => {
    domLoader = createMockLoader();
    gpuLoader = createMockLoader();
    coordinator = createAssetCoordinator({
      manifest: minimalManifest,
      loaders: { dom: domLoader, gpu: gpuLoader },
    });
  });

  it("has unloadBundle method", () => {
    expect(coordinator).toHaveProperty("unloadBundle");
    expect(typeof coordinator.unloadBundle).toBe("function");
  });

  it("unloadBundle delegates to the loader and updates state", async () => {
    await coordinator.loadBundle("theme-branding");
    expect(coordinator.isLoaded("theme-branding")).toBe(true);

    coordinator.unloadBundle("theme-branding");
    expect(coordinator.isLoaded("theme-branding")).toBe(false);
    expect(domLoader.unloadBundle).toHaveBeenCalledWith("theme-branding");
  });

  it("unloadBundle('unknown') is a no-op and does not throw", () => {
    expect(() => coordinator.unloadBundle("unknown")).not.toThrow();
  });

  it("unloadBundles unloads multiple bundles", async () => {
    await coordinator.loadBundle("theme-branding");
    await coordinator.loadBundle("scene-foo");

    coordinator.unloadBundles(["theme-branding", "scene-foo"]);

    expect(coordinator.isLoaded("theme-branding")).toBe(false);
    expect(coordinator.isLoaded("scene-foo")).toBe(false);
  });

  it("re-loading a previously unloaded bundle works", async () => {
    await coordinator.loadBundle("theme-branding");
    coordinator.unloadBundle("theme-branding");
    expect(coordinator.isLoaded("theme-branding")).toBe(false);

    await coordinator.loadBundle("theme-branding");
    expect(coordinator.isLoaded("theme-branding")).toBe(true);
  });
});
