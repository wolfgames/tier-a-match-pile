// what_in: a live theme getter + the real audio controls (volume/setVolume/musicEnabled/
//          toggleMusic — StartScreenDeps.audio, sourced from the same useAudio() the DOM settings
//          menu uses everywhere else) + a theme-toggle callback.
// what_out: `buildSettingsPanel` — a small Pixi popover with Music/Sound/Dark Mode toggle rows,
//           fully vector-drawn (no DOM, no raster icons).
// why_here: the start screen's settings control must be 100% Pixi (no DOM settings menu on this
//           screen at all, hidden or visible) — this is that screen's own settings surface,
//           acting on the SAME real audio state rather than a second, disconnected copy of it.
//
// DARK-MODE pass: `palette` (a snapshot) replaced with `getTheme: () => ThemeName` so `render()`
// recomputes `paletteHexFor(getTheme())` fresh every call. The Dark Mode row's own toggle does
// NOT call `render()` after `onToggleTheme()` (unlike Music/Sound, which do, for instant
// self-contained feedback) — flipping the theme resource synchronously triggers whichever
// screen owns this popover to redraw (startViewScene.ts's theme-observer repaint rebuilds this
// popover from scratch as part of its own full-scene repaint; gameController.ts explicitly
// re-opens it — see its theme-change handler). Calling `render()` here too, on top of that,
// would risk operating on an already-destroyed `container` for the cover-screen caller, whose
// repaint may destroy this exact popover synchronously before `render()` runs.
import { Container, Graphics, Text } from 'pixi.js';
import { paint, shape, shadowOf } from './inspector';
import { drawSoftShadow } from './surface';
import { FONTS } from './typography';
import { paletteHexFor, type ThemeName } from './palette';

export interface SettingsPanelAudio {
  volume: () => number;
  setVolume: (v: number) => void;
  musicEnabled: () => boolean;
  toggleMusic: () => void;
}

export interface SettingsPanelHandle {
  container: Container;
}

const ROW_H = 46;
const PANEL_W = 208;
const PADDING = 14;
const TRACK_W = 40;
const TRACK_H = 22;

function drawToggle(parent: Container, x: number, y: number, on: boolean, onHex: number, offHex: number): void {
  const track = new Graphics().roundRect(0, 0, TRACK_W, TRACK_H, TRACK_H / 2).fill(on ? onHex : offHex);
  track.position.set(x, y);
  parent.addChild(track);
  const knobR = TRACK_H / 2 - 2;
  const knob = new Graphics().circle(0, 0, knobR).fill(0xffffff);
  knob.position.set(x + (on ? TRACK_W - TRACK_H / 2 : TRACK_H / 2), y + TRACK_H / 2);
  parent.addChild(knob);
}

/** Builds (and rebuilds, on every Music/Sound toggle) the whole popover in one call — same
 * "destroy children, redraw" pattern every other stateful drawer in this game uses (ctaButton.ts,
 * chrome.ts). `onButtonTap` (optional, SFX pass) fires once per row tap, alongside every other
 * standard UI control's tap sound — this popover has no access to the game's audio manager itself. */
export function buildSettingsPanel(
  getTheme: () => ThemeName,
  audio: SettingsPanelAudio,
  onToggleTheme: () => void,
  onButtonTap?: () => void,
): SettingsPanelHandle {
  const container = new Container();
  container.label = 'panel-settings';

  const render = () => {
    const palette = paletteHexFor(getTheme());
    container.removeChildren().forEach((c) => c.destroy());
    const panelH = PADDING * 2 + ROW_H * 3;
    drawSoftShadow(container, PANEL_W, panelH, 18, 0, 6, 12, 0.18, palette.text);
    container.addChild(new Graphics().roundRect(0, 0, PANEL_W, panelH, 18).fill(palette.panel));
    paint(container, `#${palette.panel.toString(16).padStart(6, '0')}`);
    shape(container, 18);
    shadowOf(container, 'soft-push');

    const rows: Array<{ label: string; on: boolean; toggle: () => void }> = [
      { label: 'Music', on: audio.musicEnabled(), toggle: () => { onButtonTap?.(); audio.toggleMusic(); render(); } },
      { label: 'Sound', on: audio.volume() > 0, toggle: () => { onButtonTap?.(); audio.setVolume(audio.volume() > 0 ? 0 : 0.7); render(); } },
      // No `render()` call here — see the file header note. The theme change itself is what
      // redraws this popover (via whichever mechanism the caller uses), not a local re-render.
      { label: 'Dark Mode', on: getTheme() === 'dark', toggle: () => { onButtonTap?.(); onToggleTheme(); } },
    ];

    rows.forEach((row, i) => {
      const y = PADDING + i * ROW_H;
      // Invisible full-row hit target — a real tap target ≥44px tall, not just the small toggle
      // knob (guardrail: tap targets ≥ 44px).
      const hit = new Graphics().rect(0, y, PANEL_W, ROW_H).fill({ color: 0, alpha: 0.001 });
      hit.label = `row-settings-${row.label.toLowerCase().replace(/\s+/g, '-')}`;
      hit.eventMode = 'static';
      hit.on('pointertap', row.toggle);
      container.addChild(hit);

      const label = new Text({ text: row.label, style: { fontFamily: FONTS.body, fontSize: 15, fill: palette.text, fontWeight: '600' } });
      label.label = `text-settings-${row.label.toLowerCase().replace(/\s+/g, '-')}`;
      label.anchor.set(0, 0.5);
      label.position.set(PADDING, y + ROW_H / 2);
      container.addChild(label);

      drawToggle(container, PANEL_W - PADDING - TRACK_W, y + ROW_H / 2 - TRACK_H / 2, row.on, palette.accent, palette.base);
    });
  };

  render();
  return { container };
}
