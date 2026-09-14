import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: [
    'src/app.tsx',
    'src/core/index.ts',
    'src/game/index.ts',
    // Template starter surface — exported API the next game builds on, not dead code.
    'src/game/mygame/ecs/gamePlugin.ts',
    'src/game/mygame/ecs/readStateFromEcs.ts',
    'src/game/mygame/ecs/agentPlugin.ts',
    'scripts/*.ts',
    'tests/**/*.test.ts',
    'tests/**/*.spec.ts',
  ],
  project: ['src/**/*.{ts,tsx}'],
};

export default config;
