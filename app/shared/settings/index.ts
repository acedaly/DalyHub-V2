/**
 * DS-10b Settings layout — public surface.
 *
 * ONE reusable, entity-agnostic Settings system every DalyHub module composes for
 * application, workspace, module and record-level settings, and for the final
 * Settings tab/section of a record Inspector or Drawer. There is NO bespoke
 * settings screen: a consumer supplies typed values, async apply/confirm callbacks
 * and copy, and composes these primitives over DS-06 controls and the DS-10
 * Feedback platform. The UI knows nothing of Projects/Tasks/People, D1, routes or a
 * central settings switch.
 *
 * Change behaviour is DECLARED, not invented here:
 *   - IMMEDIATE settings apply on change and confirm through Feedback —
 *     `useImmediateSetting` (composes the pure coordinator + `useFeedback`).
 *   - EXPLICIT-SAVE settings use DS-06's `useForm` (dirty/validate/Save/Cancel);
 *     quiet autosave uses DS-06's `useAutosaveField`. This module adds no second
 *     form engine, validation system, autosave hook, dirty-state model, toast
 *     system or focus-trap.
 *
 * Non-UI code imports the framework-free model from `~/shared/settings/model`.
 */

// The pure, framework-free model (types, confirmation rules, immediate coordinator).
export * from "./model";

// Layout primitives.
export { SettingsLayout, type SettingsLayoutProps } from "./SettingsLayout";
export { SettingsGroup, type SettingsGroupProps } from "./SettingsGroup";
export {
  SettingsRow,
  type SettingsRowProps,
  type SettingsControlIds,
} from "./SettingsRow";

// Dangerous actions.
export {
  ConfirmationDialog,
  type ConfirmationDialogProps,
  type TypedConfirmationConfig,
} from "./ConfirmationDialog";
export { DangerousAction, type DangerousActionProps } from "./DangerousAction";

// Immediate-setting hook.
export {
  useImmediateSetting,
  type UseImmediateSettingOptions,
  type UseImmediateSettingResult,
} from "./use-immediate-setting";
