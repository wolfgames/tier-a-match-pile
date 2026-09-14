import tailwindcss from '@tailwindcss/vite';
import { aminoGamePlugin } from '@wolfgames/game-dev';
import { existsSync, realpathSync } from 'fs';
import { networkInterfaces } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import solid from 'vite-plugin-solid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function qrcodePlugin(): Plugin {
  return {
    name: 'qrcode',
    apply: 'serve',
    configureServer(server) {
      // Print QR code after Vite prints its own URLs
      const origPrintUrls = server.printUrls.bind(server);
      server.printUrls = () => {
        origPrintUrls();

        const lanIp = Object.values(networkInterfaces())
          .flat()
          .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;

        if (lanIp) {
          const addr = server.httpServer?.address();
          const port = addr && typeof addr !== 'string' ? addr.port : 5173;
          const network = `http://${lanIp}:${port}`;

          import('qrcode-terminal').then((mod) => {
            const qr = mod.default ?? mod;
            console.log('\n  Scan to open on your phone:\n');
            qr.generate(network, { small: true });
            console.log();
          });
        }
      };
    },
  };
}

// -----------------------------------------------------------------------------
// @wolfgames/components consumption mode
//
// Two orthogonal vite-only toggles for local development. They never run
// `bun install` — they just retarget vite's module resolution. Default behavior
// (both unset) resolves the published package from node_modules, matching prod.
//
//   VITE_COMPONENTS_LOCAL=1   Resolve from sibling repo `../game-components/`
//                             instead of `node_modules/@wolfgames/components/`.
//                             Use when iterating on game-components in this
//                             monorepo without publishing/installing.
//
//   VITE_COMPONENTS_PATH=…    Sibling checkout to use with LOCAL=1, relative to
//                             this file (default `../game-components`). Point it
//                             at a worktree to develop against a branch.
//
//   VITE_COMPONENTS_SOURCE=1  Resolve from the raw `src/` tree instead of the
//                             compiled `dist/`. Use for HMR off `.ts` source.
//                             Without this you must rebuild game-components
//                             after each change.
//
// Combine for the fastest inner loop:
//
//   VITE_COMPONENTS_LOCAL=1 VITE_COMPONENTS_SOURCE=1 bun run dev
//
// These flags are read from .env / .env.local (gitignored). They are also
// ignored during production builds so they cannot accidentally ship — see the
// guard below. To make them sticky per-developer without committing anything,
// drop into `.env.local`:
//
//   VITE_COMPONENTS_LOCAL=1
//   VITE_COMPONENTS_SOURCE=1
// -----------------------------------------------------------------------------

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, __dirname, 'VITE_');
  const isBuild = command === 'build';

  // Safety: refuse local/source overrides for any `vite build` (production OR
  // QA OR any other mode). Only `vite` / `vite dev` honors them. CI never has
  // .env.local but a developer running `bun run build` locally could otherwise
  // ship a bundle pointing at sibling source. This guard makes the failure
  // mode loud instead of silent.
  const requestedLocal = env.VITE_COMPONENTS_LOCAL === '1';
  const requestedSource = env.VITE_COMPONENTS_SOURCE === '1';
  if (isBuild && (requestedLocal || requestedSource)) {
    console.warn(
      `[vite] Ignoring VITE_COMPONENTS_LOCAL/SOURCE in build (mode=${mode}) — ` +
        'using published @wolfgames/components from node_modules.',
    );
  }
  const useLocal = requestedLocal && !isBuild;
  const useSource = requestedSource && !isBuild;

  const componentsBase = useLocal
    ? path.resolve(__dirname, env.VITE_COMPONENTS_PATH || '../game-components')
    : path.resolve(__dirname, 'node_modules/@wolfgames/components');
  const componentsRoot = path.join(componentsBase, useSource ? 'src' : 'dist');
  const shouldAliasComponents = useLocal || useSource;

  if (shouldAliasComponents) {
    console.log(
      `[vite] @wolfgames/components → ${useLocal ? 'local' : 'registry'} / ${useSource ? 'src' : 'dist'} (${componentsRoot})`,
    );
  }

  return {
    plugins: [solid(), tailwindcss(), qrcodePlugin(), aminoGamePlugin()],
    resolve: {
      alias: [
        // Retarget package resolution so dev iterations don't need bun install.
        // Without an override, vite uses node module resolution + package.json
        // exports (the published dist on the registry).
        ...(shouldAliasComponents
          ? [
              // modules-src/* is a package-exports alias for src/modules/* — proxy assets
              // live in src/, not dist/, so this must always point at the source tree.
              {
                find: /^@wolfgames\/components\/modules-src\/(.*)$/,
                replacement: path.join(componentsBase, 'src/modules/$1'),
              },
              {
                find: /^@wolfgames\/components\/(.*)$/,
                replacement: path.join(componentsRoot, '$1'),
              },
            ]
          : []),
        // Internal cross-module refs inside components' source files use
        // `~/modules/*`. In source mode, reroute that prefix to the components
        // tree (not amino's src/).
        ...(useSource
          ? [
              {
                find: /^~\/modules\//,
                replacement: path.join(componentsBase, 'src/modules/'),
              },
            ]
          : []),
        { find: '~', replacement: path.resolve(__dirname, 'src') },
      ],
      // One pixi/gsap instance even when components resolves to a sibling
      // checkout with its own node_modules — two copies means two tickers and
      // instanceof mismatches across the package boundary. Same fix the
      // component-workshop uses.
      dedupe: ['pixi.js', 'gsap'],
    },
    optimizeDeps: {
      exclude: ['@wolfgames/components'],
      include: ['howler', 'eventemitter3', 'parse-svg-path', '@xmldom/xmldom'],
    },
    define: {
      'process.env': {},
    },
    server: {
      host: true,
      // Allow Cloudflare quick-tunnel hosts so the WKWebView test harness can
      // load the dev server over https (a secure context). The leading dot
      // matches any *.trycloudflare.com subdomain. Vite rejects unrecognised
      // Host headers by default, so without this a tunnel URL serves a
      // "Blocked request" page instead of the game. Matches PE and LO:CH.
      allowedHosts: ['.trycloudflare.com'],
      // In local mode, vite needs explicit permission to read from outside
      // the project root (the sibling repo). Real path resolution covers
      // cases where node_modules/@wolfgames/components is a symlink.
      ...(useLocal && {
        fs: {
          allow: [
            path.resolve(__dirname),
            componentsBase,
            existsSync(componentsBase)
              ? realpathSync(componentsBase)
              : componentsBase,
          ],
        },
      }),
    },
    build: {
      // Top-level await (e.g. game analytics init) requires ES2022+
      target: 'es2022',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/gsap/')) return 'gsap';
            if (id.includes('node_modules/howler/')) return 'audio';
            if (id.includes('node_modules/earcut/')) return 'vendor';
            if (id.includes('node_modules/eventemitter3/')) return 'vendor';
            if (id.includes('node_modules/tiny-lru/')) return 'vendor';
            if (id.includes('node_modules/parse-svg-path/')) return 'vendor';
            if (id.includes('node_modules/@pixi/colord/')) return 'vendor';
          },
        },
      },
    },
  };
});
