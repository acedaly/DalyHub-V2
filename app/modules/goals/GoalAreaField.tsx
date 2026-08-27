/**
 * STEER-02 — the Goal's AREA, as the control that re-files it (DEBT-184).
 *
 * A Goal filed under the wrong Area used to stay there: `POST
 * /goals/:goalId/mutate` had focused intents for the title, the target date,
 * the definition of done, the identity, the measurement and completion — and
 * none for the structural parent. A Project has `move`; a Goal did not, and the
 * only remedy (recreate and re-link) destroyed the Goal's Activity and its
 * measurement history.
 *
 * ── It is the established pattern, not a new one ────────────────────────────
 * The shared `InlinePickerField` over server-resolved candidates is exactly
 * what `ProjectsTable`'s Area cell already is (DHDS-10). The candidates come
 * from `/goals/area-options?q=`, searched only once the picker OPENS — so a
 * record that is never re-filed costs no request — and the move itself posts
 * the canonical `move` intent, which re-verifies the destination server-side.
 * There is no second parent-picker model and no second relationship authority:
 * the spine owns parentage, and this is a door to it.
 */

import { useCallback, useRef, useState } from "react";

import type { PickerOption } from "~/shared/floating";
import type { SelectOption } from "~/shared/forms/types";
import {
  InlinePickerField,
  type InlineSaveOutcome,
} from "~/shared/inline-edit";

import type { SerializedGoalArea } from "./goal-view";

/**
 * The bounded, abortable option search — the same shape
 * `useParentOptionsSearch` has for Projects, pointed at the Goals endpoint.
 *
 * It is its own hook rather than an import from `~/modules/projects` because
 * the cross-module-import rule forbids one module reaching into another's
 * internals (`docs/development/MODULES.md`), and the two endpoints answer
 * different questions: a Project may sit under an Area OR advance a Goal; a
 * Goal belongs to an Area and nothing else.
 */
function useAreaOptionsSearch(seed: readonly SelectOption[]) {
  const [options, setOptions] = useState<readonly SelectOption[]>(seed);
  const [loading, setLoading] = useState(false);
  const known = useRef<Map<string, SelectOption>>(
    new Map(seed.map((option) => [option.value, option])),
  );
  const abort = useRef<AbortController | null>(null);

  const onSearch = useCallback((query: string) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    void (async () => {
      try {
        const url = new URL("/goals/area-options", window.location.origin);
        url.searchParams.set("q", query);
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        if (!response.ok) {
          setLoading(false);
          return;
        }
        const body = (await response.json()) as {
          readonly options?: readonly SelectOption[];
        };
        if (!Array.isArray(body.options)) {
          setLoading(false);
          return;
        }
        for (const option of body.options) {
          known.current.set(option.value, option);
        }
        setOptions(body.options);
        setLoading(false);
      } catch (error) {
        // An aborted request is expected while the owner keeps typing.
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLoading(false);
        }
      }
    })();
  }, []);

  const withSelected = useCallback(
    (value: string): readonly SelectOption[] => {
      if (value.length === 0 || options.some((o) => o.value === value)) {
        return options;
      }
      const selected = known.current.get(value);
      return selected ? [selected, ...options] : options;
    },
    [options],
  );

  return { loading, onSearch, withSelected };
}

export type GoalAreaFieldProps = {
  readonly area: SerializedGoalArea;
  /** Post the canonical `move` intent. A refusal keeps the current Area. */
  readonly onMove: (areaId: string) => Promise<InlineSaveOutcome>;
  readonly "data-testid"?: string;
};

export function GoalAreaField({
  area,
  onMove,
  "data-testid": testId = "goal-area",
}: GoalAreaFieldProps) {
  // The current Area seeds the list, so its label always resolves even before a
  // search has run — the same retention rule the Projects picker uses.
  const search = useAreaOptionsSearch([{ value: area.id, label: area.title }]);
  const options: readonly PickerOption[] = search
    .withSelected(area.id)
    .map((option) => ({
      id: option.value,
      label: option.label,
      ...(option.description ? { support: option.description } : {}),
    }));

  return (
    <span data-goal-area={area.id} data-testid={`${testId}-value`}>
      <InlinePickerField
        label="Area"
        value={area.id}
        options={options}
        loading={search.loading}
        onSearch={search.onSearch}
        // Nothing is fetched until the picker opens: a record the owner is
        // merely reading costs no request.
        onOpen={() => search.onSearch("")}
        onSave={async (next) => {
          // Choosing the Area it is already in is not a move. The server treats
          // it as an idempotent no-op too; short-circuiting keeps the record
          // from revalidating for a change nobody made.
          if (next === area.id) return { ok: true };
          return onMove(next);
        }}
        presentation="meta"
        data-testid={testId}
      />
    </span>
  );
}
