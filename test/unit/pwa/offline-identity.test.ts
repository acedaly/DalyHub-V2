/**
 * PWA-04 — identity and workspace namespacing.
 *
 * The namespace is the isolation boundary on the device. These tests assert the
 * property that actually matters: two different (identity, workspace, schema)
 * triples never produce the same key, and the raw subject and workspace id never
 * appear in it.
 */

import { describe, expect, it } from "vitest";

import {
  OFFLINE_SCHEMA_VERSION,
  deriveOfflineNamespace,
  isOfflineNamespace,
  namespaceDisplayFragment,
  namespaceSchemaVersion,
} from "~/kernel/offline";

const SUBJECT = "access-subject-0001";
const OTHER_SUBJECT = "access-subject-0002";
const WORKSPACE = "workspace-alpha";
const OTHER_WORKSPACE = "workspace-beta";

describe("deriveOfflineNamespace", () => {
  it("is stable for the same identity, workspace and schema", async () => {
    const first = await deriveOfflineNamespace({
      subject: SUBJECT,
      workspaceId: WORKSPACE,
    });
    const second = await deriveOfflineNamespace({
      subject: SUBJECT,
      workspaceId: WORKSPACE,
    });
    expect(first).toBe(second);
    expect(isOfflineNamespace(first)).toBe(true);
  });

  it("differs for a different identity in the same workspace", async () => {
    const mine = await deriveOfflineNamespace({
      subject: SUBJECT,
      workspaceId: WORKSPACE,
    });
    const theirs = await deriveOfflineNamespace({
      subject: OTHER_SUBJECT,
      workspaceId: WORKSPACE,
    });
    expect(mine).not.toBe(theirs);
  });

  it("differs for the same identity in a different workspace", async () => {
    const alpha = await deriveOfflineNamespace({
      subject: SUBJECT,
      workspaceId: WORKSPACE,
    });
    const beta = await deriveOfflineNamespace({
      subject: SUBJECT,
      workspaceId: OTHER_WORKSPACE,
    });
    expect(alpha).not.toBe(beta);
  });

  it("differs for a different offline schema version", async () => {
    const v1 = await deriveOfflineNamespace({
      subject: SUBJECT,
      workspaceId: WORKSPACE,
      schemaVersion: 1,
    });
    const v2 = await deriveOfflineNamespace({
      subject: SUBJECT,
      workspaceId: WORKSPACE,
      schemaVersion: 2,
    });
    expect(v1).not.toBe(v2);
    expect(namespaceSchemaVersion(v1)).toBe(1);
    expect(namespaceSchemaVersion(v2)).toBe(2);
  });

  it("cannot be collided by moving the separator between the two inputs", async () => {
    // ("a", "b|c") and ("a|b", "c") must not hash to the same value. A naive
    // `${subject}:${workspaceId}` concatenation would.
    const left = await deriveOfflineNamespace({
      subject: "a",
      workspaceId: "b c",
    });
    const right = await deriveOfflineNamespace({
      subject: "a b",
      workspaceId: "c",
    });
    expect(left).not.toBe(right);
  });

  it("contains neither the subject nor the workspace id", async () => {
    const namespace = await deriveOfflineNamespace({
      subject: SUBJECT,
      workspaceId: WORKSPACE,
    });
    expect(namespace).not.toContain(SUBJECT);
    expect(namespace).not.toContain(WORKSPACE);
    expect(namespace).toMatch(/^dh1-\d+-[0-9a-f]{32}$/);
  });

  it("refuses to derive a namespace without both inputs", async () => {
    await expect(
      deriveOfflineNamespace({ subject: "", workspaceId: WORKSPACE }),
    ).rejects.toThrow();
    await expect(
      deriveOfflineNamespace({ subject: SUBJECT, workspaceId: "" }),
    ).rejects.toThrow();
  });

  it("uses the running schema version by default", async () => {
    const namespace = await deriveOfflineNamespace({
      subject: SUBJECT,
      workspaceId: WORKSPACE,
    });
    expect(namespaceSchemaVersion(namespace)).toBe(OFFLINE_SCHEMA_VERSION);
  });
});

describe("namespaceDisplayFragment", () => {
  it("shows a short, non-identifying fragment for Settings", async () => {
    const namespace = await deriveOfflineNamespace({
      subject: SUBJECT,
      workspaceId: WORKSPACE,
    });
    const fragment = namespaceDisplayFragment(namespace);
    expect(fragment).toHaveLength(8);
    expect(namespace).toContain(fragment);
    expect(fragment).not.toContain(SUBJECT);
  });
});

describe("isOfflineNamespace", () => {
  it("rejects anything not minted by this module", () => {
    expect(isOfflineNamespace("")).toBe(false);
    expect(isOfflineNamespace("dh1-1-notahexdigest")).toBe(false);
    expect(isOfflineNamespace(`${SUBJECT}:${WORKSPACE}`)).toBe(false);
    expect(isOfflineNamespace(undefined)).toBe(false);
  });
});
