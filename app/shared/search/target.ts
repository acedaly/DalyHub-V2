/**
 * DS-08 Shared Search — navigation-target validation (pure, React-free).
 *
 * A module describes how a result opens with a typed {@link SearchResultTarget}.
 * Because a target is data a provider produces, Search treats it as untrusted and
 * validates it at the boundary before it ever reaches a link or a navigation.
 *
 * The validation logic itself now lives in the kernel, colocated with the
 * `SearchResultTarget` type it validates, so DS-08 Search and DS-09's Command
 * Palette (which validates the navigation target a module declares on a
 * `kind: "navigate"` command) share ONE implementation instead of two copies
 * (ADR-024; ADR-023 §23.3 introduced this validation). This module re-exports it
 * under the names DS-08 established, so nothing downstream changes.
 */

export {
  isSafeInAppPath,
  validateNavigationTarget as validateTarget,
} from "~/kernel/modules/navigation-target";
