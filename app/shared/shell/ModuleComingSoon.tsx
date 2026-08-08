/**
 * PX-03 — the "Coming Soon" module placeholder.
 *
 * Every future DalyHub module (Notes, Diary, Meetings, People, Assets, Reviews,
 * AI, Settings, Help) needs a real, navigable route TODAY so the application reads
 * as a complete platform, even though its product experience is a later roadmap
 * phase. This is that route's body: it composes the PX-02 Pane Header (title +
 * entity-identity glyph + one-sentence subtitle), plus a "Coming Soon" section
 * that honestly states the module isn't
 * built yet, names its roadmap phase, and lists the capabilities already planned
 * for it in ROADMAP_V2.md — never invented copy. No lorem ipsum.
 *
 * It builds no new visual language (PRODUCT_EXPERIENCE's "no bespoke empty state"
 * rule): the body reuses `.dh-pane-body`'s existing typography (`base.css`) and
 * only adds the small amount of new structure a labelled `<section>` + list needs.
 * It is entity-agnostic and content-only — no loader, no fetch, no client script —
 * so it inherits dark/light theming, responsive layout and keyboard operability
 * from the shell with no additional work, and a future roadmap item simply
 * replaces the route's body with the real module (this component is not reused by
 * the real thing).
 */

import { useId } from "react";

import type { EntityType } from "~/shared/entity";

import { PaneHeader } from "./PaneHeader";

export type ModuleComingSoonProps = {
  /** The module's display name (the user's noun, e.g. "Notes"). */
  readonly name: string;
  /** Optional entity type, to show the module's identity glyph in the header. */
  readonly entityType?: EntityType;
  /** One sentence: what the module will become (the Pane Header subtitle). */
  readonly summary: string;
  /** One short paragraph: where the module fits in DalyHub's model. */
  readonly fit: string;
  /** The roadmap phase/item(s) this module is planned under (e.g. "Phase 5 — Notes (NOTES-01 → NOTES-04)"). */
  readonly roadmapStatus: string;
  /** Planned capabilities, drawn directly from ROADMAP_V2.md — never invented. */
  readonly capabilities: readonly string[];
};

export function ModuleComingSoon({
  name,
  entityType,
  summary,
  fit,
  roadmapStatus,
  capabilities,
}: ModuleComingSoonProps) {
  const headingId = useId();

  return (
    <div className="dh-module-placeholder dh-coming-soon-page">
      <PaneHeader title={name} entityType={entityType} subtitle={summary} />
      <div className="dh-pane-body">
        <p className="lead">{fit}</p>

        <section className="dh-coming-soon" aria-labelledby={headingId}>
          <h2 id={headingId} className="dh-coming-soon__title">
            Coming Soon
          </h2>
          <p>
            {name} is not built yet. {roadmapStatus}
          </p>
          <p className="dh-coming-soon__label">Planned capabilities include:</p>
          <ul>
            {capabilities.map((capability) => (
              <li key={capability}>{capability}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
