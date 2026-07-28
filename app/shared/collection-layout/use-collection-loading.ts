/**
 * PX-06 — the ONE collection loading signal.
 *
 * A collection's loading state was inconsistent: only Diary passed `isLoading`,
 * so switching a segmented filter or a view on Notes, Projects, Goals, Tasks,
 * People, Assets, Meetings or Reviews left the *previous* list on screen with no
 * indication that a new one was on its way — the same interaction felt instant on
 * one surface and stuck on another.
 *
 * This hook is that signal, derived from the router rather than invented per
 * module: a navigation is "reloading this collection" when it is in flight and
 * targets the SAME pathname — i.e. the user changed a filter, a view or a page of
 * the collection they are already looking at. A navigation to a different route is
 * deliberately NOT reported: that page owns its own loading state, and swapping
 * the current list for a skeleton on the way out would be a flash, not feedback.
 *
 * A form submission (`state === "submitting"`) is also excluded — those are
 * optimistic mutations with their own DS-10 feedback, not a collection reload.
 */

import { useLocation, useNavigation } from "react-router";

/**
 * True while a same-route navigation is loading this collection's next result
 * set. Pass straight to `CollectionLayout`'s `isLoading`, which renders the
 * shared `CollectionSkeleton` and sets `aria-busy` on the content region.
 */
export function useCollectionLoading(): boolean {
  const navigation = useNavigation();
  const location = useLocation();
  if (navigation.state !== "loading" || !navigation.location) {
    return false;
  }
  // Same pathname → a filter/view/page change on this very collection.
  return navigation.location.pathname === location.pathname;
}
