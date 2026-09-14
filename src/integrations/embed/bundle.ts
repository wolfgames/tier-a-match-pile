export async function loadBundle<TConfig = unknown, TGame = unknown>(
  bundleId: string,
  baseUrl: string,
): Promise<{ config: TConfig; game: TGame }> {
  const base = baseUrl.replace(/\/$/, '');
  const [configRes, gameRes] = await Promise.all([
    fetch(`${base}/${bundleId}/config.json`),
    fetch(`${base}/${bundleId}/game.json`),
  ]);
  if (!configRes.ok) {
    throw new Error(`embed: config.json fetch failed (${configRes.status})`);
  }
  if (!gameRes.ok) {
    throw new Error(`embed: game.json fetch failed (${gameRes.status})`);
  }
  const [config, game] = await Promise.all([configRes.json(), gameRes.json()]);
  return { config: config as TConfig, game: game as TGame };
}
