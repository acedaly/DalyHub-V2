/**
 * The Universal Relationship System — the browser transport for `/links`.
 *
 * Thin `fetch` wrappers over the shared links endpoint, mirroring DS-08 Search's
 * `client.ts`: the browser sends only bounded parameters and treats every
 * response as untrusted, rebuilding validated shapes rather than casting. A
 * non-OK response or malformed JSON throws, and the controller turns that into a
 * calm, retryable state. The endpoint is authenticated and workspace-scoped
 * server-side; the client only ever names an anchor entity id.
 */

import type { EntityLinkTargetOption } from "~/shared/forms/model";

import type {
  LinkedItem,
  LinkedItemsPage,
  LinkSummary,
} from "./linked-items-model";

/** The shared links resource route. */
export const LINKS_ENDPOINT = "/links";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function decodeTargetOption(value: unknown): EntityLinkTargetOption | null {
  if (!isRecord(value)) return null;
  const { id, type, title } = value;
  if (typeof id !== "string" || typeof type !== "string") return null;
  return { id, type, title: typeof title === "string" ? title : "" };
}

function decodeLinkedItem(value: unknown): LinkedItem | null {
  if (!isRecord(value)) return null;
  const target = decodeTargetOption(value.target);
  if (target === null) return null;
  const { linkId, linkType, direction, removable } = value;
  if (typeof linkId !== "string" || typeof linkType !== "string") return null;
  if (direction !== "outgoing" && direction !== "incoming") return null;
  return {
    linkId,
    target,
    linkType,
    direction,
    removable: removable === true,
  };
}

/**
 * Fetch one page of the anchor's Linked Items. Throws on a non-OK/invalid
 * response. Pass the previous page's `nextCursor` as `cursor` to load the next
 * page — so a record with many structural links still reaches its later
 * `link.related` relationships (server-side filtering paginates correctly).
 */
export async function fetchLinkedItems(
  anchorId: string,
  signal: AbortSignal,
  cursor?: string,
): Promise<LinkedItemsPage> {
  const params = new URLSearchParams({ op: "list", anchor: anchorId });
  if (cursor) params.set("cursor", cursor);
  const url = `${LINKS_ENDPOINT}?${params.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    signal,
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("links request failed");
  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.items)) {
    throw new Error("invalid links response");
  }
  const items = body.items
    .map(decodeLinkedItem)
    .filter((item): item is LinkedItem => item !== null);
  const nextCursor =
    typeof body.nextCursor === "string" && body.nextCursor.length > 0
      ? body.nextCursor
      : null;
  return { items, nextCursor };
}

/** Search for link-target candidates for the anchor. */
export async function searchLinkTargets(
  anchorId: string,
  query: string,
  signal: AbortSignal,
): Promise<readonly EntityLinkTargetOption[]> {
  const url =
    `${LINKS_ENDPOINT}?op=search&anchor=${encodeURIComponent(anchorId)}` +
    `&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    method: "GET",
    signal,
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("link target search failed");
  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.options)) return [];
  return body.options
    .map(decodeTargetOption)
    .filter((option): option is EntityLinkTargetOption => option !== null);
}

/** Fetch a hover-card summary for one linked record (or null). */
export async function fetchLinkSummary(
  anchorId: string,
  targetId: string,
  signal: AbortSignal,
): Promise<LinkSummary | null> {
  const url =
    `${LINKS_ENDPOINT}?op=summary&anchor=${encodeURIComponent(anchorId)}` +
    `&target=${encodeURIComponent(targetId)}`;
  const response = await fetch(url, {
    method: "GET",
    signal,
    headers: { accept: "application/json" },
  });
  if (!response.ok) return null;
  const body: unknown = await response.json();
  if (!isRecord(body) || !isRecord(body.summary)) return null;
  const { id, type, title, createdAt, updatedAt } = body.summary;
  if (
    typeof id !== "string" ||
    typeof type !== "string" ||
    typeof title !== "string" ||
    typeof createdAt !== "string" ||
    typeof updatedAt !== "string"
  ) {
    return null;
  }
  return { id, type, title, createdAt, updatedAt };
}

/** The typed outcome of a link/unlink mutation. */
export interface LinkMutationOutcome {
  readonly ok: boolean;
  readonly message?: string;
}

async function postLink(form: FormData): Promise<LinkMutationOutcome> {
  const response = await fetch(LINKS_ENDPOINT, {
    method: "POST",
    body: form,
    headers: { accept: "application/json" },
  });
  const body: unknown = await response.json().catch(() => null);
  if (isRecord(body) && typeof body.ok === "boolean") {
    return {
      ok: body.ok,
      ...(typeof body.message === "string" ? { message: body.message } : {}),
    };
  }
  return { ok: false, message: "That couldn't be saved. Please try again." };
}

/** Create a `link.related` link from the anchor to a target. */
export function createLink(params: {
  readonly anchorId: string;
  readonly targetId: string;
  readonly direction: "outgoing" | "incoming";
}): Promise<LinkMutationOutcome> {
  const form = new FormData();
  form.set("intent", "link");
  form.set("anchor", params.anchorId);
  form.set("targetId", params.targetId);
  form.set("direction", params.direction);
  return postLink(form);
}

/** Remove a link the anchor owns. */
export function removeLink(params: {
  readonly anchorId: string;
  readonly linkId: string;
}): Promise<LinkMutationOutcome> {
  const form = new FormData();
  form.set("intent", "unlink");
  form.set("anchor", params.anchorId);
  form.set("linkId", params.linkId);
  return postLink(form);
}
