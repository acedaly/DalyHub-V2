/**
 * PX-02 shell — the sidebar brand/workspace header, rebuilt by BRAND-01.
 *
 * The top of the persistent sidebar. It anchors the frame's identity
 * (PRODUCT_EXPERIENCE #1, #18) and is the application's `banner` landmark — one
 * per document, and correctly NOT nested in `<main>` (the Pane Header lives
 * inside main and is a generic header).
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
 */

import { PRODUCT_NAME } from "~/shared/brand";
import { BrandMark } from "~/shared/icons";

export type SidebarBrandProps = {
  /** The current workspace's display name. */
  readonly workspaceName: string;
};

export function SidebarBrand({ workspaceName }: SidebarBrandProps) {
  const workspaceIsDistinct = workspaceName.trim() !== PRODUCT_NAME;
  return (
    <header className="dh-sidebar__brand">
      <span className="dh-sidebar__brand-mark" aria-hidden="true">
        <BrandMark />
      </span>
      <span className="dh-sidebar__brand-text">
        <span className="dh-sidebar__brand-name">{PRODUCT_NAME}</span>
        {workspaceIsDistinct ? (
          <span className="dh-sidebar__brand-workspace">{workspaceName}</span>
        ) : null}
      </span>
    </header>
  );
}
