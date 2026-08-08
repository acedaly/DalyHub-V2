import { describe, expect, it } from "vitest";

import {
  CAPTURE_CONTEXT_PARAM,
  encodeCaptureContext,
  fullFormLabel,
  fullFormRoute,
  parseCaptureContextContract,
  readCaptureContextParam,
  type CaptureContextContract,
} from "~/shared/capture/capture-context";

/**
 * DEBT-45 — the full-form hand-off contract, as pure behaviour.
 *
 * The gap this closes is specific: context used to live only in the Quick Capture
 * sheet's React state, so choosing a module's fuller creation surface silently
 * discarded it. It now travels in the URL, which is what makes the hand-off
 * refresh-stable, Back/Forward-honest and identical on the phone and the desktop —
 * one contract, not a mobile variant.
 */

const personContext: CaptureContextContract = {
  sourceEntityId: "person-1",
  sourceEntityType: "person",
  sourceEntityTitle: "Vaughn Smith",
  sourceModule: "people",
  originatingRoute: "/person/person-1",
  mode: "removable",
  relationshipMeaning: "related",
  returnTo: "/person/person-1",
};

const projectContext: CaptureContextContract = {
  ...personContext,
  sourceEntityId: "project-1",
  sourceEntityType: "project",
  sourceEntityTitle: "Operational Officer Program",
  sourceModule: "projects",
  originatingRoute: "/projects/project-1",
  returnTo: "/projects/project-1",
};

const assetContext: CaptureContextContract = {
  ...personContext,
  sourceEntityId: "asset-1",
  sourceEntityType: "asset",
  sourceEntityTitle: "Passport",
  sourceModule: "assets",
  originatingRoute: "/asset/asset-1",
  returnTo: "/asset/asset-1",
};

function paramsOf(url: string): URLSearchParams {
  return new URLSearchParams(url.slice(url.indexOf("?") + 1));
}

describe("full-form hand-off destinations", () => {
  it("points every capture type at its module's existing creation surface", () => {
    expect(fullFormRoute("task", null)).toBe("/tasks?drawer=new-task");
    expect(fullFormRoute("note", null)).toBe("/notes?drawer=new-note");
    expect(fullFormRoute("meeting", null)).toBe("/new/meeting");
    expect(fullFormRoute("diary", null)).toBe("/diary?inspector=new");
  });

  it("carries the context without disturbing the destination's own parameters", () => {
    const url = fullFormRoute("task", personContext);
    const params = paramsOf(url);
    expect(url.startsWith("/tasks?")).toBe(true);
    // The drawer key the destination needs is still there — the context is an
    // addition, never a replacement.
    expect(params.get("drawer")).toBe("new-task");
    expect(readCaptureContextParam(params)).toEqual(personContext);
  });

  it("carries the context on a destination that had no query string", () => {
    const url = fullFormRoute("meeting", personContext);
    expect(url.startsWith("/new/meeting?")).toBe(true);
    expect(readCaptureContextParam(paramsOf(url))).toEqual(personContext);
  });

  it("survives a round trip through real URL encoding", () => {
    const url = new URL(
      fullFormRoute("diary", projectContext),
      "https://x.test",
    );
    expect(readCaptureContextParam(url.searchParams)).toEqual(projectContext);
  });

  it("omits a context the destination's capture type has no meaning for", () => {
    // An Asset source has no Diary relationship in the ADR-060 matrix. Carrying
    // it would promise a link the server would decline to make.
    expect(fullFormRoute("diary", assetContext)).toBe("/diary?inspector=new");
  });

  it("names the destination in the product's nouns", () => {
    expect(fullFormLabel("task")).toBe("More task options");
    expect(fullFormLabel("diary")).toBe("More entry options");
  });
});

describe("reading a hand-off parameter", () => {
  it("treats a tampered or truncated parameter as no context, never an error", () => {
    const params = new URLSearchParams({ [CAPTURE_CONTEXT_PARAM]: "%%%" });
    expect(readCaptureContextParam(params)).toBeNull();

    const truncated = new URLSearchParams({
      [CAPTURE_CONTEXT_PARAM]: encodeCaptureContext(personContext).slice(0, 20),
    });
    expect(readCaptureContextParam(truncated)).toBeNull();
  });

  it("refuses a context claiming an entity type outside the closed set", () => {
    const params = new URLSearchParams({
      [CAPTURE_CONTEXT_PARAM]: JSON.stringify({
        ...personContext,
        sourceEntityType: "workspace",
      }),
    });
    expect(readCaptureContextParam(params)).toBeNull();
  });

  it("is absent-safe", () => {
    expect(readCaptureContextParam(new URLSearchParams())).toBeNull();
    expect(readCaptureContextParam(null)).toBeNull();
  });

  it("never treats the URL value as authoritative identity", () => {
    // The parser accepts a client-supplied TITLE because it is display-only; the
    // server replaces it from the stored record and revalidates id + type before
    // any relationship is written (see test/kernel/capture-context-matrix.test.ts).
    const forged = parseCaptureContextContract(
      JSON.stringify({ ...personContext, sourceEntityTitle: "Someone else" }),
    );
    expect(forged?.sourceEntityId).toBe("person-1");
    expect(forged?.sourceEntityTitle).toBe("Someone else");
  });
});
