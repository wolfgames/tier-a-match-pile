import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: [
    'src/app.tsx',
    'src/core/index.ts',
    'src/game/index.ts',
    'scripts/*.ts',
    'tests/**/*.test.ts',
    'tests/**/*.spec.ts',
  ],
  project: ['src/**/*.{ts,tsx}'],
};

export default config;
