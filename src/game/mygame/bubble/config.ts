/**
 * config — shared, framework-free constants for the bubble shooter.
 *
 * Pure module: no Pixi, no DOM. Imported by the ECS sim (deterministic rules)
 * AND by the Pixi renderer, so both agree on the design box, ball geometry, and
 * collision distances. Colours are the ONLY render-facing values here (the sim
 * only ever deals in a colour *index*), kept in one place so a future art pass
 * can map each index to a real sprite alias.
 */

/** Fixed design box; the renderer scales this to fit ("contain"). */
export const DESIGN_W = 1000;
export const DESIGN_H = 750;

/** Spiral centre — the cannon sits here; the path's inner end (the door) is nearby. */
export const CENTER: readonly [number, number] = [DESIGN_W / 2, DESIGN_H / 2];

/** Ball geometry (design px). Spacing = diameter → touching beads. */
export const BALL_RADIUS = 20;
export const BALL_SPACING = BALL_RADIUS * 2;

/** A shot ball flies at this speed (design px / sec). */
export const PROJECTILE_SPEED = 900;

/**
 * A projectile inserts into the chain once its centre comes within this of a
 * chain ball's centre. Slightly over one diameter so it snaps in just before
 * visual overlap.
 */
export const INSERT_DIST = BALL_SPACING * 1.05;

/** A run of this many same-coloured balls (or more) pops. */
export const MATCH_MIN = 3;

/** Score awarded per popped ball. */
export const POINTS_PER_BALL = 10;

/**
 * Colour palette — index → placeholder tint. The sim stores a colour *index*
 * on each ball; the renderer maps it here. ART TODO: replace these flat tints
 * with generated bubble sprites (one alias per index) — see asset-pipeline rule.
 */
export const COLORS: readonly number[] = [
  0xe4514a, // red
  0x4a8fe4, // blue
  0x54c06a, // green
  0xf0c04a, // yellow
  0xb46ad0, // purple
];

/** How many colours exist at most. Levels use a prefix of the palette. */
export const MAX_COLORS = COLORS.length;
