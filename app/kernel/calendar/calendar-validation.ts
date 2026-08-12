/**
 * CAL-01 — validation for the owner-supplied half of a calendar source.
 *
 * Server-side and boundary-enforced (AGENTS.md §17). The URL half is validated
 * by `feed-url.ts`, which is a security control rather than a form check and is
 * therefore kept separate and reused by the redirect path.
 */

import { CALENDAR_SOURCE_NAME_MAX_LENGTH } from "./calendar";

export class CalendarValidationError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "CalendarValidationError";
  }
}

/**
 * The owner's name for a source.
 *
 * Deliberately required. An unnamed source would be shown by its URL — which is
 * a credential and must never be displayed — or by its provider, which is not
 * distinguishing when the owner has two Apple calendars.
 */
export function parseCalendarSourceName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (name.length === 0) {
    throw new CalendarValidationError(
      "name",
      "Give this calendar a name you will recognise — “Work”, “Family”.",
    );
  }
  if (name.length > CALENDAR_SOURCE_NAME_MAX_LENGTH) {
    throw new CalendarValidationError(
      "name",
      `Keep the name under ${CALENDAR_SOURCE_NAME_MAX_LENGTH} characters.`,
    );
  }
  // Control characters would let a name fake structure in a list.
  return name // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ");
}

/** A source id from a form. Compared, never parsed, never reflected into a page. */
export function parseCalendarSourceId(value: unknown): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (id.length === 0 || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new CalendarValidationError("id", "That calendar is unknown.");
  }
  return id;
}
