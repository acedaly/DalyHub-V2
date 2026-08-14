/**
 * DS-02 — the DalyHub generic UI primitive layer.
 *
 * ONE clear generic path for each common interaction. If you are about to write
 * a `<button className="dh-btn …">`, a bare styled `<input>`, a hand-rolled
 * dropdown or a `div` with a border and a radius, the thing you want is in here.
 *
 * ── The boundary this directory enforces (DS-01 §6) ──────────────────────────
 *
 * A GENERIC component knows about interaction, layout and tokens. It knows
 * nothing about Areas, Goals, Projects, Tasks, People, priorities, overdue
 * dates, health evaluation or capture. It may not import from a module. A
 * PRODUCT component knows the domain and composes these; never the reverse.
 *
 * DS-01 finding 6 was that generic and product components were mixed by
 * directory, so nothing stopped a product rule landing in a generic component.
 * This directory is the answer, and `ConfirmationDialog` moving here out of
 * `shared/settings` is the first debt it pays.
 *
 * ── What is NEW here, and what is re-exported ────────────────────────────────
 *
 * DS-01 audited every primitive and classified almost all of them KEEP or
 * KEEP + RESTYLE: the hard interaction behaviours — focus management,
 * background inertness, scroll locking, drawer stacking, anchored placement with
 * collision handling, roving focus, typeahead, the phone-sheet fallback — are
 * already built, tested and better than a naive library adoption would be. DS-02
 * did not rewrite them to make this barrel look complete. It restyled them onto
 * the DalyHub token layer and gave them their DalyHub-owned names here.
 *
 *   NEW in DS-02      Button · ButtonLink · IconButton · Input · Textarea ·
 *                     Select · Checkbox · Badge · Card
 *   MOVED in DS-02    ConfirmationDialog (out of `shared/settings`)
 *   RE-EXPORTED       Menu · Popover · Dialog machinery · Drawer · Sheet ·
 *                     Tabs · Tooltip · Switch
 *
 * A re-export is not a rename for its own sake. It is the statement that THIS is
 * the supported path — so a call site reads `Menu` from `~/shared/ui` and never
 * has to know that the implementation is 500 lines of tested overflow-menu
 * machinery, or care when DS-03 moves it.
 */

/* ── Actions ──────────────────────────────────────────────────────────────── */

export {
  Button,
  ButtonLink,
  buttonClassName,
  type ButtonProps,
  type ButtonLinkProps,
  type ButtonSize,
  type ButtonVariant,
} from "./Button";
export {
  IconButton,
  type IconButtonProps,
  type IconButtonSize,
  type IconButtonVariant,
} from "./IconButton";

/* ── Data entry ───────────────────────────────────────────────────────────── */

export { Input, Textarea, type InputProps, type TextareaProps } from "./Input";
export { Select, type SelectProps } from "./Select";
export { Checkbox, type CheckboxProps } from "./Checkbox";
/**
 * The switch, from its existing home. One switch since M3-INT, and a switch is
 * a form control rather than a primitive of its own — but a caller looking for
 * "the on/off control" should find it here rather than having to know it lives
 * under `forms/`.
 */
export { Switch, type SwitchProps } from "~/shared/forms/Switch";

/* ── Display ──────────────────────────────────────────────────────────────── */

export {
  Badge,
  type BadgeProps,
  type BadgeTone,
  type BadgeVariant,
} from "./Badge";
/**
 * The generic bounded surface. Exported as `Card` — its module-local name is
 * `SurfaceCard` so a file importing both this and `~/shared/card`'s RECORD card
 * can tell them apart.
 */
export {
  SurfaceCard as Card,
  SurfaceCard,
  type SurfaceCardProps,
  type SurfaceCardProps as CardProps,
  type CardPadding,
  type CardVariant,
} from "./Card";

/* ── Overlays ─────────────────────────────────────────────────────────────── */

/**
 * The MENU. `OverflowMenu` is DalyHub's menu: roving focus, typeahead,
 * collision-aware placement, a phone sheet below `md`, Escape and outside-click.
 * DS-01 kept it precisely because it is larger than a library's menu — it does
 * more. `Menu` is what a call site should type.
 */
export {
  OverflowMenu as Menu,
  OverflowMenu,
  type OverflowMenuItem as MenuItem,
  type OverflowMenuItem,
  type OverflowMenuItemTone as MenuItemTone,
  type OverflowMenuProps as MenuProps,
  type OverflowMenuProps,
} from "~/shared/overflow-menu";

/**
 * The POPOVER. `AnchoredSurface` (ADR-087) is one overlay layer on its own
 * z-rung above modal — so a drawer's inline editor is not painted behind the
 * drawer — with viewport collision handling and a phone-sheet fallback.
 */
export {
  AnchoredSurface as Popover,
  AnchoredSurface,
  type AnchoredSurfaceProps as PopoverProps,
  type AnchoredSurfaceProps,
} from "~/shared/anchored";

/**
 * The DIALOG. `ConfirmationDialog` is the product's modal: the WAI-ARIA
 * modal-dialog contract over the DS-03 focus-trap / inert-background /
 * scroll-lock machinery, with an optional typed confirmation and a single-flight
 * phase that prevents a duplicate submit.
 */
export {
  ConfirmationDialog,
  type ConfirmationDialogProps,
  type TypedConfirmationConfig,
} from "./ConfirmationDialog";
export {
  canConfirm,
  initConfirmation,
  matchesConfirmationPhrase,
  reduceConfirmation,
} from "./confirmation";

/**
 * The DRAWER and the SHEET — the two adaptive surfaces. The drawer is
 * URL-driven, stackable, focus-managed and scroll-locked; the sheet is the
 * phone half of every adaptive pattern.
 *
 * Use a sheet where a desktop popover has no room, not as a default. DS-02 does
 * not turn dialogs into drawers: a dialog that fits on a phone is still a
 * dialog.
 */
export { Sheet, type SheetProps } from "~/shared/sheet";

/* ── Navigation within a surface ──────────────────────────────────────────── */

/**
 * TABS. `ViewTabs` is the shared tab strip; `RecordTabs` (`~/shared/record-
 * layout`) is the record header's, which additionally overflows into a menu.
 * Both are keyboard-complete and both take the DS-02 compact treatment.
 */
export {
  ViewTabs as Tabs,
  ViewTabs,
  type ViewTabsProps as TabsProps,
  type ViewTabsProps,
} from "~/shared/view-switcher";

/* ── Supporting ───────────────────────────────────────────────────────────── */

export {
  Tooltip,
  composeRefs,
  type TooltipProps,
  type TooltipTriggerProps,
} from "~/shared/tooltip";
