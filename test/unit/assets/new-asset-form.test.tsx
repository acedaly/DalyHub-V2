/**
 * ASSET-01 / ASSET-03 — the ONE New Asset form, as the owner experiences it.
 *
 * The behaviours here are the ones phone capture depends on and that a
 * refactor of the picker could quietly break:
 *
 *   - the minimum viable Asset is a NAME and a TYPE — nothing else is mandatory,
 *     so something you own can be recorded in seconds and enriched later;
 *   - the form reveals only the fields relevant to the chosen type;
 *   - switching type re-selects the visible set WITHOUT losing what was typed,
 *     and submits only the fields the FINAL type actually uses, so an insurance
 *     policy never carries a serial number it was never asked for;
 *   - a failure keeps every entered value and says something recoverable in the
 *     owner's words — never a database or transport detail.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NewAssetForm } from "~/modules/assets/NewAssetForm";

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () =>
    jsonResponse({ ok: true, assetId: "asset-new" }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The body of the most recent create POST, as plain entries. */
function submitted(): Record<string, string> {
  const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
    string,
    { body: FormData },
  ];
  const out: Record<string, string> = {};
  for (const [key, value] of init.body.entries()) {
    out[key] = String(value);
  }
  return out;
}

function chooseType(label: string) {
  const select = screen.getByRole("combobox", { name: "Type" });
  fireEvent.focus(select);
  fireEvent.click(screen.getByRole("option", { name: new RegExp(label) }));
}

function typeName(value: string) {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value } });
}

describe("New Asset — progressive disclosure", () => {
  it("asks only what it needs before a type is chosen", () => {
    render(<NewAssetForm onCreated={() => {}} />);
    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Type" })).toBeInTheDocument();
    // No wall of fields: nothing type-specific is on screen yet.
    expect(screen.queryByLabelText(/Manufacturer/)).toBeNull();
    expect(screen.queryByLabelText(/Issuer/)).toBeNull();
  });

  it("reveals the physical field set for a trailer", () => {
    render(<NewAssetForm onCreated={() => {}} />);
    chooseType("Trailer or camper");
    expect(screen.getByLabelText(/Manufacturer/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Model/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Serial number/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Location/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Warranty expires/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Issuer/)).toBeNull();
  });

  it("reveals the documentary field set for insurance", () => {
    render(<NewAssetForm onCreated={() => {}} />);
    chooseType("Insurance");
    expect(screen.getByLabelText(/Issuer or provider/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Reference number/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Renewal or expiry date/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Link/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Serial number/)).toBeNull();
  });
});

describe("New Asset — creating", () => {
  it("creates from a name and a type alone", async () => {
    const onCreated = vi.fn();
    render(<NewAssetForm onCreated={onCreated} />);
    typeName("Cub Frontier");
    chooseType("Trailer or camper");
    fireEvent.click(screen.getByRole("button", { name: "Create asset" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("asset-new"));
    expect(fetchMock.mock.calls[0][0]).toBe("/assets/create");
    const body = submitted();
    expect(body.title).toBe("Cub Frontier");
    expect(body.assetType).toBe("trailer");
    // Nothing optional was invented on the owner's behalf.
    expect(body.manufacturer).toBeUndefined();
    expect(body.location).toBeUndefined();
  });

  it("carries the optional details the chosen type asked for", async () => {
    render(<NewAssetForm onCreated={() => {}} />);
    typeName("Hilux comprehensive insurance");
    chooseType("Insurance");
    fireEvent.change(screen.getByLabelText(/Issuer or provider/), {
      target: { value: "Ledger Mutual" },
    });
    fireEvent.change(screen.getByLabelText(/Reference number/), {
      target: { value: "POL-99812" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create asset" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = submitted();
    expect(body.assetType).toBe("insurance");
    expect(body.issuer).toBe("Ledger Mutual");
    expect(body.referenceNumber).toBe("POL-99812");
  });

  it("submits only the FINAL type's fields after a change of mind", async () => {
    render(<NewAssetForm onCreated={() => {}} />);
    typeName("Roof box");
    chooseType("Trailer or camper");
    fireEvent.change(screen.getByLabelText(/Serial number/), {
      target: { value: "SER-1" },
    });
    // Changed their mind: this is a document, not a trailer.
    chooseType("Document");
    fireEvent.change(screen.getByLabelText(/Issuer or provider/), {
      target: { value: "Transport Authority" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create asset" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = submitted();
    expect(body.assetType).toBe("document");
    expect(body.issuer).toBe("Transport Authority");
    // The serial number is not a field a document HAS; it is not smuggled in.
    expect(body.serialNumber).toBeUndefined();
  });

  it("keeps a value typed under one type if that type is chosen again", () => {
    render(<NewAssetForm onCreated={() => {}} />);
    typeName("Ute");
    chooseType("Vehicle");
    fireEvent.change(screen.getByLabelText(/Manufacturer/), {
      target: { value: "Toyota" },
    });
    chooseType("Insurance");
    expect(screen.queryByLabelText(/Manufacturer/)).toBeNull();
    chooseType("Vehicle");
    // The owner's words were never destroyed by looking at another type.
    expect(screen.getByLabelText(/Manufacturer/)).toHaveValue("Toyota");
  });
});

describe("New Asset — failure is calm and recoverable", () => {
  it("requires a name and a type before it writes anything", async () => {
    render(<NewAssetForm onCreated={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Create asset" }));
    // Stated twice on purpose: once in the error summary a screen reader lands
    // on, once beside the field itself.
    expect(await screen.findAllByText("A name is required")).not.toHaveLength(
      0,
    );
    expect(await screen.findAllByText("Choose a type")).not.toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps every entered value when the server refuses", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: false,
        formError: "That asset couldn’t be created. Please try again.",
      }),
    );
    render(<NewAssetForm onCreated={() => {}} />);
    typeName("Cub Frontier");
    chooseType("Trailer or camper");
    fireEvent.change(screen.getByLabelText(/Manufacturer/), {
      target: { value: "Cub" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create asset" }));

    expect(await screen.findAllByText(/couldn’t be created/)).not.toHaveLength(
      0,
    );
    expect(screen.getByLabelText(/^Name/)).toHaveValue("Cub Frontier");
    expect(screen.getByLabelText(/Manufacturer/)).toHaveValue("Cub");
  });

  it("says something human when the network fails, never an internal detail", async () => {
    fetchMock.mockRejectedValue(new Error("D1_ERROR: no such table: assets"));
    render(<NewAssetForm onCreated={() => {}} />);
    typeName("Cub Frontier");
    chooseType("Trailer or camper");
    fireEvent.click(screen.getByRole("button", { name: "Create asset" }));

    expect(await screen.findAllByText(/couldn’t be created/)).not.toHaveLength(
      0,
    );
    expect(screen.queryByText(/D1_ERROR/)).toBeNull();
    expect(screen.queryByText(/no such table/)).toBeNull();
  });
});
