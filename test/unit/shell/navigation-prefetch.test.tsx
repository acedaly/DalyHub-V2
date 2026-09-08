/**
 * PERF-01 — the navigation prefetch CONTRACT.
 *
 * The measured cost of a cold navigation is not one request, it is three in
 * sequence: the route's JavaScript chunk, then the loader's `.data` request,
 * then the render. `prefetch="intent"` starts the first two on hover, focus or
 * touchstart, so the click lands on work already in flight.
 *
 * These tests assert the contract at the seam where it is actually expressed —
 * the `prefetch` prop the navigation hands React Router — because that is the
 * only place a regression can happen. React Router's own `PrefetchPageLinks`
 * needs the framework manifest to emit `<link rel="prefetch">`, and that
 * manifest exists only in a real build; a test that waited for those tags would
 * assert nothing here and pass whatever the prop said. So `Link` is replaced
 * with a component that publishes the prop it was given, and everything else
 * about the navigation renders for real.
 *
 * What this catches: a destination added to the rail or the bar without the
 * policy, the policy quietly switched off, and the policy switched to one of the
 * two behaviours that would download the whole product on first paint.
 *
 * V2.16 CONSOL-00 — the rail case now renders the REAL registry rather than a
 * seven-item sample. The regroup rebuilt the rail as one labelled list per
 * question, and the most likely accident in that kind of rebuild is a block that
 * renders its rows through a different path and quietly loses the policy. A
 * sample of seven ungrouped items could not have caught it; every row of every
 * group can.
 */

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { discoverModuleRegistry } from "~/modules/discover-modules";
import {
  buildNavigationModel,
  type NavigationItem,
} from "~/platform/modules/navigation-adapter";
import { buildNavigationGroups } from "~/shared/shell/navigation-groups";
import { PRIMARY_NAV_PREFETCH } from "~/shared/shell/navigation-prefetch";

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    /*
     * The one seam. Every other behaviour of the navigation — the active rule,
     * the grouping, the glyphs, the labels — is the real thing.
     */
    Link: ({
      to,
      prefetch,
      children,
      ...rest
    }: {
      readonly to: string;
      readonly prefetch?: string;
      readonly children?: ReactNode;
    } & Record<string, unknown>) => (
      <a href={to} data-prefetch={prefetch ?? "none"} {...rest}>
        {children}
      </a>
    ),
  };
});

const { PrimaryNavigation } = await import("~/shared/shell/PrimaryNavigation");
const { BottomNav } = await import("~/shared/shell/BottomNav");

function item(
  label: string,
  order: number,
  mobilePrimaryOrder?: number,
): NavigationItem {
  return {
    id: `${label.toLowerCase()}.index`,
    moduleId: label.toLowerCase() as never,
    label,
    href: `/${label.toLowerCase()}`,
    order,
    ...(mobilePrimaryOrder === undefined ? {} : { mobilePrimaryOrder }),
  };
}

/**
 * The phone bar's fixture: the three destinations that declare a mobile order,
 * plus four that do not, so the bar's own cap is exercised alongside the policy.
 */
const DESTINATIONS = [
  item("Today", 110, 10),
  item("Tasks", 150, 20),
  item("Projects", 210, 30),
  item("Goals", 220),
  item("Obligations", 310),
  item("Finance", 410),
  item("Insight", 510),
];

/** The REAL rail — every module the registry discovers, in every group. */
function railDestinations(): readonly NavigationItem[] {
  const registry = discoverModuleRegistry();
  return buildNavigationModel(
    registry.listRoutes(),
    (moduleId) => registry.getModule(moduleId)?.entityTypes[0]?.type,
  );
}

describe("PERF-01 navigation prefetch", () => {
  it("warms on INTENT, never on render or viewport", () => {
    /*
     * The two rejected behaviours, named. `render` prefetches every destination
     * the moment the rail paints — and the rail holds every module in the
     * product, so that is the whole application on first paint. `viewport`
     * degenerates into `render` here, because the rail is entirely visible at
     * desktop widths and the phone sheet shows every row at once.
     */
    expect(PRIMARY_NAV_PREFETCH).toBe("intent");
    expect(PRIMARY_NAV_PREFETCH).not.toBe("render");
    expect(PRIMARY_NAV_PREFETCH).not.toBe("viewport");
  });

  it("gives EVERY rail destination, in EVERY group, the policy", () => {
    /*
     * A DATA router, because the navigation reads `useNavigation()` for the
     * pending destination and that hook has no meaning outside one.
     */
    const rail = railDestinations();
    const Stub = createRoutesStub([
      {
        path: "*",
        Component: () => <PrimaryNavigation id="nav" items={rail} />,
      },
    ]);
    render(<Stub initialEntries={["/today"]} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(rail.length);
    for (const link of links) {
      expect(link.getAttribute("data-prefetch")).toBe("intent");
    }

    // …and this is genuinely a multi-block rail, so "every row" means something.
    const groups = buildNavigationGroups(rail);
    expect(groups.length).toBeGreaterThan(1);
    for (const group of groups) {
      for (const destination of group.items) {
        const link = screen.getByRole("link", { name: destination.label });
        expect(
          link.getAttribute("data-prefetch"),
          `${group.definition.key}/${destination.label}`,
        ).toBe("intent");
      }
    }
  });

  it("gives EVERY phone bar destination the policy", () => {
    const Stub = createRoutesStub([
      {
        path: "*",
        Component: () => (
          <BottomNav
            navigation={DESTINATIONS}
            onOpenCapture={() => {}}
            onOpenMore={() => {}}
            moreOpen={false}
          />
        ),
      },
    ]);
    render(<Stub initialEntries={["/today"]} />);
    const links = screen.getAllByRole("link");
    // The bar carries the destinations that declare a mobile order; Add and More
    // are buttons, not links, and are deliberately not counted here.
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("data-prefetch")).toBe("intent");
    }
  });
});
