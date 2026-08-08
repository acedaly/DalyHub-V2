/**
 * DS-06 Shared Forms & field controls — public surface.
 *
 * ONE reusable, entity-agnostic forms system for every create/edit UI in
 * DalyHub. There is no TaskForm/ProjectForm/NoteForm: a consumer supplies typed
 * values, field definitions, validation and persistence callbacks, and composes
 * the shared controls, the form host and the save model here. The UI knows nothing
 * of Tasks, Projects, Goals, People, D1, SQL, workspace selection, routes or a
 * central entity-type switch — server loaders/actions keep the trusted workspace
 * scope and data access (AGENTS.md §9.8).
 *
 * This barrel bulk-forwards the framework-free model (`./model`) and then lists
 * the React controls, hosts and composition primitives explicitly. Internal
 * state-machine, timing and focus-management modules are NOT exported unless a
 * consumer genuinely needs them; the public API is intentionally small.
 */

// The pure, framework-free model (types, validation, dirty, tags, dates,
// save-state, autosave, entity-link filtering). Non-UI code should import from
// `~/shared/forms/model` directly.
export * from "./model";

// Field anatomy + shared control prop contract.
export { Field, type FieldProps, type FieldControlProps } from "./Field";
export type { BaseControlProps, FocusableControl } from "./control-props";

// Composition primitives.
export {
  Form,
  FormSection,
  FieldGroup,
  FormActions,
  type FormProps,
  type FormSectionProps,
  type FieldGroupProps,
  type FormActionsProps,
} from "./Form";
export {
  FormButton,
  type FormButtonProps,
  type FormButtonVariant,
} from "./FormButton";
export {
  FormErrorSummary,
  type FormErrorSummaryProps,
} from "./FormErrorSummary";
export {
  SaveStatusIndicator,
  type SaveStatusIndicatorProps,
} from "./SaveStatusIndicator";
export {
  UnsavedChangesGuard,
  type UnsavedChangesGuardProps,
} from "./UnsavedChangesGuard";
export {
  RemoteChangeBanner,
  type RemoteChangeBannerProps,
} from "./RemoteChangeBanner";

// Field controls.
export { TextField, type TextFieldProps } from "./TextField";
export { DateField, type DateFieldProps } from "./DateField";
export {
  LocalDateTimeField,
  type LocalDateTimeFieldProps,
} from "./LocalDateTimeField";
export { SelectField, type SelectFieldProps } from "./SelectField";
export { TagsField, type TagsFieldProps } from "./TagsField";
export { BooleanField, type BooleanFieldProps } from "./BooleanField";
/**
 * M3-INT — the ONE M3 switch, for an immediate on/off preference. Exported
 * beside `BooleanField` (which renders it for `variant="switch"`) because a
 * settings row that owns its own label wants the bare control, not a field.
 */
export { Switch, type SwitchProps } from "./Switch";
export {
  EntityLinkPicker,
  type EntityLinkPickerProps,
} from "./EntityLinkPicker";

// Hosts / hooks.
export {
  useForm,
  type UseFormOptions,
  type UseFormResult,
  type FormFieldConfig,
  type FieldBinding,
  type SubmitOutcome,
} from "./use-form";
export {
  useOptionSearch,
  OPTION_SEARCH_DEBOUNCE_MS,
  type UseOptionSearchOptions,
  type UseOptionSearchResult,
} from "./use-option-search";
export {
  useAutosaveField,
  DEFAULT_AUTOSAVE_DEBOUNCE_MS,
  type UseAutosaveFieldOptions,
  type UseAutosaveFieldResult,
} from "./use-autosave-field";
export type { AutosaveSaveResult } from "./autosave";
export {
  useUnsavedChangesPrompt,
  type UnsavedChangesPrompt,
  type UnsavedChangesOptions,
} from "./use-unsaved-changes";
