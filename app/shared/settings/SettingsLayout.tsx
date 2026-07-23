/**
 * DS-10b Settings layout — the surface root.
 *
 * `SettingsLayout` is the entity-agnostic container every settings surface uses,
 * at ANY scope: a full settings route, a workspace pane, a Drawer, the shared
 * Inspector, or the last tab/section of a record. It contributes ONE thing beyond
 * a `<section>` region: an optional surface heading + description, and consistent
 * vertical rhythm between its `SettingsGroup` children.
 *
 * It adapts to its CONTAINER, not the viewport (via the stylesheet's container
 * query), so the SAME layout works whether it is 320px wide inside a Drawer or
 * full-width in a route. It reads only DS-01 tokens.
 */

import { useEffect, useId, useRef, type ReactNode } from "react";

export interface SettingsLayoutProps {
  /**
   * The surface heading. Omit when the surface's heading is supplied by its host
   * (e.g. a Drawer/Inspector title, or a record tab whose heading is the tab).
   */
  readonly title?: ReactNode;
  /** Supporting description shown under the heading. */
  readonly description?: ReactNode;
  /**
   * The heading level for `title` (2–6). Defaults to `2`. Lower it to fit the
   * surrounding document outline (e.g. `3` inside a record tab under an `h2`).
   */
  readonly headingLevel?: 2 | 3 | 4 | 5 | 6;
  /**
   * An accessible name for the region when no visible `title` is rendered. When a
   * `title` is present it labels the region automatically.
   */
  readonly "aria-label"?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function SettingsLayout({
  title,
  description,
  headingLevel = 2,
  "aria-label": ariaLabel,
  children,
  className,
}: SettingsLayoutProps) {
  const headingId = useId();
  const Heading = `h${headingLevel}` as const;
  const rootRef = useRef<HTMLElement | null>(null);

  // Focus safety net (PROJ-05 Slice 4). A settings surface commonly swaps its
  // groups conditionally on a mutation's outcome — e.g. Project Settings
  // replaces its whole "Archive" group (a `DangerousAction` + its owned
  // `ConfirmationDialog`) with a "Restore" group (a different
  // `ConfirmationDialog` instance) once archiving succeeds, and the reverse
  // after restoring. When that swap removes the currently-focused trigger, a
  // browser resets focus to `<body>` — and the DIALOG itself cannot reclaim it,
  // because the swap unmounts the dialog (and its own post-close restoration
  // effect) in the SAME commit as the trigger, before it could ever notice.
  // `SettingsLayout` is the stable ANCESTOR that survives every such swap (its
  // children change; it does not), so it is the right place to notice and
  // recover.
  //
  // The fallback is deliberately LOCAL, never a global page region:
  // `SettingsLayout` is also hosted inside a modal Drawer/Inspector, whose
  // background (including any page `#main-content`) is made `inert` while
  // open — focusing a global region could fail outright or, worse, escape the
  // modal's focus boundary. Focusing THIS layout's own root instead always
  // stays wherever the layout itself is legitimately mounted (in a modal's
  // un-inerted subtree, or the full page). It also only acts when the element
  // that vanished was tracked as having been focused WITHIN this layout in the
  // first place — an unrelated mutation elsewhere on the page, or `<body>`
  // being focused for an unconnected reason, never has its focus hijacked.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof document === "undefined") {
      return;
    }
    let lastFocused: HTMLElement | null = null;
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && root.contains(event.target)) {
        lastFocused = event.target;
      }
    };
    root.addEventListener("focusin", onFocusIn);

    const reclaimIfOrphaned = () => {
      if (!lastFocused || lastFocused.isConnected) {
        return;
      }
      // The tracked element is gone. Whether or not we act on it now, it can
      // never be a valid target again — discard it unconditionally, so a
      // control removed WHILE focus had already moved elsewhere can never be
      // replayed against a later, unrelated mutation once focus happens to
      // land on <body> for some other reason.
      lastFocused = null;
      if (document.activeElement !== document.body) {
        return;
      }
      root.focus({ preventScroll: true });
    };
    const observer = new MutationObserver(reclaimIfOrphaned);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      root.removeEventListener("focusin", onFocusIn);
      observer.disconnect();
    };
  }, []);

  return (
    <section
      ref={rootRef}
      // Not a tab stop (not in the natural tab order) — only a programmatic
      // focus target for the safety net above, mirroring how the app shell's
      // `#main-content` region is focusable without being tabbable.
      tabIndex={-1}
      className={className ? `dh-settings ${className}` : "dh-settings"}
      aria-labelledby={title ? headingId : undefined}
      aria-label={title ? undefined : ariaLabel}
    >
      {title ? (
        <header className="dh-settings__header">
          <Heading id={headingId} className="dh-settings__title">
            {title}
          </Heading>
          {description ? (
            <p className="dh-settings__description">{description}</p>
          ) : null}
        </header>
      ) : null}
      <div className="dh-settings__groups">{children}</div>
    </section>
  );
}
