/**
 * DS-10b Settings layout — a grouped settings section.
 *
 * `SettingsGroup` is a labelled `<section>` grouping related settings under a
 * title and optional description. It is the calm unit of structure between the
 * surface and the individual rows.
 *
 * `tone="danger"` renders the visually-separated, clearly-differentiated
 * DANGEROUS-settings region (border + tinted surface + a warning glyph beside the
 * heading). The differentiation is NEVER colour-only: the heading text, the icon
 * and the border all carry the meaning. The group itself owns no destructive
 * behaviour — compose `DangerousAction` rows inside it.
 */

import { useId, type ReactNode } from "react";

import { DangerGlyph } from "./settings-icons";
import type { SettingsTone } from "./types";

export interface SettingsGroupProps {
  /** The section title (required — every group is labelled). */
  readonly title: ReactNode;
  /** Supporting description shown under the section title. */
  readonly description?: ReactNode;
  /** The heading level for the group title (2–6). Defaults to `3`. */
  readonly headingLevel?: 2 | 3 | 4 | 5 | 6;
  /** `"danger"` renders the differentiated dangerous-settings region. */
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
  const Heading = `h${headingLevel}` as const;
  const danger = tone === "danger";

  const classes = ["dh-settings-group"];
  if (danger) {
    classes.push("dh-settings-group--danger");
  }
  if (className) {
    classes.push(className);
  }

  return (
    <section
      className={classes.join(" ")}
      aria-labelledby={headingId}
      aria-describedby={description ? descriptionId : undefined}
    >
      <header className="dh-settings-group__header">
        <Heading id={headingId} className="dh-settings-group__title">
          {danger ? (
            <DangerGlyph className="dh-settings-group__title-icon" />
          ) : null}
          <span>{title}</span>
        </Heading>
        {description ? (
          <p id={descriptionId} className="dh-settings-group__description">
            {description}
          </p>
        ) : null}
      </header>
      <div
        className="dh-settings-group__rows"
        role="group"
        aria-labelledby={headingId}
      >
        {children}
      </div>
    </section>
  );
}
