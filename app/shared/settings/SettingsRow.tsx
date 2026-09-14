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
 *
 * ── UNTITLED-18 — the paint is Untitled's, and the separator is not the row's ─
 *
 * The type roles are the ones every other Untitled form row in the product uses:
 * `text-sm font-medium text-secondary` for the name, `text-sm text-tertiary` for
 * the supporting line — which is `base/input`'s `Label` + `HintText` pairing, the
 * same pairing a settings form gets when the control brings its own label.
 *
 * The row no longer draws its own hairline. `SettingsGroup` owns the separators
 * (`[&>*+*]:border-t`), because a rule between two rows belongs to the thing that
 * knows there ARE two rows — and because the previous arrangement needed a
 * `.dh-settings-group__rows > .dh-settings-row + .dh-settings-row` selector, plus
 * a second copy of it for the danger tone, to express one idea.
 *
 * `wrap-anywhere`, not `break-words`, and the difference is load-bearing:
 * `overflow-wrap: anywhere` reduces an element's MIN-CONTENT width and
 * `break-word` does not. MEASURED at 320px on Privacy & data, whose copy names
 * `docs/development/WORKSPACE_DELETION.md`: with `break-words` the text block
 * reported a 331px minimum inside a 288px column and the DOCUMENT scrolled
 * sideways. The rule this replaced said `anywhere` and said why; the Tailwind
 * translation has to say it too.
 *
 * `dh-settings-row`, `dh-settings-row__label` and `dh-settings-row__control`
 * carry NO rules in any stylesheet and are kept as LOCATOR HOOKS, the same
 * device `dh-pcard*` and `dh-switch__thumb` are. Two end-to-end contracts need
 * to address the two HALVES of a row and there is no role for either: the
 * calendar suite scopes a row by its label text rather than by position (a
 * positional locator silently acts on the wrong calendar the moment creation
 * order changes), and the Settings suite proves a row's control never repeats
 * the row's own label — the double-label defect this component's two naming
 * patterns exist to prevent. A hook that is only ever read is cheaper than
 * either test asserting nothing.
 */

import { useId, type ReactNode } from "react";

import { cx } from "~/shared/ui/untitled/utils/cx";

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
  neutral: "text-tertiary",
  success: "text-success-primary",
  warning: "text-warning-primary",
  danger: "text-error-primary",
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

  return (
    <div
      className={cx(
        "dh-settings-row flex min-w-0 flex-wrap justify-between gap-x-5 gap-y-3 py-4",
        align === "start" ? "items-start" : "items-center",
        /*
         * The narrow arm is a CONTAINER query, not a media query: this row is
         * drawn at 320px inside a Drawer on a 1440px display exactly as often as
         * it is on a phone, and only the container knows which.
         */
        "@max-[32rem]:flex-col @max-[32rem]:items-stretch @max-[32rem]:gap-2",
        className,
      )}
    >
      {label ? (
        <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-1">
          <span
            id={labelId}
            className="dh-settings-row__label text-sm font-medium wrap-anywhere text-secondary"
          >
            {label}
          </span>
          {hasDescription ? (
            <span
              id={descriptionId}
              className="text-sm wrap-anywhere text-tertiary"
            >
              {description}
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        className={cx(
          "dh-settings-row__control flex min-w-0 flex-col items-start gap-1",
          label ? "flex-[0_1_auto]" : "w-full flex-[1_1_100%]",
          "@max-[32rem]:w-full @max-[32rem]:items-stretch",
        )}
      >
        {typeof control === "function" ? control(ids) : control}
        {hasStatus ? (
          <span
            id={statusId}
            className={cx(
              "text-xs wrap-anywhere",
              STATUS_TONE_CLASS[statusTone],
            )}
            aria-live={statusLive ? "polite" : undefined}
          >
            {status}
          </span>
        ) : null}
      </div>
    </div>
  );
}
