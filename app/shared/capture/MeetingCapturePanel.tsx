/**
 * MOBILE-01 — Quick Capture: Meeting.
 *
 * A Meeting needs two things to exist: a title and a start time. Everything else
 * (attendees, end time, location, mode, link) belongs to the Meeting workspace,
 * where it can be filled in while the meeting is actually happening — so capture
 * asks for the two, defaults the start to the next quarter hour in the OWNER's
 * timezone, and opens the created Meeting workspace immediately.
 *
 * Attendees stay one tap away rather than hidden: the same server-backed attendee
 * search the full form uses sits behind a disclosure, because "who is this with"
 * is often known at capture time and is expensive to add later.
 *
 * It posts to `POST /meetings/create` — the MEET-01 route that converts the local
 * wall clock to UTC with the owner's timezone rules server-side. The client's
 * rounded default is a convenience, never an authority.
 */

import { useEffect, useState } from "react";

import {
  Form,
  FormButton,
  FormErrorSummary,
  LocalDateTimeField,
  SelectField,
  TextField,
  required,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";
import { utcToOwnerLocal } from "~/shared/datetime";

import { defaultMeetingStartLocal } from "./capture-model";
import { encodeCaptureContext } from "./capture-context";
import { useCaptureContext } from "./use-capture-context";
import { useAttendeeOptions } from "./use-attendee-options";
import type { CapturePanelProps } from "./types";

type Values = {
  readonly title: string;
  readonly startsAtLocal: string;
  readonly attendeeIds: readonly string[];
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  startsAtLocal: "Start",
  attendeeIds: "Attendees",
};

type CreateMeetingResponse = {
  readonly ok: boolean;
  readonly meetingId?: string;
  readonly fieldErrors?: Record<string, string>;
  readonly formError?: string;
};

export function MeetingCapturePanel({
  firstFieldRef,
  onClose,
  captureContext,
}: CapturePanelProps) {
  const { context } = useCaptureContext();
  const attendees = useAttendeeOptions();
  const [navigating, setNavigating] = useState(false);

  const form = useForm<Values>({
    initialValues: {
      title: "",
      startsAtLocal: "",
      attendeeIds:
        captureContext?.sourceEntityType === "person"
          ? [captureContext.sourceEntityId]
          : [],
    },
    fields: {
      title: { validate: required("Enter a meeting title.") },
      startsAtLocal: { validate: required("Enter the start date and time.") },
    },
    fieldOrder: ["title", "startsAtLocal", "attendeeIds"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("title", values.title);
      body.set("startsAtLocal", values.startsAtLocal);
      if (captureContext) {
        body.set("captureContext", encodeCaptureContext(captureContext));
      }
      for (const attendeeId of values.attendeeIds) {
        body.append("attendeeIds", attendeeId);
      }

      let data: CreateMeetingResponse;
      try {
        const response = await fetch("/meetings/create", {
          method: "POST",
          body,
        });
        data = (await response.json()) as CreateMeetingResponse;
      } catch {
        return {
          status: "error",
          formError:
            "That meeting couldn’t be created. Your text is safe — try again.",
        };
      }
      if (data.ok && data.meetingId) {
        // A captured Meeting goes straight to its workspace: the next thing the
        // user does is run the meeting, not admire a confirmation.
        setNavigating(true);
        onClose();
        window.location.assign(`/meeting/${data.meetingId}?tab=meeting`);
        return { status: "success" };
      }
      return {
        status: "error",
        formError: data.formError,
        fieldErrors: data.fieldErrors as
          Partial<Record<keyof Values & string, string>> | undefined,
      };
    },
  });

  const titleField = form.field("title");
  const startField = form.field("startsAtLocal");
  const setStart = form.setValue;

  // Default the start to the next quarter hour ONCE the owner timezone is known,
  // and only while the user has not typed a start of their own.
  const timezone = context?.timezone;
  const currentStart = form.values.startsAtLocal;
  useEffect(() => {
    if (timezone === undefined || currentStart !== "") {
      return;
    }
    setStart(
      "startsAtLocal",
      defaultMeetingStartLocal(new Date(), timezone, utcToOwnerLocal),
    );
    // Runs once per timezone resolution; `currentStart` is read, not depended on,
    // so typing a start does not retrigger the default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timezone, setStart]);

  return (
    <Form
      aria-label="Capture a meeting"
      busy={form.isSubmitting || navigating}
      onSubmit={form.handleSubmit}
      className="dh-capture-form"
    >
      <FormErrorSummary
        formError={form.formError}
        fieldErrors={form.fieldErrors}
        order={form.fieldOrder as string[]}
        labels={FIELD_LABELS}
        onFocusField={form.focusField}
      />

      <TextField
        label="Title"
        required
        maxLength={512}
        placeholder="What is the meeting?"
        {...titleField}
        controlRef={(node) => {
          firstFieldRef.current = node instanceof HTMLElement ? node : null;
          titleField.controlRef?.(node);
        }}
      />

      <LocalDateTimeField
        label="Start"
        required
        help={
          timezone
            ? `In your timezone (${timezone}).`
            : "In your configured timezone."
        }
        {...startField}
      />

      <details className="dh-progressive-section">
        <summary>Add attendees</summary>
        <SelectField
          label="Attendees"
          multiple
          placeholder="Search people"
          options={attendees.withSelected(form.values.attendeeIds)}
          onSearch={attendees.search}
          loading={attendees.loading}
          emptyMessage="No matching people"
          {...form.field("attendeeIds")}
        />
      </details>

      <div className="dh-capture-actions">
        <FormButton
          type="submit"
          variant="primary"
          pending={form.isSubmitting || navigating}
        >
          Create meeting
        </FormButton>
      </div>
    </Form>
  );
}
