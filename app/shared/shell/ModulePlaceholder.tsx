/**
 * PX-02 module route placeholder.
 *
 * A calm placeholder rendered inside the application pane for each spine module
 * (Areas, Goals, Projects, Tasks). It now composes the PX-02 Pane Header — with the
 * module's entity-identity glyph — so the frame (sidebar + pane + pane header + entity
 * identity) is demonstrated end to end while each module's real experience is still
 * a later roadmap item. It builds none of the product experience (no collections,
 * reads, forms, boards, cards or filters).
 */

import type { EntityType } from "~/shared/entity";

import { PaneHeader } from "./PaneHeader";

export type ModulePlaceholderProps = {
  /** The module's display name (the user's noun, e.g. "Areas"). */
  readonly name: string;
  /** One sentence describing the module's future role. */
  readonly summary: string;
  /** Optional entity type, to show the module's identity glyph in the header. */
  readonly entityType?: EntityType;
};

export function ModulePlaceholder({
  name,
  summary,
  entityType,
}: ModulePlaceholderProps) {
  return (
    <div className="dh-module-placeholder">
      <PaneHeader title={name} entityType={entityType} subtitle={summary} />
      <div className="dh-pane-body">
        <p className="muted">
          This is a routing placeholder. The {name} experience is built in its
          own roadmap phase — PX-02 establishes the application frame (sidebar,
          pane, pane header and entity identity) that will host it.
        </p>
      </div>
    </div>
  );
}
