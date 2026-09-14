/**
 * In-game settings — the catalog `settings-menu` (gear, scrim, panel, dismiss
 * behaviour) with this game's theme and callbacks.
 *
 * Catalog check: `prefabs/settings-menu` is the whole menu, composing
 * `prefabs/options-menu` inside it. This file only narrows the scaffold's audio
 * dependency and names the items.
 */

import type { Container } from 'pixi.js';
import { SettingsMenu } from '@wolfgames/components/modules/prefabs/settings-menu';
import type { PixiLoader } from '~/core/systems/assets';
import { SETTINGS_THEME } from '~/game/settingsTheme';

/** The slice of the scaffold audio context the panel drives. */
interface AudioControls {
  volume: () => number;
  setVolume: (volume: number) => void;
  musicEnabled: () => boolean;
  toggleMusic: () => void;
}

/** `GameControllerDeps.audio` is `unknown` — narrow it before wiring rows. */
function asAudioControls(candidate: unknown): AudioControls | null {
  const audio = candidate as Partial<AudioControls> | null | undefined;
  return audio &&
    typeof audio.volume === 'function' &&
    typeof audio.setVolume === 'function' &&
    typeof audio.musicEnabled === 'function' &&
    typeof audio.toggleMusic === 'function'
    ? (audio as AudioControls)
    : null;
}

export interface SettingsOverlayOptions {
  /** Design-space container the menu mounts into (above the game layers). */
  layer: Container;
  loader: PixiLoader;
  designWidth: number;
  designHeight: number;
  /** `GameControllerDeps.audio`, narrowed internally; rows drop out if absent. */
  audio: unknown;
  onRestart: () => void;
  onHome: () => void;
  /** Fired on open/close so the controller can freeze/resume the sim. */
  onOpenChange: (open: boolean) => void;
}

export interface SettingsOverlayHandle {
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
  destroy: () => void;
}

export function createSettingsOverlay(opts: SettingsOverlayOptions): SettingsOverlayHandle {
  const audio = asAudioControls(opts.audio);

  const menu = new SettingsMenu(opts.loader, {
    title: 'SETTINGS',
    atlasName: 'core-settings',
    buttonSpriteName: 'btn-blue',
    closeSpriteName: 'close-round-red',
    gearSpriteName: 'icon-gear',
    gearPosition: { x: opts.designWidth - 48, y: 44 },
    screenWidth: opts.designWidth,
    screenHeight: opts.designHeight,
    closeOnItemClick: true,
    onOpenChange: opts.onOpenChange,
    /* Labelled rows, not the house icon bar: this menu carries actions
       ("Restart Level") whose names don't survive a 44px square. Everything
       else stays on the component defaults. */
    layout: 'stack',
    ...SETTINGS_THEME,
    items: [
      ...(audio
        ? [
            {
              type: 'slider' as const,
              label: 'Sounds',
              icon: 'icon-sound',
              value: audio.volume(),
              min: 0,
              max: 1,
              step: 0.05,
              onChange: (value: number) => audio.setVolume(value),
            },
            {
              type: 'toggle' as const,
              label: 'Music',
              icon: 'icon-music',
              value: audio.musicEnabled(),
              onChange: () => audio.toggleMusic(),
            },
          ]
        : []),
      { type: 'button' as const, label: 'Restart Level', onClick: opts.onRestart },
      {
        type: 'button' as const,
        label: 'Return Home',
        // The one row that leaves the game — red, so it never reads as "resume".
        spriteName: 'btn-red',
        onClick: opts.onHome,
      },
    ],
  });
  opts.layer.addChild(menu);

  return {
    open: () => menu.open(),
    close: () => menu.close(),
    isOpen: () => menu.isOpen(),
    destroy: () => menu.destroy(),
  };
}
