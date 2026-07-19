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

// Field controls.
export { TextField, type TextFieldProps } from "./TextField";
export { MarkdownField, type MarkdownFieldProps } from "./MarkdownField";
export { DateField, type DateFieldProps } from "./DateField";
export { SelectField, type SelectFieldProps } from "./SelectField";
export { TagsField, type TagsFieldProps } from "./TagsField";
export { BooleanField, type BooleanFieldProps } from "./BooleanField";
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
  useAutosaveField,
  DEFAULT_AUTOSAVE_DEBOUNCE_MS,
  type UseAutosaveFieldOptions,
  type UseAutosaveFieldResult,
} from "./use-autosave-field";
export {
  useUnsavedChangesPrompt,
  type UnsavedChangesPrompt,
  type UnsavedChangesOptions,
} from "./use-unsaved-changes";
