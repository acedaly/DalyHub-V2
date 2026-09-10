/**
 * UNTITLED-01 — the bridge between React Aria's navigation and React Router.
 *
 * Untitled UI is built on React Aria Components, and every navigable thing it
 * renders — a nav item, a link button, a breadcrumb, a menu item with an `href`,
 * a table row link — goes through React Aria's `<Link>` rather than React
 * Router's. Without this provider those all fall through to the browser's own
 * navigation: a full document request, a white flash, the shell remounted, the
 * scroll position lost, and every one of DalyHub's `shouldRevalidate` decisions
 * bypassed.
 *
 * `RouterProvider` is React Aria's supported answer. It gives the whole tree one
 * `navigate` function, so an `href` on ANY React Aria component becomes a
 * client-side navigation and behaves exactly like a React Router `<Link>` — which
 * is what keeps AGENTS.md §6's "never lose the user's place" true for the
 * migrated surfaces.
 *
 * Two details matter and are easy to get wrong:
 *
 *   · `useHref` is passed as well as `navigate`. It is what makes the rendered
 *     `<a href>` correct — so middle-click, ⌘-click and "copy link address" give
 *     a real URL — while the click handler stays client-side.
 *   · Modifier-clicks and external links are handled by React Aria itself before
 *     `navigate` is called, so there is nothing to special-case here.
 *
 * Mounted once, at the document root, so it also covers the error boundary and
 * any surface rendered outside the authenticated shell.
 */

import type { ReactNode } from "react";
import { RouterProvider } from "react-aria-components";
import { useHref, useNavigate, type NavigateOptions } from "react-router";

declare module "react-aria-components" {
  /**
   * Type the options React Aria forwards to `navigate`, so a call site can pass
   * React Router's navigation options (`replace`, `state`, `preventScrollReset`)
   * through a React Aria component and still be type-checked.
   */
  interface RouterConfig {
    routerOptions: NavigateOptions;
  }
}

export function AriaRouterProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  return (
    <RouterProvider navigate={navigate} useHref={useHref}>
      {children}
    </RouterProvider>
  );
}
