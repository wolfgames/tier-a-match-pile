/**
 * One settings theme, two surfaces.
 *
 * Deliberately empty: the catalog's default IS the Wolf house settings bar, so
 * a fresh template already looks like a game with nothing configured. Put
 * tokens here and any consuming menu follows — currently only the DOM one
 * (`screens/components/GameSettingsMenu.tsx`); match-pile has no in-canvas
 * settings overlay.
 *
 * ```ts
 * export const SETTINGS_THEME = {
 *   layout: 'stack',              // labelled rows instead of the icon bar
 *   fontFamily: 'Trebuchet MS, sans-serif',
 *   backgroundColor: 0x2fa0ee,
 *   sliderFillColor: 0xec5fc8,
 *   toggleOnColor: 0xf2d33f,
 * } as const;
 * ```
 *
 * Full token list: `@wolfgames/components` →
 * `src/modules/prefabs/options-menu/README.md`.
 */
export const SETTINGS_THEME = {} as const;
