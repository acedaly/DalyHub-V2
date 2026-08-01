import { env } from "cloudflare:workers";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import {
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  LocalDateTimeField,
  SelectField,
  TextField,
  required,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";

import { useSetMobileTopBar } from "~/shared/shell";

import { useAttendeeSearch } from "../use-attendee-search";
import type { Route } from "./+types/new";

type Values = {
  readonly title: string;
  readonly startsAtLocal: string;
  readonly attendeeIds: readonly string[];
  readonly endsAtLocal: string;
  readonly location: string;
  readonly mode: string;
  readonly meetingUrl: string;
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  startsAtLocal: "Start date and time",
  attendeeIds: "Attendees",
  endsAtLocal: "End time",
  location: "Location",
  mode: "Mode",
  meetingUrl: "Meeting link",
};

export function meta() {
  return [{ title: "New meeting · DalyHub" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const preferences = await scope.appPreferences.get(session.user.subject);
  return { timezone: preferences.timezone };
}

export default function NewMeeting({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const attendeeSearch = useAttendeeSearch();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<Values>({
    initialValues: {
      title: "",
      startsAtLocal: "",
      attendeeIds: [],
      endsAtLocal: "",
      location: "",
      mode: "",
      meetingUrl: "",
    },
    fields: {
      title: { validate: required("Enter a meeting title.") },
      startsAtLocal: {
        validate: required("Enter the start date and time."),
      },
    },
    fieldOrder: [
      "title",
      "startsAtLocal",
      "attendeeIds",
      "endsAtLocal",
      "location",
      "mode",
      "meetingUrl",
    ],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("title", values.title);
      body.set("startsAtLocal", values.startsAtLocal);
      if (values.endsAtLocal) body.set("endsAtLocal", values.endsAtLocal);
      if (values.location) body.set("location", values.location);
      if (values.mode) body.set("mode", values.mode);
      if (values.meetingUrl) body.set("meetingUrl", values.meetingUrl);
      for (const attendeeId of values.attendeeIds) {
        body.append("attendeeIds", attendeeId);
      }

      try {
        const response = await fetch("/meetings/create", {
          method: "POST",
          body,
        });
        const data = (await response.json()) as {
          readonly ok: boolean;
          readonly meetingId?: string;
          readonly fieldErrors?: Record<string, string>;
          readonly formError?: string;
        };
        if (data.ok && data.meetingId) {
          navigate(`/meeting/${data.meetingId}?tab=meeting`);
          return { status: "success" };
        }
        return {
          status: "error",
          formError: data.formError,
          fieldErrors: data.fieldErrors as Partial<
            Record<keyof Values, string>
          >,
        };
      } catch {
        return {
          status: "error",
          formError:
            "That meeting couldn’t be created. Your text is safe — try again.",
        };
      }
    },
  });

  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  // UX-01 — this page composes no `PaneHeader`, so it must publish its own phone
  // top-bar identity; without it the bar showed the workspace name and offered no
  // way back to the collection.
  useSetMobileTopBar({ title: "New meeting", backTo: "/meetings" });

  const titleField = form.field("title");
  const attendeeField = form.field("attendeeIds");
  const attendeeOptions = attendeeSearch.optionsWithSelected(
    attendeeField.value,
  );

  return (
    // UX-01 — a `section`, not a `main`. The app shell already renders the one
    // `main` landmark this route is rendered INSIDE; a second one here gave the
    // page two main landmarks (a WCAG 2.2 landmark defect). The heading is also
    // labelled explicitly so the region is named for a screen reader.
    <section className="dh-meeting-new" aria-labelledby="new-meeting-title">
      <h1 id="new-meeting-title">New meeting</h1>
      <p>
        Times are interpreted in {loaderData.timezone}. Details can be filled in
        after creation.
      </p>
      <Form
        aria-label="New meeting"
        busy={form.isSubmitting}
        onSubmit={form.handleSubmit}
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
          maxLength={240}
          autoComplete="off"
          {...titleField}
          controlRef={(node) => {
            titleField.controlRef?.(node);
            titleInputRef.current =
              node instanceof HTMLInputElement ? node : null;
          }}
        />
        <LocalDateTimeField
          label="Start date and time"
          required
          {...form.field("startsAtLocal")}
        />
        <SelectField
          label="Attendees"
          multiple
          placeholder="Search People"
          options={attendeeOptions}
          onSearch={attendeeSearch.search}
          loading={attendeeSearch.loading}
          emptyMessage="No matching People"
          {...attendeeField}
          onChange={(ids) => {
            attendeeField.onChange(ids);
            attendeeSearch.rememberSelected(ids);
          }}
        />

        <details
          className="dh-progressive-section"
          open={detailsOpen}
          onToggle={(event) =>
            setDetailsOpen((event.currentTarget as HTMLDetailsElement).open)
          }
        >
          <summary>More details</summary>
          <LocalDateTimeField label="End time" {...form.field("endsAtLocal")} />
          <TextField label="Location" {...form.field("location")} />
          <SelectField
            label="Mode"
            options={[
              { value: "", label: "Not set" },
              { value: "in_person", label: "In person" },
              { value: "phone", label: "Phone" },
              { value: "online", label: "Online" },
            ]}
            {...form.field("mode")}
          />
          <TextField
            label="Meeting link"
            type="url"
            {...form.field("meetingUrl")}
          />
        </details>

        <FormActions>
          <FormButton
            type="button"
            variant="secondary"
            onClick={() => navigate("/meetings")}
            disabled={form.isSubmitting}
          >
            Cancel
          </FormButton>
          <FormButton
            type="submit"
            variant="primary"
            pending={form.isSubmitting}
          >
            Create meeting
          </FormButton>
        </FormActions>
      </Form>
    </section>
  );
}
