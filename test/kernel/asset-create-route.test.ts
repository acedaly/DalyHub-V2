/**
 * ASSET-03 — the ONE Asset creation boundary, exercised as the phone uses it.
 *
 * Quick Capture posts to exactly the same `/assets/create` action the `/new/asset`
 * page posts to, so what matters is that this action — the trusted server
 * boundary — is right for every shape of Asset the phone flow can produce, and
 * that no browser-supplied value can widen it. Specifically:
 *
 *   - a physical, a documentary and a subscription-shaped Asset all create, with
 *     only the fields their type actually carries;
 *   - a name and a type ALONE is a valid Asset (minimum viable capture);
 *   - an invalid or absent type is refused, and refusal writes NOTHING — no
 *     orphan entity, no partial detail row, no Activity;
 *   - workspace and actor come from the authenticated session, never the form,
 *     so a captured Asset can never land in another workspace.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { action as createAction } from "~/modules/assets/routes/create";
import type { CreateAssetResult } from "~/modules/assets/routes/create";

import { makeAssetRepository, makeContext, resetTables } from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_asset_create_other";

function authedContext(): RouterContextProvider {
  const context = new RouterContextProvider();
  const session: AuthenticatedSession = {
    user: {
      subject: "owner-subject",
      email: "owner@example.com",
      displayName: null,
    },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
  setAuthenticatedSession(context, session);
  return context;
}

function formData(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

async function create(
  entries: Record<string, string>,
): Promise<CreateAssetResult> {
  const response = (await createAction({
    request: new Request("https://app.test/assets/create", {
      method: "POST",
      body: formData(entries),
    }),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof createAction>[0])) as Response;
  return (await response.json()) as CreateAssetResult;
}

function assets(workspace = WS) {
  return makeAssetRepository(makeContext(workspace));
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("POST /assets/create — the shapes phone capture produces", () => {
  it("creates a physical Asset with the fields its type carries", async () => {
    const result = await create({
      title: "Cub Frontier",
      assetType: "trailer",
      manufacturer: "Cub",
      model: "Frontier",
      serialNumber: "CUB-90210",
      location: "Carport",
      tags: JSON.stringify(["camping"]),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const asset = await assets().get(result.assetId);
    expect(asset?.title).toBe("Cub Frontier");
    expect(asset?.assetType).toBe("trailer");
    expect(asset?.manufacturer).toBe("Cub");
    expect(asset?.serialNumber).toBe("CUB-90210");
    expect(asset?.tags).toContain("camping");
  });

  it("creates a documentary Asset — an insurance policy, not a thing", async () => {
    const result = await create({
      title: "Hilux comprehensive insurance",
      assetType: "insurance",
      issuer: "Ledger Mutual",
      referenceNumber: "POL-99812",
      renewalDate: "2027-03-01",
      url: "https://insurer.example/policies/99812",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const asset = await assets().get(result.assetId);
    expect(asset?.assetType).toBe("insurance");
    expect(asset?.issuer).toBe("Ledger Mutual");
    expect(asset?.renewalDate).toBe("2027-03-01");
    // A documentary Asset carries no physical facts, because it was never asked.
    expect(asset?.manufacturer ?? null).toBeNull();
    expect(asset?.serialNumber ?? null).toBeNull();
  });

  it("creates a subscription-shaped Asset", async () => {
    const result = await create({
      title: "Design tooling",
      assetType: "software",
      issuer: "Vector Labs",
      renewalDate: "2027-01-15",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const asset = await assets().get(result.assetId);
    expect(asset?.assetType).toBe("software");
    expect(asset?.issuer).toBe("Vector Labs");
  });

  it("accepts a name and a type alone — nothing else is mandatory", async () => {
    const result = await create({ title: "Shed key safe", assetType: "other" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const asset = await assets().get(result.assetId);
    expect(asset?.title).toBe("Shed key safe");
    expect(asset?.assetType).toBe("other");
  });
});

describe("POST /assets/create — refusal writes nothing", () => {
  it("refuses a type outside the vocabulary and leaves no Asset behind", async () => {
    const result = await create({ title: "Spaceship", assetType: "starship" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.assetType ?? result.formError).toBeTruthy();
    const page = await assets().list({ limit: 50 });
    expect(page.items).toHaveLength(0);
  });

  it("refuses a missing name, and a missing type", async () => {
    expect((await create({ title: "   ", assetType: "vehicle" })).ok).toBe(
      false,
    );
    expect((await create({ title: "Nameless", assetType: "" })).ok).toBe(false);
    const page = await assets().list({ limit: 50 });
    expect(page.items).toHaveLength(0);
  });

  it("never leaks a database or internal detail to the owner", async () => {
    const result = await create({ title: "Spaceship", assetType: "starship" });
    if (result.ok) return;
    const text = JSON.stringify(result);
    for (const leak of ["SQL", "D1_", "SQLITE", "asset_details", "stack"]) {
      expect(text.includes(leak)).toBe(false);
    }
  });
});

describe("POST /assets/create — authority stays on the server", () => {
  it("ignores a workspace the browser tries to supply", async () => {
    const result = await create({
      title: "Someone else’s trailer",
      assetType: "trailer",
      workspaceId: OTHER,
      workspace_id: OTHER,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // It landed in the authenticated workspace, and is invisible from the other.
    expect(await assets(WS).get(result.assetId)).not.toBeNull();
    expect(await assets(OTHER).get(result.assetId)).toBeNull();
    expect((await assets(OTHER).list({ limit: 50 })).items).toHaveLength(0);
  });

  it("ignores a browser-supplied entity type — an Asset is an Asset", async () => {
    const result = await create({
      title: "Not a task",
      assetType: "tool",
      entityType: "task",
      type: "task",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const asset = await assets().get(result.assetId);
    expect(asset?.assetType).toBe("tool");
  });

  it("refuses a method other than POST", async () => {
    await expect(
      createAction({
        request: new Request("https://app.test/assets/create", {
          method: "GET",
        }),
        context: authedContext(),
        params: {},
      } as unknown as Parameters<typeof createAction>[0]),
    ).rejects.toBeInstanceOf(Response);
  });
});
