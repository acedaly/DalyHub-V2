import { render, act } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import {
  CommandContextProvider,
  useContextualActions,
  useRegisterContextualActions,
  type AppAction,
} from "~/shared/commands";

const okRun = () => ({ ok: true as const });

function action(id: string, title = id): AppAction {
  return { id, title, kind: "run", run: okRun };
}

let observed: readonly AppAction[] = [];
function Observer() {
  observed = useContextualActions();
  return null;
}

function Surface({ actions }: { readonly actions: readonly AppAction[] }) {
  useRegisterContextualActions(actions);
  return null;
}

describe("CommandContextProvider", () => {
  it("registers actions and removes them on unmount", () => {
    function App({ mounted }: { readonly mounted: boolean }) {
      return (
        <CommandContextProvider>
          <Observer />
          {mounted ? <Surface actions={[action("a")]} /> : null}
        </CommandContextProvider>
      );
    }
    const { rerender } = render(<App mounted />);
    expect(observed.map((a) => a.id)).toEqual(["a"]);
    rerender(<App mounted={false} />);
    expect(observed).toEqual([]);
  });

  it("dedupes duplicate ids (first registration wins) and orders deterministically", () => {
    render(
      <CommandContextProvider>
        <Observer />
        <Surface actions={[action("a", "first"), action("b")]} />
        <Surface actions={[action("a", "second"), action("c")]} />
      </CommandContextProvider>,
    );
    expect(observed.map((a) => a.id)).toEqual(["a", "b", "c"]);
    expect(observed.find((a) => a.id === "a")?.title).toBe("first");
  });

  it("updates when a surface changes its actions (no stale action survives)", () => {
    let setActions: (a: readonly AppAction[]) => void = () => {};
    function DynamicSurface() {
      const [actions, set] = useState<readonly AppAction[]>([action("x")]);
      setActions = set;
      useRegisterContextualActions(actions);
      return null;
    }
    render(
      <CommandContextProvider>
        <Observer />
        <DynamicSurface />
      </CommandContextProvider>,
    );
    expect(observed.map((a) => a.id)).toEqual(["x"]);
    act(() => setActions([action("y")]));
    expect(observed.map((a) => a.id)).toEqual(["y"]);
  });

  it("returns an empty list with no provider", () => {
    render(<Observer />);
    expect(observed).toEqual([]);
  });
});
