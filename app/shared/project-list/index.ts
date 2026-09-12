/**
 * UNTITLED-05 — the shared way a Project is drawn INSIDE another record.
 *
 * An Area's Projects tab, an Area's Overview and a Goal's Projects tab all
 * render Projects. Before this module each of them built its own `CardProps`
 * for the generic `Card`, so the same Project was three different objects
 * depending on which record you reached it from — none of which resembled the
 * one `/projects` draws.
 *
 * It lives in `~/shared` rather than in either module because a module may not
 * import another module's internals (AGENTS.md §9), and because a Project's
 * appearance is a product-wide contract rather than an Areas decision.
 */

export {
  ProjectSummaryList,
  type ProjectSummaryItem,
  type ProjectSummaryListProps,
} from "./ProjectSummaryList";
