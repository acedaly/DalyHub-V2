/**
 * TODAY-01 — the Today drawer content resolver.
 *
 * Maps a DS-03 drawer key (`<kind>:<id>`) to the panel it opens, so a Card on Today
 * opens its record over the pane without losing the user's place — the canonical
 * Card → drawer key → panel chain (PRODUCT_EXPERIENCE Part IV §3). An unknown or
 * stale key returns `null`, which the Drawer renders as its graceful not-found
 * panel.
 *
 * UX-01 — the resolver now handles exactly TWO real kinds: the editable Task record
 * (TODAY-02) and the keyboard reference. The `upcoming:` / `project:` / `note:`
 * branches were removed. They rendered TODAY-01 demonstration fixtures and told the
 * owner things that stopped being true long ago — "The full Project overview arrives
 * with PROJ-01", "Reading and editing notes arrives with NOTES-01" — for modules
 * that have since shipped. Nothing produced those keys any more (X-01 retired the
 * Today search provider), so they were unreachable dead copy on the most-visited
 * screen in the product; the whole fixture payload they needed was also being
 * serialised into every `/today` response for nothing.
 */

import type { DrawerEntry, DrawerRenderResult } from "~/shared/drawer";
import { TASK_DRAWER_TITLE } from "~/shared/task-record/TaskRecordDrawer";

import { renderKeyboardHelpDrawer } from "./keyboard/KeyboardHelp";
import { TaskDrawerContent } from "./task/TaskDrawerContent";

function splitKey(key: string): { readonly kind: string; readonly id: string } {
  const separator = key.indexOf(":");
  if (separator === -1) {
    return { kind: key, id: "" };
  }
  return { kind: key.slice(0, separator), id: key.slice(separator + 1) };
}

/**
 * Build the drawer resolver. `taskTitles` names a real task's Drawer dialog by its
 * title (a task may be in any planning section, or be a shared/searched task not
 * currently listed — then the body still loads its real heading).
 */
export function createTodayDrawerRenderer(
  taskTitles: ReadonlyMap<string, string> = new Map(),
) {
  return function renderTodayDrawer(
    entry: DrawerEntry,
  ): DrawerRenderResult | null {
    // The keyboard-shortcuts reference (TODAY-05) is hosted by the same Drawer.
    const help = renderKeyboardHelpDrawer(entry);
    if (help !== null) {
      return help;
    }

    const { kind, id } = splitKey(entry.key);

    /*
     * TODAY-TASK-01 — `task-move:` resolves to the SAME record.
     *
     * The shared row's project editor offers "Search all Projects and Areas…"
     * at the foot of its menu, and its overflow offers "Move to Project or
     * Area…"; both open `task-move:<id>`, which is the key `/tasks` has used
     * since CONTROL-01 §4 for exactly this. Today now draws that row, so it has
     * to resolve that key — and it resolves it to the canonical Task record,
     * which is where the full searchable parent picker lives. Two surfaces, one
     * drawer key, one editor.
     */
    if (kind === "task" || kind === "task-move" || kind === "task-quick") {
      if (id.length === 0) return null;
      // The dialog's accessible name uses the known task title when available — the
      // TaskDrawerContent then loads the full record and renders its real heading.
      const title = taskTitles.get(id);
      return {
        title: title ?? TASK_DRAWER_TITLE,
        description: "Task record",
        // `isTop` gates the task's keyboard-shortcut ownership: a lower task drawer
        // (with another drawer stacked above) keeps its state but not its shortcuts.
        children: <TaskDrawerContent taskId={id} isTop={entry.isTop} />,
      };
    }

    return null;
  };
}
