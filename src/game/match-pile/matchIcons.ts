// what_in: a Match Pile object typeId (generator/objectTypes.ts#OBJECT_TYPE_POOL) + a target size.
// what_out: `matchIdentityFor` — a stable {shape, color} pair per typeId, deterministic from
//           the pool's own fixed index (never randomised, never re-picked between renders).
//           `drawMatchIcon` — draws that shape as a fresh Graphics. The ONE mapping the board,
//           Orders cards, and Slots Row all read from, so the same logical item always looks
//           identical everywhere it appears.
// why_here: replaces the food-themed icon set (board/tileIcons.ts, deleted) — no McDonald's/food
//           visual language remains in active gameplay presentation. typeIds themselves
//           (`fries`, `big-mac`, ...) are UNCHANGED — they're opaque content-layer keys the
//           generator/solver/committed level seeds already depend on (rules/solver/generator are
//           explicitly out of scope for this pass); only what they're DRAWN as changes here.
//
// READABILITY RULE: every one of the 24 typeIds gets a shape AND a colour that no other typeId
// uses. Two attributes shared (same shape, different colour — or vice versa) reads to a player as
// "these might be related" even when the underlying groups are unrelated; that false-pattern
// signal was exactly the reported bug (a grey cross and a yellow cross looked like they belonged
// together because only the colour differed). Making both attributes unique per group means no
// two icons can ever share more than an incidental family resemblance. This intentionally goes
// beyond the 4-key brand palette (`palette.ts`) — those tokens are tenant-configurable and can
// collapse into duplicates (a tenant's `accent` may equal its `primary`), which is unsafe for a
// signal players rely on to tell items apart. `MATCH_IDENTITY_COLORS` below is a fixed, non-themed
// set of 24 literal hexes reserved for this one purpose, same precedent as `board/chrome.ts`'s
// `TIMER_COLOR` and this file's own former `ICON_SECONDARY_OVERRIDE`: a deliberately scoped
// literal instead of a `palette.ts` token.
import { Graphics } from 'pixi.js';
import { OBJECT_TYPE_POOL } from './generator/objectTypes';

export type MatchShape =
  | 'circle'
  | 'diamond'
  | 'triangle'
  | 'star'
  | 'hexagon'
  | 'cross'
  | 'square'
  | 'roundedSquare'
  | 'triangleDown'
  | 'pentagon'
  | 'heptagon'
  | 'octagon'
  | 'star6'
  | 'star4'
  | 'xCross'
  | 'arrowUp'
  | 'arrowDown'
  | 'arrowLeft'
  | 'arrowRight'
  | 'trapezoid'
  | 'parallelogram'
  | 'hourglass'
  | 'semicircle'
  | 'pieSlice';

export interface MatchIdentity {
  shape: MatchShape;
  color: number;
}

/** One shape and one colour per pool entry, paired 1:1 by index — 24 shapes for 24 colours for
 * 24 typeIds, so no shape repeats across groups and no colour repeats across groups. Index-derived
 * (not random), so it's stable across renders and across sessions. Growing `OBJECT_TYPE_POOL`
 * past 24 entries requires adding matching entries to BOTH arrays below, in step, or the new
 * entries silently fall off the end. */
const SHAPES: readonly MatchShape[] = [
  'circle',
  'diamond',
  'triangle',
  'star',
  'hexagon',
  'cross',
  'square',
  'roundedSquare',
  'triangleDown',
  'pentagon',
  'heptagon',
  'octagon',
  'star6',
  'star4',
  'xCross',
  'arrowUp',
  'arrowDown',
  'arrowLeft',
  'arrowRight',
  'trapezoid',
  'parallelogram',
  'hourglass',
  'semicircle',
  'pieSlice',
];

/** Fixed, non-themed identity colours — see the READABILITY RULE note above for why these live
 * here instead of `palette.ts`. Sourced from Kelly's 22-colours-of-maximum-contrast set (Kenneth
 * Kelly, 1965, US National Bureau of Standards — a published palette designed specifically so no
 * two entries are mistakable for each other), extended with 4 more well-separated hues to cover
 * all 24 pool entries. All 24 values are distinct. */
const MATCH_IDENTITY_COLORS: readonly number[] = [
  0xffb300, // vivid yellow
  0x803e75, // strong purple
  0xff6800, // vivid orange
  0x2f6fb3, // steel blue
  0xc10020, // vivid red
  0xcea262, // grayish yellow
  0x817066, // medium gray
  0x007d34, // vivid green
  0xf6768e, // strong purplish pink
  0x00538a, // strong blue
  0xff7a5c, // strong yellowish pink
  0x53377a, // strong violet
  0xff8e00, // vivid orange yellow
  0xb32851, // strong purplish red
  0xf4c800, // vivid greenish yellow
  0x7f180d, // strong reddish brown
  0x93aa00, // vivid yellowish green
  0x593315, // deep yellowish brown
  0xf13a13, // vivid reddish orange
  0x232c16, // dark olive green
  0x00bfff, // deep sky blue
  0xff1493, // deep pink
  0x008080, // teal
  0x7fff00, // chartreuse
];

const IDENTITY_BY_TYPE = new Map<string, MatchIdentity>(
  OBJECT_TYPE_POOL.map((typeId, i) => [typeId, { shape: SHAPES[i], color: MATCH_IDENTITY_COLORS[i] }]),
);
/** Only reached for a typeId outside `OBJECT_TYPE_POOL` (never expected in practice — the pool is
 * exhaustive). Colour deliberately isn't one of the 24 real identity colours above, so a bug that
 * ever hits this path is visually obvious rather than silently impersonating a real group. */
const FALLBACK: MatchIdentity = { shape: 'circle', color: 0x808080 };

/** Deterministic identity for `typeId`. Falls back to a plain grey circle for any id outside the
 * pool (keeps this total rather than throwing on future pool entries). */
export function matchIdentityFor(typeId: string): MatchIdentity {
  return IDENTITY_BY_TYPE.get(typeId) ?? FALLBACK;
}

/** Regular n-gon vertices, flat point at `rotate` (default: pointing straight up). */
function regularPolygonPoints(sides: number, r: number, rotate = -Math.PI / 2): number[] {
  const pts: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotate + (i * 2 * Math.PI) / sides;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return pts;
}

/** `points`-pointed star (alternating outer/inner radius), `points * 2` vertices. */
function starPointsN(points: number, outerR: number, innerR: number, rotate = -Math.PI / 2): number[] {
  const pts: number[] = [];
  const total = points * 2;
  for (let i = 0; i < total; i++) {
    const rad = i % 2 === 0 ? outerR : innerR;
    const a = rotate + (i * Math.PI) / points;
    pts.push(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  return pts;
}

/** 12-point plus-sign polygon, optionally rotated (used for both `cross` and `xCross`). */
function crossPolyPoints(r: number, armRatio: number, rotate: number): number[] {
  const arm = r * armRatio;
  const half = arm / 2;
  const base = [
    -half, -r, half, -r, half, -half,
    r, -half, r, half, half, half,
    half, r, -half, r, -half, half,
    -r, half, -r, -half, -half, -half,
  ];
  if (rotate === 0) return base;
  const cos = Math.cos(rotate);
  const sin = Math.sin(rotate);
  const out: number[] = [];
  for (let i = 0; i < base.length; i += 2) {
    const x = base[i];
    const y = base[i + 1];
    out.push(x * cos - y * sin, x * sin + y * cos);
  }
  return out;
}

/** Flat-top half-circle: an arc from angle 0 to PI closed by `poly`'s implicit final edge. */
function semicirclePoints(r: number, segments = 16): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return pts;
}

/** Pie wedge from `startAngle` to `endAngle`, apex at the origin. */
function pieSlicePoints(r: number, startAngle: number, endAngle: number, segments = 12): number[] {
  const pts: number[] = [0, 0];
  for (let i = 0; i <= segments; i++) {
    const a = startAngle + (i / segments) * (endAngle - startAngle);
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return pts;
}

/** Draws `shape` centred at (0,0) inside a `size`×`size` box, filled solid in `colorHex`. Callers
 * position/scale the returned Graphics like any other display object. */
export function drawMatchIcon(shape: MatchShape, size: number, colorHex: number): Graphics {
  const g = new Graphics();
  const r = size * 0.42;
  switch (shape) {
    case 'circle':
      g.circle(0, 0, r).fill(colorHex);
      break;
    case 'diamond':
      g.poly([0, -r, r, 0, 0, r, -r, 0]).fill(colorHex);
      break;
    case 'triangle':
      g.poly([0, -r, r * 0.87, r * 0.6, -r * 0.87, r * 0.6]).fill(colorHex);
      break;
    case 'triangleDown':
      g.poly([0, r, r * 0.87, -r * 0.6, -r * 0.87, -r * 0.6]).fill(colorHex);
      break;
    case 'star':
      g.poly(starPointsN(5, r, r * 0.42)).fill(colorHex);
      break;
    case 'star6':
      g.poly(starPointsN(6, r, r * 0.6)).fill(colorHex);
      break;
    case 'star4':
      g.poly(starPointsN(4, r * 1.05, r * 0.35)).fill(colorHex);
      break;
    case 'hexagon':
      g.poly(regularPolygonPoints(6, r)).fill(colorHex);
      break;
    case 'pentagon':
      g.poly(regularPolygonPoints(5, r)).fill(colorHex);
      break;
    case 'heptagon':
      g.poly(regularPolygonPoints(7, r)).fill(colorHex);
      break;
    case 'octagon':
      g.poly(regularPolygonPoints(8, r)).fill(colorHex);
      break;
    case 'square':
      g.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6).fill(colorHex);
      break;
    case 'roundedSquare':
      g.roundRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6, r * 0.35).fill(colorHex);
      break;
    case 'cross': {
      const arm = r * 0.62;
      g.roundRect(-arm / 2, -r, arm, r * 2, arm * 0.25).fill(colorHex);
      g.roundRect(-r, -arm / 2, r * 2, arm, arm * 0.25).fill(colorHex);
      break;
    }
    case 'xCross':
      g.poly(crossPolyPoints(r, 0.55, Math.PI / 4)).fill(colorHex);
      break;
    case 'arrowUp':
      g.poly([-r * 0.35, r * 0.9, -r * 0.35, -r * 0.15, -r * 0.7, -r * 0.15, 0, -r * 0.95, r * 0.7, -r * 0.15, r * 0.35, -r * 0.15, r * 0.35, r * 0.9]).fill(colorHex);
      break;
    case 'arrowDown':
      g.poly([-r * 0.35, -r * 0.9, -r * 0.35, r * 0.15, -r * 0.7, r * 0.15, 0, r * 0.95, r * 0.7, r * 0.15, r * 0.35, r * 0.15, r * 0.35, -r * 0.9]).fill(colorHex);
      break;
    case 'arrowLeft':
      g.poly([r * 0.9, -r * 0.35, -r * 0.15, -r * 0.35, -r * 0.15, -r * 0.7, -r * 0.95, 0, -r * 0.15, r * 0.7, -r * 0.15, r * 0.35, r * 0.9, r * 0.35]).fill(colorHex);
      break;
    case 'arrowRight':
      g.poly([-r * 0.9, -r * 0.35, r * 0.15, -r * 0.35, r * 0.15, -r * 0.7, r * 0.95, 0, r * 0.15, r * 0.7, r * 0.15, r * 0.35, -r * 0.9, r * 0.35]).fill(colorHex);
      break;
    case 'trapezoid':
      g.poly([-r * 0.45, -r * 0.6, r * 0.45, -r * 0.6, r * 0.85, r * 0.6, -r * 0.85, r * 0.6]).fill(colorHex);
      break;
    case 'parallelogram':
      g.poly([-r * 0.3, -r * 0.65, r * 0.85, -r * 0.65, r * 0.3, r * 0.65, -r * 0.85, r * 0.65]).fill(colorHex);
      break;
    case 'hourglass':
      g.poly([-r * 0.8, -r, r * 0.8, -r, 0, 0]).fill(colorHex);
      g.poly([-r * 0.8, r, r * 0.8, r, 0, 0]).fill(colorHex);
      break;
    case 'semicircle':
      g.poly(semicirclePoints(r)).fill(colorHex);
      break;
    case 'pieSlice':
      g.poly(pieSlicePoints(r, -Math.PI / 2, 0)).fill(colorHex);
      break;
  }
  return g;
}

/** Convenience: identity lookup + draw in one call. Colour is now always one of the 24 fixed
 * `MATCH_IDENTITY_COLORS` (never theme-resolved — see the READABILITY RULE note up top), so unlike
 * the old palette-driven version this never needs a live palette to draw correctly.
 *
 * This is called from inside `board/tiles.ts#buildTile`, which runs synchronously inside
 * `BoardRenderer.sync()` — itself called synchronously the instant `BoardRenderer`'s constructor
 * subscribes to `db.observe.resources.pile` (that primitive replays the current value immediately
 * on subscribe). Anything this throws unwinds straight out of `new BoardRenderer(...)` in
 * gameController.ts's `init()`, aborting every line after it — `fx = new Fx(...)`, the ticker,
 * the `pile` repaint subscription, and the initial `repaint()` call, none of which would ever
 * run. That would silently take the whole screen down (chrome already painted looks fine, but
 * nothing driven by `repaint()` — Level/Score/Instruction/Orders/Slots — or by the ticker
 * — Timer counting down, win detection — would ever update again). A try/catch here is cheap
 * insurance against exactly that failure mode: this function has ONE job (draw a shape), so if it
 * ever can't, degrading to a plain circle beats silently breaking the whole controller. */
export function drawMatchIconFor(typeId: string, size: number): Graphics {
  const identity = matchIdentityFor(typeId);
  try {
    return drawMatchIcon(identity.shape, size, identity.color);
  } catch {
    return new Graphics().circle(0, 0, size * 0.3).fill(identity.color);
  }
}
