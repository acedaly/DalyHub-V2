/**
 * PX-02 — the one shared Empty State.
 *
 * DESIGN_SYSTEM.md → Empty States requires that "nothing here yet" always teaches
 * the next action, and PRODUCT_EXPERIENCE #14 unifies the previously-forked empty
 * renderings (RecordContent's `emptySlot`, Filters' `FilterEmptyState`) into ONE
 * component so future modules don't drift a third. It is entity-agnostic: a consumer
 * supplies an icon (usually an entity-identity glyph), a title, a one-sentence body,
 * and up to two actions.
 *
 * It is calm and centred in its content region — never full-screen theatre
 * (PRODUCT_EXPERIENCE Part V, Empty State). The icon is decorative; meaning is
 * carried by the heading and body text (AGENTS.md §15). The filtered-empty variant
 * is just this component configured with a "clear filters" recovery action.
 */

import { createElement } from "react";
import type { ReactNode } from "react";

import { EmptyState as UntitledEmptyState } from "~/shared/ui/untitled/application/empty-state/empty-state";
import { cx } from "~/shared/ui/untitled/utils/cx";
import { FeaturedIcon } from "~/shared/ui/untitled/foundations/featured-icon/featured-icon";

export type EmptyStateProps = {
  /** A decorative glyph (commonly an entity-identity icon). */
  readonly icon?: ReactNode;
  /** A richer illustration slot; takes precedence over `icon` when both are set. */
  readonly illustration?: ReactNode;
  /** The heading — what belongs here / what happened. */
  readonly title: string;
  /** Optional heading level for a correct outline (default 2). */
  readonly headingLevel?: 2 | 3;
  /** One calm sentence of context. */
  readonly description?: ReactNode;
  /** The single primary next action (a button or link node). */
  readonly primaryAction?: ReactNode;
  /** An optional secondary action. */
  readonly secondaryAction?: ReactNode;
  /**
   * PX-06 — `compact` tightens the rhythm for a small region (a Today widget, a
   * card-sized section) so a dashboard of quiet sections does not become a page
   * of full-height empty blocks. It is the SAME component and the same anatomy —
   * icon, title, one sentence, a next action — only denser, so a widget's empty
   * state still teaches the next step instead of degrading to a bare paragraph.
   */
  /**
   * RECORD-01 — `inline` is the RECORD-level absence: one calm, left-aligned
   * line, no icon, no centred block, no card.
   *
   * A record tab that is empty is not a collection that is empty. The
   * collection treatment — glyph, headline, sentence, primary button — teaches
   * a first-time owner where their Projects live, and it earns its space
   * there. Inside a record the same treatment restates a next action that is
   * already visible a few pixels above ("No open tasks / Add a task to start
   * moving this project forward" under an Add task control), in a block tall
   * enough to be the loudest thing in the panel.
   *
   * `inline` keeps the heading (the outline stays correct and assistive tech
   * still hears the region's state) and drops the theatre.
   */
  readonly size?: "default" | "compact" | "inline";
  readonly className?: string;
};

export function EmptyState({
  icon,
  illustration,
  title,
  headingLevel = 2,
  description,
  primaryAction,
  secondaryAction,
  size = "default",
  className,
}: EmptyStateProps) {
  /*
   * RECORD-01 — `inline` is the RECORD-level absence and is deliberately NOT
   * Untitled's empty state.
   *
   * Untitled's is always a centred block with a featured icon, which is right
   * for a collection and wrong inside a record tab: there the same treatment
   * restates a next action that is already visible a few pixels above, in a
   * block tall enough to be the loudest thing in the panel. This keeps the
   * heading — the outline stays correct and assistive tech still hears the
   * region's state — and drops the theatre.
   */
  if (size === "inline") {
    const Heading = `h${headingLevel}` as const;
    return (
      <div
        className={["dh-empty-state flex min-w-0 flex-col gap-1", className]
          .filter(Boolean)
          .join(" ")}
        data-size="inline"
      >
        <Heading className="dh-empty-state__title text-sm font-semibold text-secondary">
          {title}
        </Heading>
        {description ? (
          <p className="dh-empty-state__body m-0 text-sm text-tertiary">
            {description}
          </p>
        ) : null}
        {primaryAction || secondaryAction ? (
          <div className="dh-empty-state__actions mt-2 flex flex-wrap gap-2">
            {primaryAction}
            {secondaryAction}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <UntitledEmptyState
      size={size === "compact" ? "sm" : "md"}
      className={["dh-empty-state", className].filter(Boolean).join(" ")}
      data-size={size}
      data-untitled-source="application/empty-state"
    >
      {illustration || icon ? (
        <UntitledEmptyState.Header pattern="none">
          {illustration ? (
            /*
             * An ILLUSTRATION is already a picture and brings its own size and
             * frame; upstream's `Illustration` slot only takes one of its own
             * named artworks, so a DalyHub illustration renders directly here.
             */
            <div className="dh-empty-state__illustration z-1">
              {illustration}
            </div>
          ) : (
            /*
             * Untitled's `FeaturedIcon`, given DalyHub's own entity glyph. The
             * upstream component takes an icon COMPONENT or a rendered element,
             * and DalyHub's callers pass the latter
             * (`<EntityIcon type="goal" />`) because the glyph is chosen from
             * the entity's identity, not from an icon import.
             */
            <FeaturedIcon
              size="lg"
              theme="modern"
              color="gray"
              icon={icon}
              className="dh-empty-state__icon"
              aria-hidden="true"
            />
          )}
        </UntitledEmptyState.Header>
      ) : null}
      {/*
       * Upstream's `Content` is a `<main>`, for the same reason `Title` is an
       * `<h1>`: the component was drawn as a whole PAGE. DalyHub renders empty
       * states inside a record tab, a collection and a drawer, so it produced a
       * second `<main>` nested inside the shell's — two axe violations at once
       * (`landmark-no-duplicate-main` and `landmark-main-is-top-level`), on
       * every record with an empty tab.
       *
       * `role="presentation"` takes the element out of the accessibility tree as
       * a landmark and changes nothing else: it is a layout box, its contents
       * are announced exactly as before, and the vendored file — which
       * `scripts/vendor-untitled.mjs` regenerates — stays untouched.
       */}
      <UntitledEmptyState.Content role="presentation">
        {/*
         * Upstream's `Title` is an `<h1>`, which is correct for the standalone
         * page it was drawn for and wrong for an empty state inside a record
         * tab, a collection or a drawer — three of which can be on screen at
         * once.
         *
         * `aria-level` alone was not enough. It fixes what assistive technology
         * ANNOUNCES, and leaves a second literal `<h1>` in a document that
         * already has the record's own — which `record-lifecycle.spec.ts` found
         * by asking for "the level 1 heading" and getting two. So the ELEMENT
         * follows the caller's level too, drawn with upstream's own class
         * recipe rather than through a slot that hard-codes its tag. Nothing
         * about the appearance changes, and the vendored file — which
         * `scripts/vendor-untitled.mjs` regenerates — stays untouched.
         */}
        {createElement(
          `h${headingLevel}`,
          {
            className: cx(
              "dh-empty-state__title font-semibold text-primary",
              size === "compact" ? "text-md" : "text-lg",
            ),
          },
          title,
        )}
        {description ? (
          <UntitledEmptyState.Description className="dh-empty-state__body">
            {description}
          </UntitledEmptyState.Description>
        ) : null}
      </UntitledEmptyState.Content>
      {primaryAction || secondaryAction ? (
        <UntitledEmptyState.Footer className="dh-empty-state__actions flex-wrap justify-center">
          {primaryAction}
          {secondaryAction}
        </UntitledEmptyState.Footer>
      ) : null}
    </UntitledEmptyState>
  );
}
