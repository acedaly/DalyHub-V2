/**
 * PX-02 shell — the sidebar brand/workspace header, rebuilt by BRAND-01.
 *
 * The top of the persistent sidebar. It anchors the frame's identity
 * (PRODUCT_EXPERIENCE #1, #18).
 *
 * It used to BE the application's `banner`. The banner is now the top app bar,
 * which is what a top app bar is, and this block is contained by the drawer's
 * own `navigation` landmark instead — so it is still inside a landmark (axe's
 * `region` rule) without claiming to be one.
 *
 * ── What changed, and why ────────────────────────────────────────────────────
 * This used to render the WORKSPACE NAME as the only text. That happened to look
 * right because the default workspace is called "DalyHub", but it meant the
 * product brand was whatever a workspace happened to be named: rename the
 * workspace to "Home" and DalyHub silently stopped calling itself DalyHub
 * anywhere in the frame.
 *
 * So the product name is now stated deliberately and always. A workspace with a
 * name of its own is shown UNDER it as secondary context, in the quieter text
 * token — present, subordinate, and never a substitute for the brand. A workspace
 * that is simply called "DalyHub" adds nothing and is omitted, so the common case
 * stays a single line and the rail stays compact.
 *
 * No tagline here. "Your life. Connected." belongs on About and the installation
 * surfaces, which have the room for it; in a navigation rail it is decoration
 * competing with the thing the owner actually came for.
 *
 * The workspace name is plain, safe text (server-derived); the mark is decorative
 * because "DalyHub" is written beside it as real text. A future workspace
 * switcher slots into the secondary line without a redesign.
 *
 * ── UNTITLED-02 ─────────────────────────────────────────────────────────────
 * The `dh-sidebar__brand*` class family is gone; the layout is Untitled's type
 * and colour tokens directly. The MARK is untouched — it is the one piece of the
 * frame that is unmistakably this product, and the migration replaces generic
 * chrome, not identity. Collapsed, the mark stands alone and the text is hidden
 * with the visually-hidden technique rather than removed, so the accessible name
 * survives at every width.
 */

import { PRODUCT_NAME } from "~/shared/brand";
import { BrandMark } from "~/shared/icons";
import { cx } from "~/shared/ui/untitled/utils/cx";

export type SidebarBrandProps = {
  /** The current workspace's display name. */
  readonly workspaceName: string;
  /** Whether the rail is collapsed to glyphs. */
  readonly collapsed?: boolean;
};

export function SidebarBrand({
  workspaceName,
  collapsed = false,
}: SidebarBrandProps) {
  const workspaceIsDistinct =
    workspaceName.trim().length > 0 && workspaceName !== PRODUCT_NAME;

  return (
    <div
      data-testid="sidebar-brand"
      className={cx(
        "flex items-center gap-2.5",
        collapsed && "justify-center gap-0",
      )}
    >
      <span
        aria-hidden="true"
        data-testid="sidebar-brand-mark"
        className="flex size-7 shrink-0 items-center justify-center *:size-full"
      >
        <BrandMark />
      </span>
      <span className={cx("min-w-0 flex-1", collapsed && "sr-only")}>
        <span
          data-testid="sidebar-product-name"
          className="block truncate text-md font-semibold text-primary"
        >
          {PRODUCT_NAME}
        </span>
        {workspaceIsDistinct ? (
          <span
            data-testid="sidebar-workspace"
            className="block truncate text-xs text-tertiary"
          >
            {workspaceName}
          </span>
        ) : null}
      </span>
    </div>
  );
}
