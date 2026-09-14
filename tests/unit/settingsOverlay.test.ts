import { describe, it, expect, vi } from 'vitest';
import { Container, Text, Texture } from 'pixi.js';
import type { PixiLoader } from '~/core/systems/assets';
import { createSettingsOverlay } from '~/game/mygame/screens/settingsOverlay';

/**
 * The gear, scrim, and dismiss behaviour belong to the catalog `settings-menu`
 * and are covered there. What is this game's own is the wiring: which rows
 * exist, where their callbacks go, and that the audio dependency is narrowed
 * before it is used.
 */
const loader = { getTexture: () => Texture.WHITE } as unknown as PixiLoader;

function makeAudio() {
  return {
    volume: () => 0.5,
    setVolume: vi.fn(),
    musicEnabled: () => true,
    toggleMusic: vi.fn(),
  };
}

function build(overrides: Partial<Parameters<typeof createSettingsOverlay>[0]> = {}) {
  const layer = new Container();
  const audio = makeAudio();
  const onRestart = vi.fn();
  const onHome = vi.fn();
  const onOpenChange = vi.fn();
  const overlay = createSettingsOverlay({
    layer,
    loader,
    designWidth: 1000,
    designHeight: 750,
    audio,
    onRestart,
    onHome,
    onOpenChange,
    ...overrides,
  });
  return { overlay, layer, audio, onRestart, onHome, onOpenChange };
}

const find = (root: Container, label: string): Container | undefined =>
  root.children.find((c): c is Container => c.label === label);

const menuOf = (layer: Container): Container => {
  const menu = find(layer, 'settings-menu');
  if (!menu) throw new Error('settings menu not mounted');
  return menu;
};

const rowOf = (layer: Container, label: string): Container => {
  const items = find(find(menuOf(layer), 'options-menu') as Container, 'items');
  const row = items && find(items, `item-${label}`);
  if (!row) throw new Error(`no row ${label}`);
  return row;
};

describe('game settings wiring', () => {
  it('mounts the catalog menu with its own gear', () => {
    const { layer } = build();
    expect(find(menuOf(layer), 'settings-gear')).toBeDefined();
  });

  it('reports open state so the controller can freeze the sim', () => {
    const { overlay, onOpenChange } = build();

    overlay.open();
    expect(overlay.isOpen()).toBe(true);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    overlay.close();
    expect(overlay.isOpen()).toBe(false);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('wires the music toggle to the audio system', () => {
    const { overlay, layer, audio } = build();
    overlay.open();

    const row = rowOf(layer, 'Music');
    row.children.find((c) => c.eventMode === 'static' && !(c instanceof Text))?.emit('pointertap');

    expect(audio.toggleMusic).toHaveBeenCalledOnce();
  });

  it('restarts the level and closes first, so the panel never outlives the reset', () => {
    const { overlay, layer, onRestart } = build();
    overlay.open();

    rowOf(layer, 'Restart Level').children[0]?.emit('pointertap');

    expect(onRestart).toHaveBeenCalledOnce();
    expect(overlay.isOpen()).toBe(false);
  });

  it('sends the player home from the Return Home row', () => {
    const { overlay, layer, onHome } = build();
    overlay.open();

    rowOf(layer, 'Return Home').children[0]?.emit('pointertap');

    expect(onHome).toHaveBeenCalledOnce();
  });

  it('omits the audio rows when deps.audio has no audio surface', () => {
    const { overlay, layer } = build({ audio: undefined });
    overlay.open();

    expect(() => rowOf(layer, 'Music')).toThrow();
    expect(rowOf(layer, 'Restart Level')).toBeDefined();
  });

  it('destroys safely while open', () => {
    const { overlay } = build();
    overlay.open();
    expect(() => overlay.destroy()).not.toThrow();
  });
});
