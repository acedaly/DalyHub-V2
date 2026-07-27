import type { ReviewSort, ReviewType, ReviewView } from "./review";
import { InvalidReviewCursorError } from "./review-errors";

export const REVIEW_CURSOR_VERSION = 1;

export interface ReviewCursorScope {
  readonly workspaceId: string;
  readonly view: ReviewView;
  readonly type: ReviewType | "all";
  readonly query: string | null;
  readonly sort: ReviewSort;
  readonly today: string | null;
}

export interface ReviewCursorPosition {
  readonly primary: string;
  readonly id: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeReviewCursor(
  scope: ReviewCursorScope,
  position: ReviewCursorPosition,
): string {
  return toBase64Url(
    new TextEncoder().encode(
      JSON.stringify([
        REVIEW_CURSOR_VERSION,
        scope.workspaceId,
        scope.view,
        scope.type,
        scope.query,
        scope.sort,
        scope.today,
        position.primary,
        position.id,
      ]),
    ),
  );
}

export function decodeReviewCursorForScope(
  cursor: string,
  expected: ReviewCursorScope,
): ReviewCursorPosition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(fromBase64Url(cursor)),
    );
  } catch {
    throw new InvalidReviewCursorError();
  }
  if (!Array.isArray(parsed) || parsed.length !== 9) {
    throw new InvalidReviewCursorError();
  }
  const [version, workspaceId, view, type, query, sort, today, primary, id] =
    parsed as unknown[];
  if (
    version !== REVIEW_CURSOR_VERSION ||
    workspaceId !== expected.workspaceId ||
    view !== expected.view ||
    type !== expected.type ||
    query !== expected.query ||
    sort !== expected.sort ||
    today !== expected.today ||
    typeof primary !== "string" ||
    typeof id !== "string"
  ) {
    throw new InvalidReviewCursorError();
  }
  return { primary, id };
}
