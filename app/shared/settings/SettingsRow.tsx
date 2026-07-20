/**
 * DS-10b Settings layout — an individual setting row.
 *
 * ONE row = one setting. It lays out a TEXT block (label · supporting description ·
 * optional status/help line) beside a CONTROL area. Label/description and control
 * sit side-by-side when the container is wide enough and stack cleanly when it is
 * narrow (a container query, so it is correct in a 320px Drawer and a full route
 * alike) — with no horizontal overflow and no clipped text.
 *
 * The row is entity-agnostic and control-agnostic: the control area accepts any
 * accessible React content — a bare native switch/checkbox/select, a DS-06 field,
 * a button, a command/action control, or a module-owned custom control.
 *
 * Two accessible-naming patterns, both first-class:
 *   1. ROW-OWNED name (recommended for bare controls such as a switch/select):
 *      pass `label`; the row renders the visible name and passes association ids
 *      to a render-prop `control`, which wires `aria-labelledby`/`aria-describedby`
 *      onto the bare control. No double label.
 *   2. SELF-NAMED control (a DS-06 field with its own label, or a button):
 *      render it directly. Give the row a `label` only for the descriptive text
 *      that belongs BESIDE it (as with a dangerous action's button), or omit the
 *      row `label` entirely and let the control name itself.
 */

import { useId, type ReactNode } from "react";

import type { SettingsStatusTone } from "./types";

/** The association ids the row hands to a render-prop control. */
export interface SettingsControlIds {
  /** A suggested `id` for the control element. */
  readonly controlId: string;
  /** The id of the visible label — wire as `aria-labelledby` on a bare control. */
  readonly labelId: string;
  /** The id of the description element, if any. */
  readonly descriptionId?: string;
  /** The id of the status element, if any. */
  readonly statusId?: string;
  /** description + status ids joined — wire as `aria-describedby`. */
  readonly describedById?: string;
}

export interface SettingsRowProps {
  /** The setting's visible name. Omit for a self-naming control rendered alone. */
  readonly label?: ReactNode;
  /** Supporting description under the label. */
  readonly description?: ReactNode;
  /** An optional status/help line under the control (validation, hints, results). */
  readonly status?: ReactNode;
  /** Tone for the status line (icon/shape + text carry meaning, never colour alone). */
  readonly statusTone?: SettingsStatusTone;
  /**
   * When true, the status line is a polite live region so an async status change
   * (e.g. "Saved") is announced. Uses bare `aria-live` (never `role="status"`), so
   * it never shadows another status region — the DS-10 feedback convention.
   */
  readonly statusLive?: boolean;
  /**
   * The control. Either a node (self-naming control, or a bare control you have
   * already associated), or a render-prop receiving association ids to wire onto a
   * bare control (`id`, `aria-labelledby`, `aria-describedby`).
   */
  readonly control: ReactNode | ((ids: SettingsControlIds) => ReactNode);
  /** Vertical alignment of the control against the text block. Defaults to `center`. */
  readonly align?: "center" | "start";
  readonly className?: string;
}

const STATUS_TONE_CLASS: Record<SettingsStatusTone, string> = {
  neutral: "dh-settings-row__status--neutral",
  success: "dh-settings-row__status--success",
  warning: "dh-settings-row__status--warning",
  danger: "dh-settings-row__status--danger",
};

export function SettingsRow({
  label,
  description,
  status,
  statusTone = "neutral",
  statusLive = false,
  control,
  align = "center",
  className,
}: SettingsRowProps) {
  const controlId = useId();
  const labelId = useId();
  const descriptionId = useId();
  const statusId = useId();

  const hasDescription = description != null && description !== false;
  const hasStatus = status != null && status !== false;

  const describedById =
    [hasDescription ? descriptionId : null, hasStatus ? statusId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  const ids: SettingsControlIds = {
    controlId,
    labelId,
    descriptionId: hasDescription ? descriptionId : undefined,
    statusId: hasStatus ? statusId : undefined,
    describedById,
  };

  const classes = ["dh-settings-row"];
  if (align === "start") {
    classes.push("dh-settings-row--align-start");
  }
  if (!label) {
    classes.push("dh-settings-row--control-only");
  }
  if (className) {
    classes.push(className);
  }

  return (
    <div className={classes.join(" ")}>
      {label ? (
        <div className="dh-settings-row__text">
          <span id={labelId} className="dh-settings-row__label">
            {label}
          </span>
          {hasDescription ? (
            <span id={descriptionId} className="dh-settings-row__description">
              {description}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="dh-settings-row__control">
        {typeof control === "function" ? control(ids) : control}
        {hasStatus ? (
          <span
            id={statusId}
            className={`dh-settings-row__status ${STATUS_TONE_CLASS[statusTone]}`}
            aria-live={statusLive ? "polite" : undefined}
          >
            {status}
          </span>
        ) : null}
      </div>
    </div>
  );
}
