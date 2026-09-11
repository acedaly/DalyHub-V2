/**
 * UNTITLED-04 — a drawer trigger drawn as a real button.
 *
 * `DrawerTrigger` is the bare anchor: a genuine `href` to the drawer's own URL,
 * intercepted on a plain left-click so the drawer opens in place. Every
 * collection then dressed it by hand with a raw `dh-btn dh-btn--primary`
 * string, which is how the product's most prominent control — the one create action on
 * a collection — ended up being the one control that never reached the
 * Untitled-backed `Button`.
 *
 * This composes the two: the same URL contract, the same click interception,
 * the same middle-click and "open in new tab" behaviour, drawn by
 * `ButtonLink` — which renders Untitled's `base/buttons/button` through a React
 * Aria `Link`. Nothing about the drawer's stack, focus or history semantics
 * changes; only what the trigger looks like.
 */

import type { MouseEvent, ReactNode } from "react";

import { ButtonLink } from "~/shared/ui";
import type { ButtonLinkProps } from "~/shared/ui";

import { useDrawerContext } from "./drawer-context";
import type { DrawerKey } from "./types";

export interface DrawerButtonProps extends Omit<
  ButtonLinkProps,
  "href" | "children"
> {
  /** The record key to open. */
  readonly drawerKey: DrawerKey;
  readonly children: ReactNode;
}

export function DrawerButton({
  drawerKey,
  children,
  onClick,
  ...rest
}: DrawerButtonProps) {
  const { openDrawer, buildOpenHref } = useDrawerContext();

  return (
    <ButtonLink
      href={buildOpenHref(drawerKey)}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        openDrawer(drawerKey);
      }}
      {...rest}
    >
      {children}
    </ButtonLink>
  );
}
