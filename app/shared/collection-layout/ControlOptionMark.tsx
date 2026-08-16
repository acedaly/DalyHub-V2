/**
 * CONTROL-01 — render a control option's decorative mark.
 *
 * The seam between the pure `CollectionControlMark` descriptor a module declares
 * and the ONE shared component that draws it. Both control presentations (the
 * phone sheet and the desktop popover) render marks through here, so a filter
 * option and the row it filters cannot draw a priority two different ways.
 *
 * Decorative by construction: every option already carries its own text label,
 * and the mark is `aria-hidden` inside the shared indicator. Adding a kind means
 * adding a case here and nowhere else.
 */

import type { TaskPriority } from "~/kernel/tasks";
import { PriorityGlyph } from "~/shared/task-record/PriorityIndicator";

import type { CollectionControlMark } from "./collection-controls-model";

export function ControlOptionMark({
  mark,
}: {
  readonly mark: CollectionControlMark | undefined;
}) {
  if (!mark) return null;
  if (mark.kind === "priority") {
    /*
     * The GLYPH, not the full indicator: the option's own text already reads
     * "Priority 2", and the priority contract puts the short P1–P4 tag in
     * compact ROWS and the full label in MENUS. A mark that printed "P2" beside
     * "Priority 2" would be saying it twice in two vocabularies.
     */
    return <PriorityGlyph priority={mark.value as TaskPriority} />;
  }
  return null;
}
