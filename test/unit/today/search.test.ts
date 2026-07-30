import { describe, expect, it } from "vitest";

import { discoverModuleRegistry } from "~/modules/discover-modules";
import todayModule from "~/modules/today/module";

describe("today search provider removal", () => {
  it("keeps Today navigable without registering a Search provider", () => {
    expect(todayModule.commands?.map((command) => command.id)).toEqual([
      "today.open",
      "today.focus_quick_capture",
      "today.open_waiting",
    ]);
    expect(todayModule.searchProviders).toBeUndefined();
  });

  it("does not expose fixture-backed Today providers in production discovery", () => {
    const providers = discoverModuleRegistry().listSearchProviders();
    expect(providers.some((provider) => provider.moduleId === "today")).toBe(
      false,
    );
    expect(providers.some((provider) => provider.id === "today.search")).toBe(
      false,
    );
  });
});
