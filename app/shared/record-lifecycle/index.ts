/**
 * PX-04 — public entry for the shared record lifecycle.
 *
 * One vocabulary and one interaction for Archive / Restore / Delete, rendered in
 * the DS-12 Record Header overflow on every entity. Never write a module-local
 * lifecycle label or a second confirmation flow.
 */

export { useRecordLifecycle } from "./useRecordLifecycle";
export { useReversibleDelete } from "./use-reversible-delete";
export type {
  LifecyclePostResult,
  ReversibleDelete,
  ReversibleDeleteOptions,
} from "./use-reversible-delete";
export { useCollectionRestore } from "./use-collection-restore";
export type {
  CollectionRestore,
  CollectionRestoreOptions,
} from "./use-collection-restore";
export type {
  RecordLifecycle,
  RecordLifecycleOptions,
} from "./useRecordLifecycle";
export {
  entityLabel,
  entityPluralLabel,
  lifecycleActionLabel,
  lifecycleBlockedByLinks,
  lifecycleBusyLabel,
  lifecycleConfirmLabel,
  lifecycleConfirmTitle,
  lifecycleConsequence,
  lifecycleSuccessMessage,
} from "./lifecycle-copy";
export type { LifecycleAction } from "./lifecycle-copy";
