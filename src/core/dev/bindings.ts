import type { Pane, FolderApi, BindingParams } from 'tweakpane';
import type { TuningState, ScaffoldTuning, GameTuningBase } from '../systems/tuning/types';
import { isGamePathWired, isScaffoldPathWired, areAllChildrenWired } from './tuningRegistry';
import gsap from 'gsap';
import { EasingPicker } from './EasingPicker';

// Use any for Pane methods due to @tweakpane/core type definition issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FolderOrPane = Pane | FolderApi | any;

// Color themes for scaffold vs game sections
const SECTION_COLORS = {
  scaffold: {
    border: '#4ecdc4', // Cyan/teal
    background: 'rgba(78, 205, 196, 0.1)',
    title: '#4ecdc4',
  },
  game: {
    border: '#ffb347', // Orange
    background: 'rgba(255, 179, 71, 0.1)',
    title: '#ffb347',
  },
};

/** Style a folder with section colors */
function styleSectionFolder(element: HTMLElement, section: 'scaffold' | 'game'): void {
  const colors = SECTION_COLORS[section];
  element.style.borderLeft = `3px solid ${colors.border}`;
  element.style.marginLeft = '0';
  element.style.paddingLeft = '4px';

  const title = element.querySelector('.tp-fldv_t') as HTMLElement | null;
  if (title) {
    title.style.color = colors.title;
    title.style.fontWeight = 'bold';
  }
}

/** Style an unwired binding element red */
function styleUnwiredBinding(element: HTMLElement): void {
  // Find the label element and style it red
  const label = element.querySelector('.tp-lblv_l') as HTMLElement | null;
  if (label) {
    label.style.color = '#ff6b6b';
    label.style.fontStyle = 'italic';
  }
  // Add subtle red background tint
  element.style.backgroundColor = 'rgba(255, 100, 100, 0.1)';
}

/**
 * Create an SVG easing curve visualization element.
 * Has headroom above for overshoot (back/elastic easings).
 */
function createEasingCurveSvg(easing: string, width = 200, height = 80): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.style.display = 'block';
  svg.style.background = 'rgba(0, 0, 0, 0.3)';
  svg.style.borderRadius = '4px';
  svg.style.marginTop = '4px';

  const padding = 8;
  const graphWidth = width - padding * 2;
  // Reserve 20% headroom for overshoot, 10% below for undershoot
  const overshootRatio = 0.2;
  const undershootRatio = 0.1;
  const graphHeight = height - padding * 2;
  const baselineY = padding + graphHeight * overshootRatio; // y=1 position
  const floorY = padding + graphHeight * (1 - undershootRatio); // y=0 position
  const usableHeight = floorY - baselineY;

  // Background rect
  const bgRect = document.createElementNS(ns, 'rect');
  bgRect.setAttribute('x', String(padding));
  bgRect.setAttribute('y', String(padding));
  bgRect.setAttribute('width', String(graphWidth));
  bgRect.setAttribute('height', String(graphHeight));
  bgRect.setAttribute('fill', 'rgba(255, 255, 255, 0.03)');
  bgRect.setAttribute('stroke', 'rgba(255, 255, 255, 0.1)');
  bgRect.setAttribute('stroke-width', '1');
  svg.appendChild(bgRect);

  // Horizontal line at y=1 (top baseline for overshoot reference)
  const topLine = document.createElementNS(ns, 'line');
  topLine.setAttribute('x1', String(padding));
  topLine.setAttribute('y1', String(baselineY));
  topLine.setAttribute('x2', String(padding + graphWidth));
  topLine.setAttribute('y2', String(baselineY));
  topLine.setAttribute('stroke', 'rgba(255, 255, 255, 0.15)');
  topLine.setAttribute('stroke-width', '1');
  topLine.setAttribute('stroke-dasharray', '2,2');
  svg.appendChild(topLine);

  // Linear reference (diagonal dashed line)
  const diagonal = document.createElementNS(ns, 'line');
  diagonal.setAttribute('x1', String(padding));
  diagonal.setAttribute('y1', String(floorY));
  diagonal.setAttribute('x2', String(padding + graphWidth));
  diagonal.setAttribute('y2', String(baselineY));
  diagonal.setAttribute('stroke', 'rgba(255, 255, 255, 0.2)');
  diagonal.setAttribute('stroke-width', '1');
  diagonal.setAttribute('stroke-dasharray', '4,4');
  svg.appendChild(diagonal);

  // Sample the easing function
  const easeFn = gsap.parseEase(easing) || ((t: number) => t);
  const samples = 50;
  const points: string[] = [];

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const value = easeFn(t);
    const x = padding + t * graphWidth;
    const y = floorY - value * usableHeight;
    points.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
  }

  // Easing curve path
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', points.join(' '));
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#4dabf7');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);

  // Start point
  const startCircle = document.createElementNS(ns, 'circle');
  startCircle.setAttribute('cx', String(padding));
  startCircle.setAttribute('cy', String(floorY));
  startCircle.setAttribute('r', '3');
  startCircle.setAttribute('fill', '#4dabf7');
  svg.appendChild(startCircle);

  // End point
  const endCircle = document.createElementNS(ns, 'circle');
  endCircle.setAttribute('cx', String(padding + graphWidth));
  endCircle.setAttribute('cy', String(baselineY));
  endCircle.setAttribute('r', '3');
  endCircle.setAttribute('fill', '#4dabf7');
  svg.appendChild(endCircle);

  return svg;
}

/**
 * Format a camelCase/snake_case key to Title Case label
 */
function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

/**
 * Infer binding parameters from key name patterns
 */
function inferBindingParams(key: string, value: number): Partial<BindingParams> {
  const keyLower = key.toLowerCase();

  // Volume/alpha: 0-1 range
  if (keyLower.includes('volume') || keyLower.includes('alpha')) {
    return { min: 0, max: 1, step: 0.01 };
  }

  // Duration/delay: 0-5000ms
  if (keyLower.includes('duration') || keyLower.includes('delay')) {
    return { min: 0, max: 5000, step: 50 };
  }

  // Scale: 0.1-3
  if (keyLower.includes('scale')) {
    return { min: 0.1, max: 3, step: 0.05 };
  }

  // Size percent: 50-300%
  if (keyLower.includes('sizepercent')) {
    return { min: 50, max: 300, step: 5 };
  }

  // Size (tile size, etc): 1-500
  if (keyLower.includes('size')) {
    return { min: 1, max: 500, step: 1 };
  }

  // FPS: 15-120
  if (keyLower.includes('fps')) {
    return { min: 15, max: 120, step: 1 };
  }

  // Probability: 0-1
  if (keyLower.includes('probability')) {
    return { min: 0, max: 1, step: 0.05 };
  }

  // Offset: 0-1
  if (keyLower.includes('offset')) {
    return { min: 0, max: 1, step: 0.01 };
  }

  // Padding/gap: 0-100
  if (keyLower.includes('padding') || keyLower.includes('gap')) {
    return { min: 0, max: 100, step: 1 };
  }

  // Count: 0-20
  if (keyLower.includes('count') || keyLower.includes('min') || keyLower.includes('max')) {
    return { min: 0, max: 20, step: 1 };
  }

  // Resolution: 0.5-3
  if (keyLower.includes('resolution')) {
    return { min: 0.5, max: 3, step: 0.25 };
  }

  // Particles/pool size: 10-10000
  if (keyLower.includes('particles') || keyLower.includes('pool')) {
    return { min: 10, max: 10000, step: 10 };
  }

  // Path length: 1-20
  if (keyLower.includes('path')) {
    return { min: 1, max: 20, step: 1 };
  }

  // Bonus/penalty/score: 0-1000
  if (
    keyLower.includes('bonus') ||
    keyLower.includes('penalty') ||
    keyLower.includes('score')
  ) {
    return { min: 0, max: 1000, step: 5 };
  }

  // Default numeric range
  return { min: 0, max: 1000, step: 1 };
}

/**
 * Add a reset button next to a binding
 */
function addResetButton(
  bindingElement: HTMLElement,
  defaultValue: unknown,
  currentObj: Record<string, unknown>,
  key: string,
  onUpdate: (value: unknown) => void
): void {
  setTimeout(() => {
    // Create reset button
    const resetBtn = document.createElement('button');
    resetBtn.innerHTML = '↻';
    resetBtn.title = `Reset to default: ${JSON.stringify(defaultValue)}`;
    resetBtn.style.cssText = `
      margin-left: 4px;
      padding: 2px 6px;
      font-size: 12px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.05);
      color: rgba(255, 255, 255, 0.5);
      cursor: pointer;
      border-radius: 2px;
      transition: all 0.2s;
    `;

    // Hover effects
    resetBtn.onmouseenter = () => {
      resetBtn.style.background = 'rgba(255, 255, 255, 0.15)';
      resetBtn.style.color = 'rgba(255, 255, 255, 0.9)';
    };
    resetBtn.onmouseleave = () => {
      resetBtn.style.background = 'rgba(255, 255, 255, 0.05)';
      resetBtn.style.color = 'rgba(255, 255, 255, 0.5)';
    };

    // Reset functionality
    resetBtn.onclick = (e) => {
      e.stopPropagation();
      currentObj[key] = defaultValue;
      onUpdate(defaultValue);
      console.log(`[Tuning] Reset ${key} to default:`, defaultValue);
    };

    // Find the value container and append button
    const valueContainer = bindingElement.querySelector('.tp-lblv_v');
    if (valueContainer) {
      valueContainer.appendChild(resetBtn);
    }
  }, 0);
}

/**
 * Create a Tweakpane binding for a single value
 */
function createBinding(
  parent: FolderOrPane,
  key: string,
  value: unknown,
  onUpdate: (value: unknown) => void,
  options: { fullPath: string; isScaffold: boolean; defaultValue: unknown }
): void {
  const { fullPath, isScaffold, defaultValue } = options;
  const isWired = isScaffold ? isScaffoldPathWired(fullPath) : isGamePathWired(fullPath);

  const label = formatLabel(key);
  const obj = { [key]: value };

  // Helper to style binding after creation
  const applyUnwiredStyle = (binding: { element: HTMLElement }) => {
    if (!isWired) {
      // Use setTimeout to ensure element is in DOM
      setTimeout(() => styleUnwiredBinding(binding.element), 0);
    }
  };

  if (typeof value === 'boolean') {
    const binding = parent.addBinding(obj, key, { label });
    binding.on('change', (ev: { value: boolean }) => onUpdate(ev.value));
    applyUnwiredStyle(binding);
    addResetButton(binding.element, defaultValue, obj, key, onUpdate);
    return;
  }

  if (typeof value === 'number') {
    // Grid size dropdown (constrained to 4, 5, 6)
    if (key === 'gridSize' || key === 'defaultGridSize') {
      const binding = parent.addBinding(obj, key, {
        label,
        options: {
          '4×4': 4,
          '5×5': 5,
          '6×6': 6,
        },
      });
      binding.on('change', (ev: { value: number }) => onUpdate(ev.value));
      applyUnwiredStyle(binding);
      addResetButton(binding.element, defaultValue, obj, key, onUpdate);
      return;
    }

    // Tile size dropdown (common game sizes)
    if (key === 'tileSize') {
      const binding = parent.addBinding(obj, key, {
        label,
        options: {
          '32px': 32,
          '48px': 48,
          '64px': 64,
          '80px': 80,
          '96px': 96,
          '128px': 128,
          '160px': 160,
          '192px': 192,
          '256px': 256,
        },
      });
      binding.on('change', (ev: { value: number }) => onUpdate(ev.value));
      applyUnwiredStyle(binding);
      addResetButton(binding.element, defaultValue, obj, key, onUpdate);
      return;
    }

    const params: BindingParams = { label, ...inferBindingParams(key, value) };
    const binding = parent.addBinding(obj, key, params);
    binding.on('change', (ev: { value: number }) => onUpdate(ev.value));
    applyUnwiredStyle(binding);
    addResetButton(binding.element, defaultValue, obj, key, onUpdate);
    return;
  }

  if (typeof value === 'string') {
    // Check if it's a hex color
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      const binding = parent.addBinding(obj, key, { label, view: 'color' });
      binding.on('change', (ev: { value: string }) => onUpdate(ev.value));
      applyUnwiredStyle(binding);
      addResetButton(binding.element, defaultValue, obj, key, onUpdate);
      return;
    }

    // Log level dropdown
    if (key === 'logLevel') {
      const binding = parent.addBinding(obj, key, {
        label,
        options: {
          Debug: 'debug',
          Info: 'info',
          Warn: 'warn',
          Error: 'error',
          None: 'none',
        },
      });
      binding.on('change', (ev: { value: string }) => onUpdate(ev.value));
      applyUnwiredStyle(binding);
      addResetButton(binding.element, defaultValue, obj, key, onUpdate);
      return;
    }

    // Transition type dropdown
    if (key === 'transitionType') {
      const binding = parent.addBinding(obj, key, {
        label,
        options: { Fade: 'fade', Slide: 'slide', None: 'none' },
      });
      binding.on('change', (ev: { value: string }) => onUpdate(ev.value));
      applyUnwiredStyle(binding);
      addResetButton(binding.element, defaultValue, obj, key, onUpdate);
      return;
    }

    // Panel position dropdown
    if (key === 'position' && (value === 'left' || value === 'center' || value === 'right')) {
      const binding = parent.addBinding(obj, key, {
        label,
        options: { Left: 'left', Center: 'center', Right: 'right' },
      });
      binding.on('change', (ev: { value: string }) => onUpdate(ev.value));
      applyUnwiredStyle(binding);
      addResetButton(binding.element, defaultValue, obj, key, onUpdate);
      return;
    }

    // Viewport mode dropdown
    if (key === 'mode' && (value === 'small' || value === 'large' || value === 'none')) {
      const binding = parent.addBinding(obj, key, {
        label,
        options: { 'Small (430px)': 'small', 'Large (768px)': 'large', 'None (full)': 'none' },
      });
      binding.on('change', (ev: { value: string }) => onUpdate(ev.value));
      applyUnwiredStyle(binding);
      addResetButton(binding.element, defaultValue, obj, key, onUpdate);
      return;
    }

    // Tile theme dropdown (requires restart)
    if (key === 'tileTheme') {
      const binding = parent.addBinding(obj, key, {
        label: 'Tile Theme ⟳',
        options: { Regular: 'regular', Fall: 'fall', Winter: 'winter' },
      });
      binding.on('change', (ev: { value: string }) => onUpdate(ev.value));
      applyUnwiredStyle(binding);
      addResetButton(binding.element, defaultValue, obj, key, onUpdate);
      return;
    }

    // Easing picker with curve previews in dropdown
    if (key === 'defaultEasing' || key === 'tileRotateEasing') {
      // Create a container that mimics Tweakpane row styling
      const container = document.createElement('div');
      container.className = 'tp-lblv';
      container.style.cssText = 'display: flex; align-items: center; padding: 2px 4px;';

      // Label
      const labelEl = document.createElement('div');
      labelEl.className = 'tp-lblv_l';
      labelEl.style.cssText = 'flex: 1; font-size: 11px; color: rgba(255, 255, 255, 0.7);';
      labelEl.textContent = label;
      container.appendChild(labelEl);

      // Picker container
      const pickerContainer = document.createElement('div');
      pickerContainer.style.cssText = 'flex: 1.5; display: flex; align-items: center;';

      const picker = new EasingPicker(value as string, (newValue) => {
        onUpdate(newValue);
      });
      pickerContainer.appendChild(picker.element);

      // Add reset button for easing picker
      const resetBtn = document.createElement('button');
      resetBtn.innerHTML = '↻';
      resetBtn.title = `Reset to default: ${defaultValue}`;
      resetBtn.style.cssText = `
        margin-left: 4px;
        padding: 2px 6px;
        font-size: 12px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(255, 255, 255, 0.05);
        color: rgba(255, 255, 255, 0.5);
        cursor: pointer;
        border-radius: 2px;
        transition: all 0.2s;
      `;
      resetBtn.onmouseenter = () => {
        resetBtn.style.background = 'rgba(255, 255, 255, 0.15)';
        resetBtn.style.color = 'rgba(255, 255, 255, 0.9)';
      };
      resetBtn.onmouseleave = () => {
        resetBtn.style.background = 'rgba(255, 255, 255, 0.05)';
        resetBtn.style.color = 'rgba(255, 255, 255, 0.5)';
      };
      resetBtn.onclick = (e) => {
        e.stopPropagation();
        picker.setValue(defaultValue as string);
        onUpdate(defaultValue);
        console.log(`[Tuning] Reset ${key} to default:`, defaultValue);
      };
      pickerContainer.appendChild(resetBtn);

      container.appendChild(pickerContainer);

      // Inject into parent folder
      setTimeout(() => {
        const parentEl = parent.element.querySelector('.tp-fldv_c') || parent.element;
        parentEl.appendChild(container);
      }, 0);

      // Style if unwired
      if (!isWired) {
        setTimeout(() => {
          labelEl.style.color = '#ff6b6b';
          labelEl.style.fontStyle = 'italic';
          container.style.backgroundColor = 'rgba(255, 100, 100, 0.1)';
        }, 0);
      }

      return;
    }

    // Default text input
    const binding = parent.addBinding(obj, key, { label });
    binding.on('change', (ev: { value: string }) => onUpdate(ev.value));
    applyUnwiredStyle(binding);
    addResetButton(binding.element, defaultValue, obj, key, onUpdate);
  }
}

/**
 * Style an unwired folder element with subtle red tint
 */
function styleUnwiredFolder(element: HTMLElement): void {
  const title = element.querySelector('.tp-fldv_t') as HTMLElement | null;
  if (title) {
    title.style.color = '#ff9999';
    title.style.fontStyle = 'italic';
  }
}

/**
 * Get a nested value from an object by path
 */
function getValueByPath(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = obj;
  for (const key of keys) {
    if (current === undefined || current === null) return undefined;
    current = current[key];
  }
  return current;
}

/**
 * Recursively bind an object to Tweakpane folders
 */
function bindObjectToPane(
  parent: FolderOrPane,
  obj: Record<string, unknown>,
  onUpdate: (path: string, value: unknown) => void,
  options: {
    pathPrefix?: string;
    isScaffold: boolean;
    defaults: Record<string, unknown>;
    onResetFolder?: (folderPath: string) => void;
  }
): void {
  const { pathPrefix = '', isScaffold, defaults, onResetFolder } = options;

  for (const [key, value] of Object.entries(obj)) {
    // Skip version field
    if (key === 'version') continue;

    const path = pathPrefix ? `${pathPrefix}.${key}` : key;

    if (value === null || value === undefined) continue;

    if (typeof value === 'object' && !Array.isArray(value)) {
      // Create subfolder for nested objects
      const folder = parent.addFolder({
        title: formatLabel(key),
        expanded: false,
      });

      // Check if any children are wired
      const hasWiredChildren = areAllChildrenWired(path, isScaffold);
      if (!hasWiredChildren) {
        setTimeout(() => styleUnwiredFolder(folder.element), 0);
      }

      // Add folder-level reset button
      setTimeout(() => {
        const titleElement = folder.element.querySelector('.tp-fldv_t');
        if (titleElement) {
          const resetBtn = document.createElement('button');
          resetBtn.innerHTML = '↻';
          resetBtn.title = `Reset all values in ${formatLabel(key)} to defaults`;
          resetBtn.style.cssText = `
            margin-left: 8px;
            padding: 2px 6px;
            font-size: 11px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.05);
            color: rgba(255, 255, 255, 0.5);
            cursor: pointer;
            border-radius: 2px;
            transition: all 0.2s;
          `;
          resetBtn.onmouseenter = () => {
            resetBtn.style.background = 'rgba(255, 255, 255, 0.15)';
            resetBtn.style.color = 'rgba(255, 255, 255, 0.9)';
          };
          resetBtn.onmouseleave = () => {
            resetBtn.style.background = 'rgba(255, 255, 255, 0.05)';
            resetBtn.style.color = 'rgba(255, 255, 255, 0.5)';
          };
          resetBtn.onclick = (e) => {
            e.stopPropagation();
            if (onResetFolder) {
              onResetFolder(path);
              console.log(`[Tuning] Reset folder "${path}" to defaults`);
            }
          };
          titleElement.appendChild(resetBtn);
        }
      }, 0);

      bindObjectToPane(folder, value as Record<string, unknown>, onUpdate, {
        pathPrefix: path,
        isScaffold,
        defaults,
        onResetFolder,
      });
    } else {
      // Get default value for this path
      const defaultValue = getValueByPath(defaults, path);

      // Create binding for primitive values
      createBinding(parent, key, value, (newValue) => onUpdate(path, newValue), {
        fullPath: path,
        isScaffold,
        defaultValue,
      });
    }
  }
}

/**
 * Bind tuning state to Tweakpane
 */
export function bindTuningToPane<S extends ScaffoldTuning, G extends GameTuningBase>(
  pane: Pane,
  state: TuningState<S, G>,
  options: {
    scaffoldFolder?: string;
    gameFolder?: string;
    onChange?: () => void;
  } = {}
): void {
  const { scaffoldFolder = 'Scaffold', gameFolder = 'Game', onChange } = options;

  // Create main folders with color coding
  const scaffoldPane = pane.addFolder({
    title: scaffoldFolder,
    expanded: false,
  });
  // Apply scaffold section styling
  setTimeout(() => styleSectionFolder(scaffoldPane.element, 'scaffold'), 0);

  const gamePane = pane.addFolder({
    title: gameFolder,
    expanded: true,
  });
  // Apply game section styling
  setTimeout(() => styleSectionFolder(gamePane.element, 'game'), 0);

  // Helper to reset a folder (all values under a path)
  const resetFolder = (folderPath: string, isScaffold: boolean): void => {
    const defaults = isScaffold ? state.scaffoldDefaults : state.gameDefaults;
    const folderDefaults = getValueByPath(defaults as Record<string, unknown>, folderPath);

    if (folderDefaults && typeof folderDefaults === 'object') {
      // Recursively reset all values in this folder
      const resetRecursive = (obj: Record<string, unknown>, pathPrefix: string): void => {
        for (const [key, value] of Object.entries(obj)) {
          const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key;
          if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            resetRecursive(value as Record<string, unknown>, fullPath);
          } else {
            if (isScaffold) {
              state.setScaffoldPath(fullPath, value);
            } else {
              state.setGamePath(fullPath, value);
            }
          }
        }
      };

      resetRecursive(folderDefaults as Record<string, unknown>, folderPath);
      onChange?.();

      // Reload to update UI
      window.location.reload();
    }
  };

  // Bind scaffold tuning
  bindObjectToPane(
    scaffoldPane,
    state.scaffold as Record<string, unknown>,
    (path, value) => {
      state.setScaffoldPath(path, value);
      onChange?.();
    },
    {
      isScaffold: true,
      defaults: state.scaffoldDefaults as Record<string, unknown>,
      onResetFolder: (path) => resetFolder(path, true),
    }
  );

  // Bind game tuning
  bindObjectToPane(
    gamePane,
    state.game as Record<string, unknown>,
    (path, value) => {
      state.setGamePath(path, value);
      onChange?.();
    },
    {
      isScaffold: false,
      defaults: state.gameDefaults as Record<string, unknown>,
      onResetFolder: (path) => resetFolder(path, false),
    }
  );
}

/**
 * Add preset control buttons to Tweakpane
 */
export function addPresetControls<S extends ScaffoldTuning, G extends GameTuningBase>(
  pane: Pane,
  state: TuningState<S, G>
): void {
  const presetsFolder = pane.addFolder({ title: 'Actions', expanded: false });

  // Save button
  presetsFolder.addButton({ title: 'Save to Browser' }).on('click', () => {
    state.save();
    console.log('[Tuning] Saved to localStorage');
  });

  // Export button
  presetsFolder.addButton({ title: 'Export JSON' }).on('click', () => {
    const json = state.exportJson();
    navigator.clipboard.writeText(json).then(() => {
      console.log('[Tuning] Exported to clipboard');
    });
  });

  // Reset button
  presetsFolder.addButton({ title: 'Reset to Defaults' }).on('click', () => {
    state.reset();
    console.log('[Tuning] Reset to defaults');
    // Refresh the pane - this requires rebuilding
    window.location.reload();
  });

  // Regenerate Level button (if function is available on window)
  if (typeof window !== 'undefined' && (window as any).regenerateLevel) {
    presetsFolder.addButton({ title: '🔄 Regenerate Level' }).on('click', () => {
      (window as any).regenerateLevel();
    });
  }
}
