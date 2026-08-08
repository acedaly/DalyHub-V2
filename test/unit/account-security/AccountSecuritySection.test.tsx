/**
 * SET-03 — `Settings → Account & security`, as the owner reads it.
 *
 * The tests are organised around the promises the surface makes, because those
 * are the things a future edit could quietly break:
 *
 *   - identity comes from trusted session data, and an absent optional claim
 *     renders honestly rather than being filled in;
 *   - no token, cookie, claim or secret is ever rendered;
 *   - a global sign-out control exists if and only if the SERVER says the
 *     capability does;
 *   - clearing local data is confirmed, and the confirmation tells the truth
 *     about unsynchronised work.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AccountSecuritySection,
  type AccountSecurityData,
} from "~/modules/settings/AccountSecuritySection";
import { FeedbackProvider } from "~/shared/feedback";

const OFFLINE = {
  status: {
    pendingCaptures: 0,
    failedCaptures: 0,
    connection: "online",
    sync: "idle",
    lastSyncedAt: null,
  },
  meta: { identityLabel: "owner@example.com" },
  clearCachedData: vi.fn(async () => {}),
  resetDevice: vi.fn(async () => {}),
};

let offlineValue: unknown = OFFLINE;

vi.mock("~/shared/offline", () => ({
  useOffline: () => offlineValue,
  clearServiceWorkerCaches: async () => {},
}));

function data(
  overrides: Partial<AccountSecurityData> = {},
): AccountSecurityData {
  return {
    identity: {
      email: "owner@example.com",
      displayName: "Owner Name",
      subjectFragment: "9f2c1a7b",
      source: "cloudflare-access",
    },
    session: {
      issuedAt: "2026-08-08T08:00:00.000Z",
      expiresAt: "2126-08-08T20:00:00.000Z",
    },
    globalSignOutSupported: false,
    securityActivity: [],
    environment: "production",
    ...overrides,
  };
}

function renderSection(value = data()) {
  return render(
    <FeedbackProvider>
      <AccountSecuritySection data={value} />
    </FeedbackProvider>,
  );
}

describe("Account & security — identity", () => {
  it("shows the trusted session identity", () => {
    renderSection();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("Owner Name")).toBeInTheDocument();
    expect(screen.getByText("Cloudflare Access")).toBeInTheDocument();
    expect(screen.getByText("production")).toBeInTheDocument();
  });

  // An absent optional claim is stated as absent. The alternative — deriving a
  // name from the email and presenting it as the provider's — would be the page
  // showing an inference as an observation.
  it("says so when the provider supplied no name", () => {
    renderSection(
      data({
        identity: {
          email: "owner@example.com",
          displayName: null,
          subjectFragment: "9f2c1a7b",
          source: "cloudflare-access",
        },
      }),
    );
    expect(
      screen.getByText(/did not supply a name for this sign-in/i),
    ).toBeInTheDocument();
  });

  it("shows only a fragment of the identity subject, marked as partial", () => {
    renderSection();
    expect(screen.getByText("…9f2c1a7b")).toBeInTheDocument();
  });
});

describe("Account & security — what is never rendered", () => {
  it("renders no token, cookie, claim or configuration value", () => {
    const { container } = renderSection();
    const text = container.textContent ?? "";
    for (const forbidden of [
      "eyJ", // a JWT's first characters
      "Cf-Access",
      "CF_Authorization",
      "cloudflareaccess.com",
      "aud",
      "jwks",
      "workspace_id",
      "api_key",
    ]) {
      expect(text.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

describe("Account & security — the session", () => {
  it("reports a live session with a coarse remaining time", () => {
    renderSection();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText(/left, based on the expiry time/i)).toBeVisible();
  });

  // The credential need not carry `iat`. When it does not, the page says so
  // rather than rendering the epoch as a plausible timestamp.
  it("says 'Not reported' when the sign-in carried no issue time", () => {
    renderSection(
      data({
        session: { issuedAt: null, expiresAt: "2126-08-08T20:00:00.000Z" },
      }),
    );
    expect(
      screen.getByText(/does not know when it started/i),
    ).toBeInTheDocument();
  });

  it("reports an expired credential as expired, not as active", () => {
    renderSection(
      data({
        session: {
          issuedAt: "2020-01-01T00:00:00.000Z",
          expiresAt: "2020-01-01T01:00:00.000Z",
        },
      }),
    );
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  // The single most important sentence on the page: DalyHub cannot enumerate
  // sessions, and must not appear to.
  it("states plainly that other sessions are not visible to DalyHub", () => {
    renderSection();
    expect(
      screen.getByText(/cannot see your other sessions or devices/i),
    ).toBeInTheDocument();
  });
});

describe("Account & security — global sign-out is conditional on real capability", () => {
  it("renders no 'sign out everywhere' BUTTON when the capability is absent", () => {
    renderSection();
    // The words appear, as an explanation of what DalyHub cannot do …
    expect(screen.getByText("Sign out everywhere")).toBeInTheDocument();
    // … but there is no control that would claim to do it.
    expect(
      screen.queryByRole("button", { name: /everywhere/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/DalyHub cannot do this/i)).toBeInTheDocument();
  });

  it("still offers the current-browser sign out, which claims only that", () => {
    renderSection();
    const button = screen.getByRole("button", { name: "Sign out" });
    expect(button).toBeInTheDocument();
    expect(screen.getByText(/Sign out of this browser/i)).toBeInTheDocument();
  });
});

describe("Account & security — local data", () => {
  it("warns that clearing everything destroys unsynchronised captures", () => {
    offlineValue = {
      ...OFFLINE,
      status: { ...OFFLINE.status, pendingCaptures: 3 },
    };
    renderSection();
    expect(
      screen.getByText(/3 offline captures that have never reached DalyHub/i),
    ).toBeInTheDocument();
    // …and that sign-out does NOT.
    expect(
      screen.getByText(/Signing out keeps them; clearing everything below/i),
    ).toBeInTheDocument();
    offlineValue = OFFLINE;
  });

  it("requires a typed confirmation before destroying unsynchronised work", async () => {
    offlineValue = {
      ...OFFLINE,
      status: { ...OFFLINE.status, pendingCaptures: 2 },
      resetDevice: vi.fn(async () => {}),
    };
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: /Clear everything…/ }));
    const dialog = screen.getByRole("dialog");
    const confirm = within(dialog).getByRole("button", {
      name: /Clear everything/,
    });
    // The destructive action is unreachable until the phrase is typed.
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Type clear to confirm/i), {
      target: { value: "clear" },
    });
    expect(confirm).toBeEnabled();
    offlineValue = OFFLINE;
  });

  it("confirms — but does not require a typed phrase — for reproducible data", () => {
    renderSection();
    fireEvent.click(
      screen.getByRole("button", { name: /Clear personal data…/ }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/anything you captured offline is kept/i),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /Clear personal data/ }),
    ).toBeEnabled();
  });
});

describe("Account & security — security activity", () => {
  it("renders recorded events newest-first with their own wording", () => {
    renderSection(
      data({
        securityActivity: [
          {
            id: "a1",
            type: "security.signed_out",
            occurredAt: "2026-08-08T10:00:00.000Z",
            summary:
              "Signed out of DalyHub and cleared this device's personal data.",
          },
        ],
      }),
    );
    expect(
      screen.getByText(/Signed out of DalyHub and cleared/i),
    ).toBeInTheDocument();
  });

  it("says nothing has happened rather than inventing a history", () => {
    renderSection();
    expect(screen.getByText(/No security activity yet/i)).toBeInTheDocument();
    // And it explains the boundary rather than leaving a suspicious gap.
    expect(
      screen.getByText(/never reach DalyHub, so they are not here/i),
    ).toBeInTheDocument();
  });
});
