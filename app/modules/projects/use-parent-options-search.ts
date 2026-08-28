/**
 * PROJ-01 / PROJ-05 — the shared "Area or Goal" server-backed search hook,
 * re-exported from its shared home.
 *
 * STEER-04 moved the implementation to `~/shared/project-creation` with the
 * create form that needed to be reachable from a Goal's record. Its three other
 * consumers are all inside this module and keep importing it from here, so the
 * move changed no call site and there is still one implementation.
 */

export {
  useParentOptionsSearch,
  type ParentOptionsSearch,
} from "~/shared/project-creation/use-parent-options-search";
