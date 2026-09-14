import { onMount, onCleanup, createSignal } from 'solid-js';
import type { Pane } from 'tweakpane';

const [isOpen, setIsOpen] = createSignal(false);

// Global keyboard listener for backtick toggle
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === '`') {
      e.preventDefault();
      setIsOpen((prev) => !prev);
    }
  });
}

export { isOpen, setIsOpen };

export default function TweakpaneConfig() {
  let containerRef: HTMLDivElement | undefined;
  let pane: Pane | undefined;

  onMount(async () => {
    const { Pane } = await import('tweakpane');
    pane = new Pane({
      container: containerRef,
      title: 'Config',
    });

    // ⚙️ Global
    const globalFolder = pane.addFolder({ title: '⚙️ Global', expanded: false });
    globalFolder.addFolder({ title: '🔊 Audio', expanded: false });
    globalFolder.addFolder({ title: '⚡ Performance', expanded: false });
    globalFolder.addFolder({ title: '🔧 Dev Tools', expanded: false });

    // 🎬 Scenes
    const scenesFolder = pane.addFolder({ title: '🎬 Scenes', expanded: true });
    scenesFolder.addFolder({ title: '▶️ Start Screen', expanded: false });
    scenesFolder.addFolder({ title: '🧩 Gameplay', expanded: false });
    scenesFolder.addFolder({ title: '🗞️ Story Reveal', expanded: false });
    scenesFolder.addFolder({ title: '🏆 Results', expanded: false });

    // 📦 Presets
    const presetsFolder = pane.addFolder({ title: '📦 Presets', expanded: false });
    const presetObj = { preset: 'default' };
    presetsFolder.addBinding(presetObj, 'preset', {
      label: 'Load',
      options: {
        Default: 'default',
        Easy: 'easy',
        Hard: 'hard',
        Debug: 'debug',
      },
    });
    presetsFolder.addButton({ title: 'Save Current...' });
    presetsFolder.addButton({ title: 'Export JSON' });
    presetsFolder.addButton({ title: 'Reset to Defaults' });
  });

  onCleanup(() => {
    pane?.dispose();
  });

  return (
    <div
      class="fixed top-4 right-4 z-[9999]"
      style={{ display: isOpen() ? 'block' : 'none' }}
    >
      <div ref={containerRef} />
    </div>
  );
}
