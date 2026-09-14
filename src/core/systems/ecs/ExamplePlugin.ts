/**
 * Example ECS plugin — canonical patterns for @adobe/data.
 *
 * Copy this file when creating a new game plugin. Shows:
 * - Namespace schemas (Vec2, F32) for numeric components
 * - Inline schemas for strings/booleans
 * - Resources with `as Type` for compile-time typing
 * - Archetypes grouping related components
 * - Transactions for atomic mutations
 * - Systems for per-frame or init-only logic
 * - spriteKey component for Inspector display names
 */
import { Database } from '@adobe/data/ecs';
import { Vec2, F32 } from '@adobe/data/math';

// ── Plugin definition ───────────────────────────────────────────────

export const examplePlugin = Database.Plugin.create({
  components: {
    // Namespace schemas — use for numeric values (linear memory layout)
    position: Vec2.schema,
    alpha: F32.schema,
    scale: F32.schema,
    hp: F32.schema,
    maxHp: F32.schema,
    hoverScale: F32.schema,
    pressScale: F32.schema,
    score: F32.schema,
    combo: F32.schema,
    tweenDuration: F32.schema,

    // Inline schemas — use for strings and booleans
    spriteKey: { type: 'string', default: '' } as const,
    visible: { type: 'boolean', default: true } as const,
    interactive: { type: 'boolean', default: true } as const,
    tweenPlaying: { type: 'boolean', default: false } as const,
  },
  resources: {
    gameName: { default: 'example' as string },
    paused: { default: false as boolean },
  },
  archetypes: {
    SpriteButton: ['position', 'spriteKey', 'visible', 'scale', 'interactive', 'hoverScale', 'pressScale'],
    ScorePopup: ['position', 'spriteKey', 'visible', 'alpha', 'score', 'combo', 'tweenPlaying', 'tweenDuration'],
    HealthBar: ['position', 'hp', 'maxHp', 'spriteKey', 'visible'],
    Hotspot: ['position', 'spriteKey', 'visible', 'alpha', 'interactive', 'hoverScale'],
  },
  transactions: {
    spawnButton(store, args: { position: [number, number]; key: string }) {
      store.archetypes.SpriteButton.insert({
        position: args.position,
        spriteKey: args.key,
        visible: true,
        scale: 1,
        interactive: true,
        hoverScale: 1.15,
        pressScale: 0.9,
      });
    },
    spawnScorePopup(store, args: { position: [number, number]; score: number; combo: number }) {
      store.archetypes.ScorePopup.insert({
        position: args.position,
        spriteKey: 'score-popup',
        visible: true,
        alpha: 0.9,
        score: args.score,
        combo: args.combo,
        tweenPlaying: false,
        tweenDuration: 0.4,
      });
    },
    spawnHealthBar(store, args: { position: [number, number]; hp: number; max: number }) {
      store.archetypes.HealthBar.insert({
        position: args.position,
        hp: args.hp,
        maxHp: args.max,
        spriteKey: 'health-bar',
        visible: true,
      });
    },
    spawnHotspot(store, args: { position: [number, number]; key: string }) {
      store.archetypes.Hotspot.insert({
        position: args.position,
        spriteKey: args.key,
        visible: true,
        alpha: 0.8,
        interactive: true,
        hoverScale: 1.2,
      });
    },
    updateHealth(store, args: { entity: number; hp: number }) {
      store.update(args.entity, { hp: args.hp });
    },
    togglePause(store) {
      store.resources.paused = !store.resources.paused;
    },
  },
  systems: {
    example_plugin_initialize: {
      create: (db) => {
        // Init-only system — populate example entities
        db.store.archetypes.SpriteButton.insert({
          position: [160, 400],
          spriteKey: 'btn-play',
          visible: true,
          scale: 1,
          interactive: true,
          hoverScale: 1.15,
          pressScale: 0.9,
        });
        db.store.archetypes.ScorePopup.insert({
          position: [160, 60],
          spriteKey: 'score-popup',
          visible: true,
          alpha: 0.9,
          score: 1250,
          combo: 3,
          tweenPlaying: false,
          tweenDuration: 0.4,
        });
        db.store.archetypes.HealthBar.insert({
          position: [20, 20],
          hp: 75,
          maxHp: 100,
          spriteKey: 'health-bar',
          visible: true,
        });
        for (let i = 0; i < 4; i++) {
          db.store.archetypes.Hotspot.insert({
            position: [50 + i * 80, 200 + (i % 2) * 40],
            spriteKey: `hotspot-${i}`,
            visible: true,
            alpha: 0.8,
            interactive: true,
            hoverScale: 1.2,
          });
        }
      },
    },
  },
});

export type ExampleDatabase = Database.FromPlugin<typeof examplePlugin>;

// ── Factory ─────────────────────────────────────────────────────────

export function createExampleWorld(): ExampleDatabase {
  return Database.create(examplePlugin);
}
