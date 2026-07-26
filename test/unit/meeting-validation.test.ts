import { describe, expect, it } from "vitest";
import {
  MeetingValidationError,
  validateCreateMeeting,
  validateUpdateMeeting,
} from "../../app/kernel/meetings";
describe("meeting validation", () => {
  const valid = {
    title: "Weekly planning",
    startsAt: "2026-07-27T09:00:00Z",
    timezone: "UTC",
  };
  it("normalises a valid meeting", () =>
    expect(validateCreateMeeting(valid)).toMatchObject({
      title: "Weekly planning",
      startsAt: "2026-07-27T09:00:00.000Z",
      endsAt: null,
    }));
  it("rejects impossible ranges", () =>
    expect(() =>
      validateCreateMeeting({ ...valid, endsAt: "2026-07-27T08:00:00Z" }),
    ).toThrow(MeetingValidationError));
  it("rejects an invalid timezone", () =>
    expect(() =>
      validateCreateMeeting({ ...valid, timezone: "Mars/Olympus" }),
    ).toThrow(/timezone/));
  it("allows only safe external meeting URLs", () =>
    expect(() =>
      validateCreateMeeting({ ...valid, meetingUrl: "javascript:alert(1)" }),
    ).toThrow(/https/));
  it("keeps agenda and notes independent", () =>
    expect(
      validateUpdateMeeting({
        agendaMarkdown: "Agenda",
        notesMarkdown: "Notes",
      }),
    ).toMatchObject({ agendaMarkdown: "Agenda", notesMarkdown: "Notes" }));
});
