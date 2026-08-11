/**
 * PWA-12 — the revalidation rule three routes now share.
 *
 * These exist because the first version of this rule was written inline in three
 * files as "same pathname → skip", and that silently broke every explicit
 * `revalidate()` in the product: a task created, renamed or completed stopped
 * appearing, because a deliberate re-read arrives with an UNCHANGED url and was
 * indistinguishable from "nothing moved". Seventeen browser journeys caught it.
 * This file is what stops it coming back.
 */

import { describe, expect, it } from "vitest";
import type { ShouldRevalidateFunctionArgs } from "react-router";

import {
  isSameDocumentParameterChange,
  parametersUnchanged,
} from "~/shared/router/revalidation";

function args(
  current: string,
  next: string,
  formMethod?: string,
): Pick<ShouldRevalidateFunctionArgs, "currentUrl" | "nextUrl" | "formMethod"> {
  return {
    currentUrl: new URL(current, "https://app.test"),
    nextUrl: new URL(next, "https://app.test"),
    formMethod: formMethod as ShouldRevalidateFunctionArgs["formMethod"],
  };
}

describe("isSameDocumentParameterChange", () => {
  it("is true for a Drawer opening on the same page", () => {
    // The case worth skipping: nothing a loader reads has moved.
    expect(
      isSameDocumentParameterChange(
        args("/tasks?view=list", "/tasks?view=list&drawer=task%3A1"),
      ),
    ).toBe(true);
  });

  it("is FALSE for an identical url", () => {
    // `useRevalidator().revalidate()` — a deliberate re-read, which is how every
    // mutation in DalyHub asks its surface to catch up. Treating it as "nothing
    // moved" is the regression this test exists for.
    expect(
      isSameDocumentParameterChange(
        args("/tasks?view=list", "/tasks?view=list"),
      ),
    ).toBe(false);
    expect(isSameDocumentParameterChange(args("/tasks", "/tasks"))).toBe(false);
  });

  it("is FALSE for a submission, whatever the url did", () => {
    expect(
      isSameDocumentParameterChange(
        args("/tasks", "/tasks?drawer=task%3A1", "POST"),
      ),
    ).toBe(false);
  });

  it("is FALSE when the path changed", () => {
    expect(isSameDocumentParameterChange(args("/tasks", "/today"))).toBe(false);
    expect(
      isSameDocumentParameterChange(args("/tasks?a=1", "/today?a=1")),
    ).toBe(false);
  });
});

describe("parametersUnchanged", () => {
  it("is true when none of the named parameters moved", () => {
    expect(
      parametersUnchanged(
        args("/tasks?view=list&sort=due", "/tasks?view=list&sort=due&drawer=x"),
        ["view", "sort"],
      ),
    ).toBe(true);
  });

  it("is false when one of them did", () => {
    expect(
      parametersUnchanged(args("/tasks?sort=due", "/tasks?sort=title"), [
        "view",
        "sort",
      ]),
    ).toBe(false);
  });

  it("treats an added parameter as a change", () => {
    expect(
      parametersUnchanged(args("/tasks", "/tasks?priority=p1"), ["priority"]),
    ).toBe(false);
  });

  it("is vacuously true for no named parameters", () => {
    expect(parametersUnchanged(args("/tasks?a=1", "/tasks?a=2"), [])).toBe(
      true,
    );
  });
});
