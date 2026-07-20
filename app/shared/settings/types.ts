/**
 * DS-10b Settings layout — shared, framework-free TypeScript contracts.
 *
 * These types describe the SHAPE of settings surfaces and the dangerous-action
 * confirmation contract. They import no React, DOM, router or Cloudflare types, so
 * a server loader/action or a pure test can consume them without pulling the UI.
 *
 * DS-10b is a presentation + interaction contract only. It encodes NO product
 * rule (no Project/Task/Person deletion or archival logic): a consumer supplies
 * the async `apply`/`confirm` callbacks and the copy; the shared layer owns the
 * layout, the save/confirm choreography and the accessibility.
 */

/** How a settings section is toned. `danger` is the visually-separated, */
/** deliberately-confirmed dangerous-settings region. */
export type SettingsTone = "default" | "danger";

/** The supplementary status/help line a settings row can show under its control. */
export type SettingsStatusTone = "neutral" | "success" | "warning" | "danger";

/**
 * The lifecycle of a single immediate ("apply on change") setting, derived by the
 * pure coordinator in `immediate.ts`. Immediate settings never keep a dirty draft:
 * they apply optimistically and either commit or revert.
 */
export type ImmediateSettingStatus = "idle" | "saving";

/**
 * The lifecycle phase of a dangerous-action confirmation, derived by the pure
 * reducer in `confirmation.ts`. The OPEN/closed state is owned by React; this is
 * only the in-dialog phase.
 */
export type ConfirmationPhase = "idle" | "pending" | "error";
