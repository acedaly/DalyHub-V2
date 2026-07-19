/**
 * PX-02 shell — the sidebar brand/workspace header.
 *
 * The top of the persistent sidebar: the DalyHub brand mark plus the current
 * workspace name. It anchors the frame's identity (PRODUCT_EXPERIENCE #1, #18). It
 * is the application's `banner` landmark — one per document, and correctly NOT
 * nested in `<main>` (the Pane Header lives inside main and is a generic header).
 *
 * The workspace name is plain, safe text (server-derived); the mark is decorative.
 * A future workspace switcher slots in here without a redesign.
 */

import { BrandMark } from "~/shared/icons";

export type SidebarBrandProps = {
  /** The current workspace's display name. */
  readonly workspaceName: string;
};

export function SidebarBrand({ workspaceName }: SidebarBrandProps) {
  return (
    <header className="dh-sidebar__brand">
      <span className="dh-sidebar__brand-mark" aria-hidden="true">
        <BrandMark />
      </span>
      <span className="dh-sidebar__brand-name">{workspaceName}</span>
    </header>
  );
}
