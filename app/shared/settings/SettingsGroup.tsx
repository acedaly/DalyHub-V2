/**
 * DS-10b Settings layout — a grouped settings section.
 *
 * `SettingsGroup` is a labelled `<section>` grouping related settings under a
 * title and optional description. It is the calm unit of structure between the
 * surface and the individual rows.
 *
 * ── UNTITLED-18 — a settings group is a SECTION, not a card ─────────────────
 *
 * DS-14 made it a card, on the reasoning that six groups separated by a rule and
 * 32px of air gave the page no structure the eye could hold. The structure was
 * the right diagnosis; the card was the wrong instrument, and it cost two things.
 *
 * First, FRAME INSIDE FRAME. The same component draws a record's Settings tab,
 * where the record panel is already a bounded card — so a control sat inside a
 * group card, inside a settings card, inside a record card: three borders and
 * three paddings contributing one piece of hierarchy between them. UNTITLED-12
 * and UNTITLED-16 both named this and neither could fix it without changing what
 * a group IS.
 *
 * Second, it is not what the source system does. Across the Untitled
 * Application-UI settings templates the grammar is identical and it is not a
 * stack of cards: a `section-header` (title, supporting text) over a divider,
 * then form rows, then the next section. Cards are reserved for tables and for
 * distinct objects — a payment method, a team member — not for "the four fields
 * that happen to be about dates".
 *
 * So the group is a section with a real heading and a rule beneath it. The
 * structure DS-14 wanted survives — a reader can still see where one group ends
 * and the next begins — and the frame does not, at any nesting depth.
 *
 * The heading is Untitled's `SectionHeading`: the vendored
 * `application/section-headers/section-label` anatomy with DalyHub's heading
 * LEVEL, so a settings group's title and every other section title in the
 * product are one decision made in one place.
 *
 * ── `tone="danger"`, and what it is NOT for ─────────────────────────────────
 *
 * `tone="danger"` renders the visually-separated, clearly-differentiated
 * DANGEROUS-settings region: a bordered, error-tinted region with a warning
 * glyph beside the heading. The differentiation is NEVER colour-only — the
 * heading text, the icon and the container all carry it.
 *
 * It is for actions that CANNOT BE UNDONE. A reversible lifecycle action —
 * archiving, disconnecting, clearing a local cache — is an ORDINARY group with a
 * `DangerousAction severity="reversible"` inside it. Painting a reversible
 * action as permanent destruction teaches the owner to discount the warning that
 * matters, which is the opposite of what a danger zone is for (AGENTS.md §15).
 *
 * The group itself owns no destructive behaviour — compose `DangerousAction`
 * rows inside it.
 */

import { useId, type ReactNode } from "react";

import { SectionHeading } from "~/shared/ui/untitled/overrides/section-heading";
import { cx } from "~/shared/ui/untitled/utils/cx";

import { DangerGlyph } from "./settings-icons";
import type { SettingsTone } from "./types";

export interface SettingsGroupProps {
  /** The section title (required — every group is labelled). */
  readonly title: ReactNode;
  /** Supporting description shown under the section title. */
  readonly description?: ReactNode;
  /** The heading level for the group title (2–6). Defaults to `3`. */
  readonly headingLevel?: 2 | 3 | 4 | 5 | 6;
  /**
   * `"danger"` renders the differentiated dangerous-settings region. Reserve it
   * for actions that cannot be undone; see the file header.
   */
  readonly tone?: SettingsTone;
  readonly children: ReactNode;
  readonly className?: string;
}

export function SettingsGroup({
  title,
  description,
  headingLevel = 3,
  tone = "default",
  children,
  className,
}: SettingsGroupProps) {
  const headingId = useId();
  const descriptionId = useId();
  const danger = tone === "danger";

  return (
    <section
      className={cx(
        "dh-settings-group flex min-w-0 flex-col gap-2",
        danger &&
          "rounded-xl bg-error-primary p-4 ring-1 ring-error_subtle ring-inset sm:p-5",
        className,
      )}
      aria-labelledby={headingId}
      aria-describedby={description ? descriptionId : undefined}
    >
      <SectionHeading
        id={headingId}
        descriptionId={description ? descriptionId : undefined}
        /*
         * `SectionHeading` offers ranks 2–4, which is every rank a settings
         * group legitimately takes: a full route puts it under the page `h1`
         * (2 or 3) and a record tab under the record `h1` and its tab (3 or 4).
         * A caller asking for 5 or 6 is describing a nesting depth this layout
         * does not have, so it is clamped rather than silently skipping a rank.
         */
        level={Math.min(headingLevel, 4) as 2 | 3 | 4}
        title={
          danger ? (
            <span className="flex min-w-0 items-center gap-2">
              <DangerGlyph className="shrink-0 text-fg-error-primary" />
              <span className="min-w-0">{title}</span>
            </span>
          ) : (
            title
          )
        }
        description={description}
        className={cx(
          "min-w-0",
          // The region carries its meaning in the heading text, the glyph AND
          // the container. Toning the type as well is what makes it read as one
          // warning rather than as a red decoration around ordinary settings.
          danger &&
            "*:text-error-primary [&_h2]:text-error-primary [&_h3]:text-error-primary [&_h4]:text-error-primary",
        )}
      />
      <div
        className={cx(
          "dh-settings-group__rows flex min-w-0 flex-col border-t",
          // One rule under the heading and one between each pair of rows. On the
          // danger region they take the error border, so the bounded region
          // reads as a single thing rather than as a tinted box with grey
          // internals.
          danger
            ? "border-error_subtle [&>*+*]:border-t [&>*+*]:border-error_subtle"
            : "border-secondary [&>*+*]:border-t [&>*+*]:border-secondary",
        )}
        role="group"
        aria-labelledby={headingId}
      >
        {children}
      </div>
    </section>
  );
}
