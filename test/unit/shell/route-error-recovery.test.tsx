/**
 * MOBILE-05 — what the route error boundary offers as a way out.
 *
 * The boundary had no test at all, which is how it kept "Go to Today" as its
 * only action through three passes. That single action is right for a mistyped
 * URL and wrong for the two failures a phone actually hits — a sign-in that
 * expired between one tap and the next, and a request that did not survive a bad
 * connection. In both, sending the owner to a home screen loses the thing they
 * were doing, which the 3.1 brief (§43) names and forbids.
 *
 * Three claims, and each is a way the surface could silently go back to being a
 * dead end:
 *
 *   1. a 401/403 SAYS the sign-in expired and says the device's work is safe,
 *      rather than reporting it as a generic fault the owner cannot act on;
 *   2. the recovery goes to the URL the owner was already on — which is the
 *      whole mechanism, because a document request to a protected URL is what
 *      makes Cloudflare Access redirect and return them here;
 *   3. a 404 still offers only Today, because there is nothing to come back to.
 *
 * What this cannot test is Access itself. That it returns the browser to the
 * requested URL is Cloudflare's documented behaviour, exercised by the real
 * deployment, and is recorded as such in `APP_SHELL_AUTH.md` rather than faked
 * here.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ErrorBoundary } from "~/root";

/** The shape React Router hands the boundary for a thrown `Response`. */
function routeError(status: number, statusText = "") {
  return {
    status,
    statusText,
    internal: false,
    data: null,
  } as unknown as Parameters<typeof ErrorBoundary>[0]["error"];
}

/**
 * Render the boundary.
 *
 * The prop type is React Router's generated route-args union, which enumerates
 * every route's params. Constructing a member of it by hand adds nothing — the
 * boundary reads `error` and nothing else — so the whole prop bag is cast once,
 * here, rather than the test pretending to know which route it is standing in
 * for.
 */
function renderBoundary(error: unknown) {
  const props = {
    error,
    params: {},
    loaderData: undefined,
    actionData: undefined,
    matches: [],
  } as unknown as Parameters<typeof ErrorBoundary>[0];
  return render(<ErrorBoundary {...props} />);
}

describe("recovering from a route error on a phone", () => {
  it("names an expired sign-in, and says the device's work is safe", () => {
    renderBoundary(routeError(401));

    expect(
      screen.getByRole("heading", { name: /sign-in has expired/i }),
    ).toBeInTheDocument();
    // The owner is told the queued work survives. Without this the honest
    // behaviour (nothing is discarded) is invisible, and the natural assumption
    // from "your sign-in expired" is that the capture went with it.
    expect(screen.getByText(/safe and will send itself/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Sign in and continue" }),
    ).toBeInTheDocument();
  });

  it("treats a 403 the same way — the recovery does not depend on which it was", () => {
    renderBoundary(routeError(403));
    expect(
      screen.getByRole("link", { name: "Sign in and continue" }),
    ).toBeInTheDocument();
  });

  it("points the recovery at the URL the owner was already on", () => {
    // The mechanism, not a detail: Access redirects a DOCUMENT request to a
    // protected URL and returns the browser to that URL afterwards. A recovery
    // aimed anywhere else would sign the owner in and still lose their place.
    window.history.pushState({}, "", "/meeting/mp-42?tab=notes");
    renderBoundary(routeError(401));

    const link = screen.getByRole("link", { name: "Sign in and continue" });
    expect(link.getAttribute("href")).toContain("/meeting/mp-42?tab=notes");
  });

  it("offers a retry of the same page for an ordinary failure", () => {
    window.history.pushState({}, "", "/tasks");
    renderBoundary(routeError(500));

    const link = screen.getByRole("link", { name: "Try again" });
    expect(link.getAttribute("href")).toContain("/tasks");
    // Today stays reachable as the secondary way out — a retry that keeps
    // failing must not be the only control on the screen.
    expect(screen.getByRole("link", { name: "Go to Today" })).toHaveAttribute(
      "href",
      "/today",
    );
  });

  it("offers only Today for a 404, because there is nothing to come back to", () => {
    renderBoundary(routeError(404));

    expect(
      screen.getByRole("heading", { name: /couldn’t find that page/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("route-error-recover")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Go to Today" }),
    ).toBeInTheDocument();
  });
});
