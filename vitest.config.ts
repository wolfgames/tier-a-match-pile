import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
    // Stubs the browser CacheStorage API that @adobe/data expects at import
    // time — required for headless ECS tests in Node.
    setupFiles: ["tests/vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "src"),
      // The "node" condition resolves solid-js to its non-reactive server build.
      "solid-js": path.resolve(
        __dirname,
        "node_modules/solid-js/dist/solid.js"
      ),
    },
  },
});
