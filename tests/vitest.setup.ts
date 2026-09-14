/**
 * Vitest setup — runs before each test file.
 *
 * @adobe/data's `cache/blob-store` module creates a persistent cache at import
 * time via the browser CacheStorage API (`globalThis.caches`), which Node
 * lacks. Importing `@adobe/data/ecs` in a headless test would otherwise emit
 * an unhandled promise rejection. Stub a minimal in-memory CacheStorage so
 * ECS worlds can be created and driven in Node tests.
 */

if (!('caches' in globalThis)) {
  type Entry = { request: Request; response: Response };

  const createCache = () => {
    const entries: Entry[] = [];
    const keyOf = (request: Request | string) =>
      typeof request === 'string' ? request : request.url;
    return {
      async keys() {
        return entries.map((e) => e.request);
      },
      async match(request: Request | string) {
        return entries.find((e) => e.request.url === keyOf(request))?.response;
      },
      async put(request: Request, response: Response) {
        const existing = entries.findIndex((e) => e.request.url === request.url);
        if (existing !== -1) entries.splice(existing, 1);
        entries.push({ request, response });
      },
      async delete(request: Request | string) {
        const index = entries.findIndex((e) => e.request.url === keyOf(request));
        if (index === -1) return false;
        entries.splice(index, 1);
        return true;
      },
    };
  };

  const caches = new Map<string, ReturnType<typeof createCache>>();
  Object.defineProperty(globalThis, 'caches', {
    value: {
      async open(name: string) {
        let cache = caches.get(name);
        if (!cache) {
          cache = createCache();
          caches.set(name, cache);
        }
        return cache;
      },
      async has(name: string) {
        return caches.has(name);
      },
      async delete(name: string) {
        return caches.delete(name);
      },
      async keys() {
        return [...caches.keys()];
      },
    },
    configurable: true,
  });
}
