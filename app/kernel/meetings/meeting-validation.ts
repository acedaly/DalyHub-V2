import { MARKDOWN_SOURCE_MAX_BYTES } from "~/kernel/markdown";

import type { CreateMeetingInput, UpdateMeetingInput } from "./meeting";

export class MeetingValidationError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "MeetingValidationError";
  }
}

const modes = new Set(["in_person", "phone", "online"]);
const statuses = new Set(["planned", "completed", "cancelled"]);
export const meetingItemKinds = new Set([
  "agenda",
  "decision",
  "outcome",
  "action",
]);

function instant(value: string, field: string): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.valueOf()))
    throw new MeetingValidationError(field, "Enter a valid date and time.");
  return date.toISOString();
}

function timezone(value: string): string {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
  } catch {
    throw new MeetingValidationError("timezone", "Choose a valid timezone.");
  }
  return value;
}

function url(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new MeetingValidationError("meetingUrl", "Enter a valid https URL.");
  }
  if (parsed.protocol !== "https:")
    throw new MeetingValidationError(
      "meetingUrl",
      "Meeting links must use https.",
    );
  return parsed.toString();
}

function markdown(value: string, field: string): string {
  if (new TextEncoder().encode(value).length > MARKDOWN_SOURCE_MAX_BYTES)
    throw new MeetingValidationError(field, "This content is too large.");
  return value;
}

export function validateCreateMeeting(input: CreateMeetingInput) {
  const title = input.title.trim();
  if (!title)
    throw new MeetingValidationError("title", "Enter a meeting title.");
  if (title.length > 240)
    throw new MeetingValidationError(
      "title",
      "Keep the title under 240 characters.",
    );
  const startsAt = instant(input.startsAt, "startsAt");
  const endsAt = input.endsAt ? instant(input.endsAt, "endsAt") : null;
  if (endsAt && endsAt <= startsAt)
    throw new MeetingValidationError(
      "endsAt",
      "End time must be after start time.",
    );
  if (input.mode && !modes.has(input.mode))
    throw new MeetingValidationError("mode", "Choose a valid meeting mode.");
  return {
    ...input,
    title,
    startsAt,
    endsAt,
    timezone: timezone(input.timezone),
    location: input.location?.trim() || null,
    mode: input.mode ?? null,
    meetingUrl: url(input.meetingUrl),
    agendaMarkdown: markdown(input.agendaMarkdown ?? "", "agendaMarkdown"),
  };
}

export function validateUpdateMeeting(input: UpdateMeetingInput) {
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title)
      throw new MeetingValidationError("title", "Enter a meeting title.");
    if (title.length > 240)
      throw new MeetingValidationError(
        "title",
        "Keep the title under 240 characters.",
      );
  }
  if (input.status && !statuses.has(input.status))
    throw new MeetingValidationError("status", "Choose a valid status.");
  if (input.mode && !modes.has(input.mode))
    throw new MeetingValidationError("mode", "Choose a valid meeting mode.");
  return {
    ...input,
    title: input.title === undefined ? undefined : input.title.trim(),
    startsAt:
      input.startsAt === undefined
        ? undefined
        : instant(input.startsAt, "startsAt"),
    endsAt: input.endsAt ? instant(input.endsAt, "endsAt") : input.endsAt,
    timezone:
      input.timezone === undefined ? undefined : timezone(input.timezone),
    meetingUrl:
      input.meetingUrl === undefined ? undefined : url(input.meetingUrl),
    agendaMarkdown:
      input.agendaMarkdown === undefined
        ? undefined
        : markdown(input.agendaMarkdown, "agendaMarkdown"),
    notesMarkdown:
      input.notesMarkdown === undefined
        ? undefined
        : markdown(input.notesMarkdown, "notesMarkdown"),
  };
}
