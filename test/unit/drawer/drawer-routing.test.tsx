/**
 * DS-03 — the Drawer routing/URL contract (controller behaviour).
 *
 * Proves that every drawer change is a real URL transition: opening adds a drawer
 * parameter (preserving existing query), closing removes the top level, closing
 * all clears them, replacing swaps the top in place, a copied/reloaded deep link
 * restores the full stack, and ordinary navigation to another page exits the
 * stack. Real browser Back/Forward is exercised end to end in Playwright.
 */

import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DrawerProvider, useDrawer } from "~/shared/drawer";
import { DRAWER_PUSH_STATE_KEY } from "~/shared/drawer/drawer-url";
import type { DrawerEntry, DrawerRenderResult } from "~/shared/drawer";

const renderContent = (entry: DrawerEntry): DrawerRenderResult => ({
  title: `Record ${entry.key}`,
  children: <p>Body {entry.key}</p>,
});

function Controls() {
  const { openDrawer, closeDrawer, closeAll, replaceDrawer, depth, topKey } =
    useDrawer();
  return (
    <div>
      <button type="button" onClick={() => openDrawer("rec:a")}>
        open-a
      </button>
      <button type="button" onClick={() => openDrawer("rec:b")}>
        open-b
      </button>
      <button type="button" onClick={() => replaceDrawer("rec:z")}>
        replace-z
      </button>
      <button type="button" onClick={() => closeDrawer()}>
        close-top
      </button>
      <button type="button" onClick={() => closeAll()}>
        close-all
      </button>
      <Link to="/elsewhere">go elsewhere</Link>
      <span data-testid="depth">{depth}</span>
      <span data-testid="topkey">{topKey ?? "none"}</span>
    </div>
  );
}

function Probe() {
  const location = useLocation();
  return (
    <div data-testid="loc">
      {`${location.pathname}${location.search}${location.hash}`}
    </div>
  );
}

function renderHost(initialEntries: string[] = ["/host"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route
          path="/host"
          element={
            <DrawerProvider renderDrawer={renderContent}>
              <Controls />
              <Probe />
            </DrawerProvider>
          }
        />
        <Route path="/elsewhere" element={<div>Elsewhere page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const loc = () => screen.getByTestId("loc").textContent ?? "";

describe("Drawer controller — URL transitions", () => {
  it("opening adds a drawer parameter to the URL", async () => {
    renderHost();
    fireEvent.click(screen.getByText("open-a"));
    await waitFor(() => expect(loc()).toContain("drawer=rec%3Aa"));
    expect(screen.getByTestId("depth")).toHaveTextContent("1");
    expect(screen.getByTestId("topkey")).toHaveTextContent("rec:a");
  });

  it("preserves an existing query parameter when opening", async () => {
    renderHost(["/host?status=active"]);
    fireEvent.click(screen.getByText("open-a"));
    await waitFor(() => expect(loc()).toContain("status=active"));
    expect(loc()).toContain("drawer=rec%3Aa");
  });

  it("nested opens stack deterministically in order", async () => {
    renderHost();
    fireEvent.click(screen.getByText("open-a"));
    await waitFor(() =>
      expect(screen.getByTestId("depth")).toHaveTextContent("1"),
    );
    fireEvent.click(screen.getByText("open-b"));
    await waitFor(() =>
      expect(screen.getByTestId("depth")).toHaveTextContent("2"),
    );
    expect(loc().indexOf("rec%3Aa")).toBeLessThan(loc().indexOf("rec%3Ab"));
    expect(screen.getByTestId("topkey")).toHaveTextContent("rec:b");
  });

  it("closing the top removes one level", async () => {
    renderHost(["/host?drawer=rec:a&drawer=rec:b"]);
    expect(screen.getByTestId("depth")).toHaveTextContent("2");
    fireEvent.click(screen.getByText("close-top"));
    await waitFor(() =>
      expect(screen.getByTestId("depth")).toHaveTextContent("1"),
    );
    expect(screen.getByTestId("topkey")).toHaveTextContent("rec:a");
  });

  it("closing all clears the stack but keeps other parameters", async () => {
    renderHost(["/host?status=active&drawer=rec:a&drawer=rec:b"]);
    fireEvent.click(screen.getByText("close-all"));
    await waitFor(() =>
      expect(screen.getByTestId("depth")).toHaveTextContent("0"),
    );
    expect(loc()).toContain("status=active");
    expect(loc()).not.toContain("drawer=");
  });

  it("replacing swaps the top level in place", async () => {
    renderHost(["/host?drawer=rec:a"]);
    fireEvent.click(screen.getByText("replace-z"));
    await waitFor(() =>
      expect(screen.getByTestId("topkey")).toHaveTextContent("rec:z"),
    );
    expect(screen.getByTestId("depth")).toHaveTextContent("1");
    expect(loc()).not.toContain("rec%3Aa");
  });

  it("restores the full stack from a copied/reloaded deep link", () => {
    renderHost(["/host?drawer=rec:a&drawer=rec:b"]);
    expect(screen.getByTestId("depth")).toHaveTextContent("2");
    expect(screen.getByRole("dialog", { name: "Record rec:b" })).toBeVisible();
    expect(
      screen.getByRole("dialog", { name: "Record rec:a", hidden: true }),
    ).toBeInTheDocument();
  });

  it("ordinary navigation to another page exits the stack", async () => {
    renderHost(["/host?drawer=rec:a"]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "go elsewhere" }));
    await waitFor(() =>
      expect(screen.getByText("Elsewhere page")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

/**
 * Back-aware close: closing a drawer must use browser Back ONLY when this provider
 * genuinely pushed that level (so the previous entry is the pre-drawer state of the
 * SAME page and Forward can restore it); otherwise it must remove only the top
 * drawer parameter in place, preserving the pathname, hash and unrelated query
 * parameters. A bare `history.state.idx > 0` check is insufficient — it can send a
 * deep-linked/refreshed user back to a different page (ADR-018 §18.2).
 */
describe("Drawer controller — Back-aware close", () => {
  type Entry =
    | string
    | { pathname: string; search?: string; hash?: string; state?: unknown };

  function Panel() {
    const { openDrawer, replaceDrawer, closeDrawer, closeAll, depth, topKey } =
      useDrawer();
    const navigate = useNavigate();
    return (
      <div>
        <button type="button" onClick={() => openDrawer("rec:a")}>
          open-a
        </button>
        <button type="button" onClick={() => openDrawer("rec:b")}>
          open-b
        </button>
        <button type="button" onClick={() => replaceDrawer("rec:z")}>
          replace-z
        </button>
        <button type="button" onClick={() => closeDrawer()}>
          close-top
        </button>
        <button type="button" onClick={() => closeAll()}>
          close-all
        </button>
        <button type="button" onClick={() => navigate(-1)}>
          browser-back
        </button>
        <button type="button" onClick={() => navigate(1)}>
          browser-forward
        </button>
        <Link to="/goals?drawer=goal:abc">link-to-goals-drawer</Link>
        <span data-testid="depth">{depth}</span>
        <span data-testid="topkey">{topKey ?? "none"}</span>
        <Probe />
      </div>
    );
  }

  function Page() {
    return (
      <DrawerProvider renderDrawer={renderContent}>
        <Panel />
      </DrawerProvider>
    );
  }

  function renderApp(initialEntries: Entry[], initialIndex?: number) {
    return render(
      <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
        <Routes>
          <Route path="/projects" element={<Page />} />
          <Route path="/goals" element={<Page />} />
          <Route path="/host" element={<Page />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  const depth = () => screen.getByTestId("depth").textContent;
  const path = () => screen.getByTestId("loc").textContent ?? "";

  it("1) uses Back for a provider-opened drawer, and Forward restores it", async () => {
    renderApp(["/host"]);
    fireEvent.click(screen.getByText("open-a"));
    await waitFor(() => expect(depth()).toBe("1"));
    expect(path()).toContain("drawer=rec%3Aa");

    fireEvent.click(screen.getByText("close-top"));
    await waitFor(() => expect(depth()).toBe("0"));
    expect(path()).toBe("/host");

    // A forward entry still exists — proof Back (not a replace) closed it.
    fireEvent.click(screen.getByText("browser-forward"));
    await waitFor(() => expect(depth()).toBe("1"));
    expect(path()).toContain("drawer=rec%3Aa");
  });

  it("2) removes the top parameter for a directly deep-linked drawer", async () => {
    renderApp([{ pathname: "/goals", search: "?drawer=goal:abc" }]);
    expect(depth()).toBe("1");
    fireEvent.click(screen.getByText("close-top"));
    await waitFor(() => expect(depth()).toBe("0"));
    expect(path()).toBe("/goals");
  });

  it("3) does not navigate to a different page when closing a cross-route deep link", async () => {
    renderApp(["/projects"]);
    fireEvent.click(screen.getByText("link-to-goals-drawer"));
    await waitFor(() => expect(path()).toContain("/goals"));
    expect(depth()).toBe("1");

    fireEvent.click(screen.getByText("close-top"));
    // Stays on /goals; must NOT go back to /projects.
    await waitFor(() => expect(path()).toBe("/goals"));
    expect(path()).not.toContain("/projects");
  });

  it("4) removes only the parameter after a refresh/remount (stale token, empty set)", async () => {
    renderApp(
      [
        { pathname: "/projects" },
        {
          pathname: "/goals",
          search: "?drawer=goal:abc",
          // A token the browser preserved across a refresh; this fresh provider
          // instance never issued it, so it must NOT be trusted for Back.
          state: { [DRAWER_PUSH_STATE_KEY]: "stale-instance:1" },
        },
      ],
      1,
    );
    expect(depth()).toBe("1");
    fireEvent.click(screen.getByText("close-top"));
    await waitFor(() => expect(path()).toBe("/goals"));
    expect(path()).not.toContain("/projects");
  });

  it("5) preserves unrelated query parameters when removing the parameter", async () => {
    renderApp([
      {
        pathname: "/goals",
        search: "?status=active&drawer=goal:abc&view=list",
      },
    ]);
    fireEvent.click(screen.getByText("close-top"));
    await waitFor(() => expect(path()).not.toContain("drawer="));
    expect(path()).toContain("status=active");
    expect(path()).toContain("view=list");
    expect(path().startsWith("/goals?")).toBe(true);
  });

  it("6) preserves the URL hash when removing the parameter", async () => {
    renderApp([
      { pathname: "/goals", search: "?drawer=goal:abc", hash: "#section" },
    ]);
    fireEvent.click(screen.getByText("close-top"));
    await waitFor(() => expect(path()).toBe("/goals#section"));
  });

  it("7) closes two provider-opened levels one at a time; Forward restores both", async () => {
    renderApp(["/host"]);
    fireEvent.click(screen.getByText("open-a"));
    await waitFor(() => expect(depth()).toBe("1"));
    fireEvent.click(screen.getByText("open-b"));
    await waitFor(() => expect(depth()).toBe("2"));

    fireEvent.click(screen.getByText("close-top"));
    await waitFor(() => expect(depth()).toBe("1"));
    expect(screen.getByTestId("topkey")).toHaveTextContent("rec:a");

    fireEvent.click(screen.getByText("close-top"));
    await waitFor(() => expect(depth()).toBe("0"));
    expect(path()).toBe("/host");

    fireEvent.click(screen.getByText("browser-forward"));
    await waitFor(() => expect(depth()).toBe("1"));
    fireEvent.click(screen.getByText("browser-forward"));
    await waitFor(() => expect(depth()).toBe("2"));
  });

  it("8) mixes a deep-linked lower level with a provider-opened nested level", async () => {
    renderApp([{ pathname: "/goals", search: "?drawer=goal:abc" }]);
    expect(depth()).toBe("1");
    fireEvent.click(screen.getByText("open-b"));
    await waitFor(() => expect(depth()).toBe("2"));

    // The nested level was provider-opened → Back closes just it.
    fireEvent.click(screen.getByText("close-top"));
    await waitFor(() => expect(depth()).toBe("1"));
    expect(screen.getByTestId("topkey")).toHaveTextContent("goal:abc");

    // The original level was deep-linked → parameter removal, staying on /goals.
    fireEvent.click(screen.getByText("close-top"));
    await waitFor(() => expect(depth()).toBe("0"));
    expect(path()).toBe("/goals");
  });

  it("9) treats re-opening the current top as a no-op with no stray metadata", async () => {
    renderApp(["/host"]);
    fireEvent.click(screen.getByText("open-a"));
    await waitFor(() => expect(depth()).toBe("1"));
    // Re-open the same top: no navigation, no new level, no new token.
    fireEvent.click(screen.getByText("open-a"));
    await waitFor(() => expect(depth()).toBe("1"));
    // A single close returns to the base — proof no duplicate entry was created.
    fireEvent.click(screen.getByText("close-top"));
    await waitFor(() => expect(depth()).toBe("0"));
    expect(path()).toBe("/host");
  });

  it("10) does not mark a replaced deep-linked level as a provider push", async () => {
    renderApp(
      [
        { pathname: "/projects" },
        { pathname: "/goals", search: "?drawer=goal:abc" },
      ],
      1,
    );
    fireEvent.click(screen.getByText("replace-z"));
    await waitFor(() =>
      expect(screen.getByTestId("topkey")).toHaveTextContent("rec:z"),
    );
    // The level was never provider-pushed, so closing removes the parameter and
    // stays on /goals rather than going Back to /projects.
    fireEvent.click(screen.getByText("close-top"));
    await waitFor(() => expect(path()).toBe("/goals"));
    expect(path()).not.toContain("/projects");
  });

  it("11) closeAll clears the stack predictably and Back can restore it", async () => {
    renderApp([
      { pathname: "/goals", search: "?status=active&drawer=a&drawer=b" },
    ]);
    expect(depth()).toBe("2");
    fireEvent.click(screen.getByText("close-all"));
    await waitFor(() => expect(depth()).toBe("0"));
    expect(path()).toContain("status=active");
    expect(path()).not.toContain("drawer=");

    // closeAll is a push, so Back restores the whole stack — no malformed state.
    fireEvent.click(screen.getByText("browser-back"));
    await waitFor(() => expect(depth()).toBe("2"));
  });
});
