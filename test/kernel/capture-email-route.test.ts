/**
 * CAPTURE-01 — inbound email capture against the REAL Workers runtime and D1.
 *
 * The Email Worker handler is driven with fixture messages — no real mail is sent
 * or received, and CI never depends on a mail system (CAPTURE-01 §54). What is proved here
 * is everything the pure policy tests cannot: that an accepted message becomes an
 * ordinary DalyHub record in the configured workspace, that a refused one writes
 * NOTHING, that repeated delivery is idempotent, and that email capture cannot
 * escape its workspace.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  handleCaptureEmail,
  type EmailCaptureEnv,
  type InboundEmail,
} from "~/platform/capture/email-capture.server";

import { resetTables } from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_capture_email_other";
const OWNER = "owner@daly.id.au";
const CAPTURE_ADDRESS = "capture@daly.id.au";

const CONFIGURED: EmailCaptureEnv = {
  DB: env.DB,
  DEFAULT_WORKSPACE_ID: WS,
  CAPTURE_EMAIL_RECIPIENTS: CAPTURE_ADDRESS,
  CAPTURE_EMAIL_ALLOWED_SENDERS: OWNER,
};

const PASSING_AUTH =
  "mx.cloudflare.com; dkim=pass header.d=daly.id.au; spf=pass smtp.mailfrom=daly.id.au; dmarc=pass header.from=daly.id.au";

/** A fixture message that behaves like the Cloudflare `ForwardableEmailMessage`. */
function inbound(options: {
  readonly raw: string;
  readonly from?: string;
  readonly to?: string;
  readonly authentication?: string | null;
}): InboundEmail & { readonly rejections: string[] } {
  const bytes = new TextEncoder().encode(options.raw);
  const rejections: string[] = [];
  const headers = new Headers();
  if (options.authentication !== null) {
    headers.set(
      "authentication-results",
      options.authentication ?? PASSING_AUTH,
    );
  }
  return {
    from: options.from ?? OWNER,
    to: options.to ?? CAPTURE_ADDRESS,
    headers,
    rawSize: bytes.byteLength,
    raw: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
    setReject(reason: string) {
      rejections.push(reason);
    },
    rejections,
  };
}

function message(lines: readonly string[]): string {
  return lines.join("\r\n");
}

async function countEntities(workspaceId = WS): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM entities WHERE workspace_id = ?1",
  )
    .bind(workspaceId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function firstEntity(): Promise<{ type: string; title: string } | null> {
  return await env.DB.prepare(
    "SELECT type, title FROM entities WHERE workspace_id = ?1 LIMIT 1",
  )
    .bind(WS)
    .first<{ type: string; title: string }>();
}

const NOW = new Date("2026-08-11T02:00:00.000Z");

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("an allowlisted sender can capture by email", () => {
  it("turns a forwarded email into an Inbox capture", async () => {
    const email = inbound({
      raw: message([
        "From: Aidan <owner@daly.id.au>",
        "Subject: Fwd: Your booking confirmation",
        "Message-ID: <fwd-1@daly.id.au>",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "Reference 12345. Arrive after 2pm.",
      ]),
    });
    await handleCaptureEmail(email, CONFIGURED, NOW);

    expect(email.rejections).toEqual([]);
    expect(await countEntities()).toBe(1);
    const entity = await firstEntity();
    // Inbox = an unassigned Task, the existing DalyHub semantics.
    expect(entity?.type).toBe("task");
    expect(entity?.title).toBe("Your booking confirmation");
  });

  it("honours the task: prefix", async () => {
    await handleCaptureEmail(
      inbound({
        raw: message([
          "From: owner@daly.id.au",
          "Subject: task: Call supplier tomorrow",
          "Message-ID: <task-1@daly.id.au>",
          "",
          "They open at nine.",
        ]),
      }),
      CONFIGURED,
      NOW,
    );
    const entity = await firstEntity();
    expect(entity?.type).toBe("task");
  });

  it("honours the note: prefix and stores readable Markdown", async () => {
    await handleCaptureEmail(
      inbound({
        raw: message([
          "From: owner@daly.id.au",
          "Subject: note: OpO workshop idea",
          "Message-ID: <note-1@daly.id.au>",
          "Content-Type: text/plain; charset=utf-8",
          "Content-Transfer-Encoding: quoted-printable",
          "",
          "Induction may work better as a prerequisite=2E",
        ]),
      }),
      CONFIGURED,
      NOW,
    );
    const entity = await firstEntity();
    expect(entity?.type).toBe("note");
    expect(entity?.title).toBe("OpO workshop idea");

    const row = await env.DB.prepare(
      "SELECT content FROM note_details WHERE workspace_id = ?1",
    )
      .bind(WS)
      .first<{ content: string }>();
    expect(row?.content).toContain(
      "Induction may work better as a prerequisite.",
    );
    expect(row?.content).toContain("Forwarded from: owner@daly.id.au");
  });

  it("stores no active HTML from an HTML-only message", async () => {
    await handleCaptureEmail(
      inbound({
        raw: message([
          "From: owner@daly.id.au",
          "Subject: note: Newsletter",
          "Message-ID: <html-1@daly.id.au>",
          "Content-Type: text/html; charset=utf-8",
          "",
          '<style>b{}</style><script>fetch("https://evil.example")</script><p>Readable part</p><img src="https://tracker.example/p.gif">',
        ]),
      }),
      CONFIGURED,
      NOW,
    );
    const row = await env.DB.prepare(
      "SELECT content FROM note_details WHERE workspace_id = ?1",
    )
      .bind(WS)
      .first<{ content: string }>();
    expect(row?.content).toContain("Readable part");
    expect(row?.content).not.toContain("<script");
    expect(row?.content).not.toContain("evil.example");
    expect(row?.content).not.toContain("tracker.example");
  });

  it("records the capture source honestly in Activity", async () => {
    await handleCaptureEmail(
      inbound({
        raw: message([
          "From: owner@daly.id.au",
          "Subject: note: Something",
          "Message-ID: <act-1@daly.id.au>",
          "",
          "Body",
        ]),
      }),
      CONFIGURED,
      NOW,
    );
    const row = await env.DB.prepare(
      "SELECT payload_json FROM activities WHERE type = 'capture.received'",
    ).first<{ payload_json: string }>();
    const payload = JSON.parse(row?.payload_json ?? "{}") as Record<
      string,
      unknown
    >;
    expect(payload.source).toBe("email");
    // Email holds no credential, so there is no token id to name.
    expect(payload.captureTokenId).toBeNull();
  });
});

describe("nobody else can", () => {
  it("refuses a sender who is not on the allowlist, and writes nothing", async () => {
    const email = inbound({
      raw: message([
        "From: owner@daly.id.au",
        "Subject: task: Sneaky",
        "",
        "x",
      ]),
      // The `From:` header claims the owner; the ENVELOPE says otherwise.
      from: "attacker@example.com",
    });
    await handleCaptureEmail(email, CONFIGURED, NOW);
    expect(email.rejections).toHaveLength(1);
    expect(await countEntities()).toBe(0);
  });

  it("refuses a message delivered to an address that is not the capture address", async () => {
    const email = inbound({
      raw: message(["Subject: task: Sneaky", "", "x"]),
      to: "someone-else@daly.id.au",
    });
    await handleCaptureEmail(email, CONFIGURED, NOW);
    expect(email.rejections).toHaveLength(1);
    expect(await countEntities()).toBe(0);
  });

  it("refuses a spoofed message that fails authentication", async () => {
    const email = inbound({
      raw: message(["Subject: task: Spoofed", "", "x"]),
      authentication: "mx.cloudflare.com; dkim=fail; spf=fail; dmarc=fail",
    });
    await handleCaptureEmail(email, CONFIGURED, NOW);
    expect(email.rejections).toHaveLength(1);
    expect(await countEntities()).toBe(0);
  });

  it("refuses a message with no authentication evidence at all", async () => {
    const email = inbound({
      raw: message(["Subject: task: Unverified", "", "x"]),
      authentication: null,
    });
    await handleCaptureEmail(email, CONFIGURED, NOW);
    expect(email.rejections).toHaveLength(1);
    expect(await countEntities()).toBe(0);
  });

  it("refuses everything when email capture is not configured", async () => {
    const email = inbound({
      raw: message(["Subject: task: Anything", "", "x"]),
    });
    await handleCaptureEmail(
      email,
      { DB: env.DB, DEFAULT_WORKSPACE_ID: WS },
      NOW,
    );
    expect(email.rejections).toHaveLength(1);
    expect(await countEntities()).toBe(0);
  });

  it("gives every refusal the SAME uninformative reason", async () => {
    const refusals = await Promise.all(
      [
        inbound({
          raw: message(["Subject: x", "", "x"]),
          from: "attacker@example.com",
        }),
        inbound({
          raw: message(["Subject: x", "", "x"]),
          to: "other@daly.id.au",
        }),
        inbound({
          raw: message(["Subject: x", "", "x"]),
          authentication: null,
        }),
      ].map(async (email) => {
        await handleCaptureEmail(email, CONFIGURED, NOW);
        return email.rejections[0];
      }),
    );
    expect(new Set(refusals).size).toBe(1);
  });
});

describe("bounds and robustness", () => {
  it("refuses an oversized message before reading it", async () => {
    const email = {
      ...inbound({ raw: message(["Subject: Huge", "", "x"]) }),
      rawSize: 10 * 1024 * 1024,
    };
    await handleCaptureEmail(email, CONFIGURED, NOW);
    expect(email.rejections).toHaveLength(1);
    expect(await countEntities()).toBe(0);
  });

  it("refuses an empty message rather than creating an empty record", async () => {
    const email = inbound({ raw: message(["Subject:", "", ""]) });
    await handleCaptureEmail(email, CONFIGURED, NOW);
    expect(email.rejections).toHaveLength(1);
    expect(await countEntities()).toBe(0);
  });

  it("captures a malformed MIME message rather than losing the thought", async () => {
    const email = inbound({
      raw: message([
        "From: owner@daly.id.au",
        "Subject: task: Still readable",
        "Message-ID: <bad-1@daly.id.au>",
        'Content-Type: multipart/alternative; boundary="MISSING"',
        "",
        "--NOTTHEBOUNDARY",
        "garbage",
      ]),
    });
    await handleCaptureEmail(email, CONFIGURED, NOW);
    expect(email.rejections).toEqual([]);
    expect(await countEntities()).toBe(1);
    expect((await firstEntity())?.title).toBe("Still readable");
  });

  it("is idempotent across repeated delivery of the same message", async () => {
    const raw = message([
      "From: owner@daly.id.au",
      "Subject: task: Delivered twice",
      "Message-ID: <dup-1@daly.id.au>",
      "",
      "Body",
    ]);
    await handleCaptureEmail(inbound({ raw }), CONFIGURED, NOW);
    await handleCaptureEmail(inbound({ raw }), CONFIGURED, NOW);
    expect(await countEntities()).toBe(1);
  });

  it("treats two different messages as two captures", async () => {
    for (const id of ["<a@daly.id.au>", "<b@daly.id.au>"]) {
      await handleCaptureEmail(
        inbound({
          raw: message([
            "From: owner@daly.id.au",
            "Subject: task: Same words",
            `Message-ID: ${id}`,
            "",
            "Body",
          ]),
        }),
        CONFIGURED,
        NOW,
      );
    }
    expect(await countEntities()).toBe(2);
  });
});

describe("email capture cannot escape its workspace", () => {
  it("writes only into the configured workspace", async () => {
    await handleCaptureEmail(
      inbound({
        raw: message([
          "From: owner@daly.id.au",
          "Subject: task: Somewhere",
          "Message-ID: <ws-1@daly.id.au>",
          "",
          "Body",
        ]),
      }),
      CONFIGURED,
      NOW,
    );
    expect(await countEntities(WS)).toBe(1);
    expect(await countEntities(OTHER)).toBe(0);
  });

  it("ignores a workspace named in the message body", async () => {
    await handleCaptureEmail(
      inbound({
        raw: message([
          "From: owner@daly.id.au",
          "Subject: task: Redirected",
          "Message-ID: <ws-2@daly.id.au>",
          "",
          `workspaceId: ${OTHER}`,
        ]),
      }),
      CONFIGURED,
      NOW,
    );
    expect(await countEntities(OTHER)).toBe(0);
  });
});
