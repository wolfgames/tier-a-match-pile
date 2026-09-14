import type { Application } from 'pixi.js';

export interface PixiBackdropConfig {
  /** The Pixi Application instance */
  app: Application;
  /** Where to mount the canvas. Defaults to document.body if not provided. */
  container?: HTMLElement;
  /** Z-index of the canvas. Must be between 0 and 9. Defaults to 0. */
  zIndex?: number;
}

export function createPixiBackdrop(config: PixiBackdropConfig) {
  const { app, container = document.body, zIndex = 0 } = config;

  // Enforce the Z-Index Layering Contract (0-9 for Pixi)
  if (zIndex < 0 || zIndex > 9) {
    console.warn(`[PixiBackdrop] zIndex ${zIndex} is out of bounds. Pixi elements must be between 0 and 9.`);
  }

  const canvas = app.canvas as HTMLCanvasElement;

  // Apply required styles for the backdrop pattern
  canvas.style.position = 'absolute';
  canvas.style.left = '0';
  canvas.style.top = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.zIndex = zIndex.toString();
  
  // Critical: Allow Pixi canvas to receive pointer events so interactive elements work
  // We use 'auto' instead of 'none', relying on correct z-index to manage DOM/Canvas clicks
  canvas.style.pointerEvents = 'auto';

  // Mount
  container.appendChild(canvas);

  return {
    canvas,
    destroy: () => {
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    }
  };
}
