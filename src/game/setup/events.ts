import { type } from "arktype";

// ============================================================================
// SESSION EVENTS (automatic — template fires these)
// ============================================================================

/**
 * Schema for session_start event.
 * Fires once on page load.
 */
export const sessionStartSchema = type({
  entry_screen: "string",
});

/**
 * Schema for session_pause event.
 * Fires when the browser tab is hidden.
 */
export const sessionPauseSchema = type({
  pause_reason: "'tab_hidden' | 'window_blur' | 'app_background'",
});

/**
 * Schema for session_resume event.
 * Fires when the tab becomes visible again.
 */
export const sessionResumeSchema = type({
  resume_reason: "'tab_visible' | 'window_focus' | 'app_foreground'",
  pause_duration: "number",
});

/**
 * Schema for session_end event.
 * Fires when the user leaves. Should include a snapshot of last-known game state.
 * Games should extend this with their own session-level context properties.
 */
export const sessionEndSchema = type({
  session_end_reason: "'user_close' | 'timeout' | 'navigation_away'",
});

/**
 * Creates an extended session_end schema with game-specific properties.
 * @param extraProperties - Additional arktype property definitions
 */
export function extendSessionEndSchema(
  extraProperties: Record<string, string>
): ReturnType<typeof type> {
  return type({
    session_end_reason: "'user_close' | 'timeout' | 'navigation_away'",
    ...extraProperties,
  });
}

// ============================================================================
// NAVIGATION EVENTS (automatic — template fires these)
// ============================================================================

/**
 * Schema for screen_enter event.
 * Fires when a screen becomes active.
 */
export const screenEnterSchema = type({
  screen_name: "string",
  "previous_screen?": "string",
});

/**
 * Schema for screen_exit event.
 * Fires when a screen is left.
 */
export const screenExitSchema = type({
  screen_name: "string",
  time_on_screen: "number",
});

// ============================================================================
// LOADING EVENTS (automatic — template fires these)
// ============================================================================

/**
 * Schema for loading_start event.
 * Fires when asset loading begins.
 */
export const loadingStartSchema = type({
  asset_count: "number",
});

/**
 * Schema for loading_complete event.
 * Fires when asset loading finishes.
 */
export const loadingCompleteSchema = type({
  asset_count: "number",
  load_duration: "number",
});

/**
 * Schema for loading_abandon event.
 * Fires if the user leaves during loading.
 */
export const loadingAbandonSchema = type({
  assets_loaded: "number",
  assets_total: "number",
  load_duration: "number",
});

// ============================================================================
// SYSTEM EVENTS (automatic — template fires these)
// ============================================================================

/**
 * Schema for error_captured event.
 * Fires automatically on errors.
 */
export const errorCapturedSchema = type({
  error_type: "string",
  user_id: "string",
  session_id: "string",
});

/**
 * Schema for audio_setting_changed event.
 * Fires when audio settings change.
 */
export const audioSettingChangedSchema = type({
  setting_type: "'volume' | 'mute'",
  old_value: "unknown",
  new_value: "unknown",
  screen_name: "string",
});

// ============================================================================
// GAMEPLAY LIFECYCLE EVENTS (AI agent wires these)
// ============================================================================

/**
 * Schema for start_screen_skipped event.
 * Fires when skipStartScreen routes loading directly to gameplay.
 */
export const startScreenSkippedSchema = type({
  skip_source: "'config' | 'dev_mode' | 'url_param'",
});

/**
 * Schema for game_start event.
 * Fires when the player starts playing.
 */
export const gameStartSchema = type({
  start_source: "string",
  is_returning_player: "boolean",
});

/**
 * Schema for level_start event.
 * Fires when a level becomes interactive.
 */
export const levelStartSchema = type({
  level_id: "string",
  "level_order?": "number",
  "is_replay?": "boolean",
});

/**
 * Schema for level_complete event.
 * Fires when a level is finished successfully.
 */
export const levelCompleteSchema = type({
  level_id: "string",
  "level_order?": "number",
  time_to_complete: "number",
  "score?": "number",
});

/**
 * Schema for level_fail event.
 * Fires when a level ends without completion.
 */
export const levelFailSchema = type({
  level_id: "string",
  "level_order?": "number",
  fail_reason: "string",
  time_played: "number",
});

/**
 * Schema for level_restart event.
 * Fires when a player restarts a level.
 */
export const levelRestartSchema = type({
  level_id: "string",
  "level_order?": "number",
  restart_count: "number",
});

/**
 * Schema for chapter_start event.
 * Fires when a new chapter or stage begins.
 */
export const chapterStartSchema = type({
  chapter_id: "string",
  "chapter_order?": "number",
});

/**
 * Schema for chapter_complete event.
 * Fires when all levels in a chapter are done.
 */
export const chapterCompleteSchema = type({
  chapter_id: "string",
  "chapter_order?": "number",
  levels_completed: "number",
  time_to_complete: "number",
});
