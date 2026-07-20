/**
 * DS-10b — Shared Settings layout demonstration route (development only).
 *
 * A FIXTURE, not a product surface. Added to the route tree only when NOT building
 * for production (the `NODE_ENV` guard in `app/routes.ts`), so it never reaches a
 * deployed Worker, and it is not a module (never in registry-driven navigation).
 * It composes ENTIRELY from the shared DS-10b Settings system (`~/shared/settings`)
 * over DS-01 tokens, DS-06 form controls and the DS-10 Feedback platform — there is
 * no bespoke settings, form, notification or overlay logic here.
 *
 * All data is in-memory (no repositories, D1, bindings, migration or persistence).
 * The point is to prove the ONE shared Settings layout every future module composes
 * for app / workspace / module / record settings, at every scope.
 *
 * It demonstrates: grouped ordinary settings; an immediate toggle; an immediate
 * select; an explicit-save text setting with validation failure, save success,
 * simulated save failure + retry, and dirty cancel/revert; a dangerous setting with
 * confirmation (incl. typed confirmation and failure/retry); long labels and
 * descriptions; disabled and loading controls; and embedding within a constrained
 * container. Light/dark, reduced motion and the 320px layout are exercised by the
 * Playwright coverage against this same fixture.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useFeedback } from "~/shared/feedback";
import {
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  TextField,
  composeValidators,
  maxLength,
  required,
  useForm,
} from "~/shared/forms";
import {
  DangerousAction,
  SettingsGroup,
  SettingsLayout,
  SettingsRow,
  useImmediateSetting,
} from "~/shared/settings";

import "~/styles/settings-demo.css";

export function meta() {
  return [{ title: "Settings layout · DalyHub design fixtures" }];
}

// ---------------------------------------------------------------- helpers

/** A small, abortable delay used to simulate a server round-trip. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

// ---------------------------------------------------------------- immediate settings

function ImmediateToggleRow() {
  const setting = useImmediateSetting<boolean>({
    initialValue: false,
    successMessage: "Preference saved",
    feedbackKey: "compact-mode",
    onApply: (value, signal) => delay(450, signal),
  });

  return (
    <SettingsRow
      label="Compact mode"
      description="Reduce padding across lists and cards for denser information. Applies immediately."
      status={setting.pending ? "Saving…" : undefined}
      statusLive
      control={(ids) => (
        <input
          id={ids.controlId}
          type="checkbox"
          role="switch"
          className="dh-settings-switch"
          aria-labelledby={ids.labelId}
          aria-describedby={ids.describedById}
          checked={setting.value}
          disabled={setting.pending}
          onChange={(event) => setting.apply(event.target.checked)}
          data-testid="toggle-compact"
        />
      )}
    />
  );
}

function ImmediateSelectRow() {
  const setting = useImmediateSetting<string>({
    initialValue: "list",
    successMessage: "Default view updated",
    feedbackKey: "default-view",
    onApply: (value, signal) => delay(350, signal),
  });

  return (
    <SettingsRow
      label="Default view"
      description="The layout new collections open in. Applies immediately."
      control={(ids) => (
        <select
          id={ids.controlId}
          className="dh-settings-select"
          aria-labelledby={ids.labelId}
          aria-describedby={ids.describedById}
          value={setting.value}
          disabled={setting.pending}
          onChange={(event) => setting.apply(event.target.value)}
          data-testid="select-view"
        >
          <option value="list">List</option>
          <option value="board">Board</option>
          <option value="grid">Grid</option>
        </select>
      )}
    />
  );
}

function DisabledControlsRow() {
  return (
    <SettingsRow
      label="Two-factor authentication"
      description="Managed by your organisation. This control is unavailable here."
      status="Disabled by policy"
      control={(ids) => (
        <input
          id={ids.controlId}
          type="checkbox"
          role="switch"
          className="dh-settings-switch"
          aria-labelledby={ids.labelId}
          aria-describedby={ids.describedById}
          checked
          disabled
          readOnly
        />
      )}
    />
  );
}

// ---------------------------------------------------------------- explicit-save

type DisplayNameDraft = { readonly displayName: string };

function DisplayNameForm({
  simulateFailure,
  onSaved,
}: {
  readonly simulateFailure: boolean;
  readonly onSaved: (value: string) => void;
}) {
  const feedback = useFeedback();
  // Keep the latest flag readable inside the async submit without re-creating it.
  const failRef = useRef(simulateFailure);
  failRef.current = simulateFailure;

  const form = useForm<DisplayNameDraft>({
    initialValues: { displayName: "Ada Lovelace" },
    fieldOrder: ["displayName"],
    fields: {
      displayName: {
        validate: composeValidators(
          required("Enter a display name."),
          maxLength(40, "Keep it under 40 characters."),
        ),
      },
    },
    onSubmit: async (values) => {
      await delay(450);
      if (failRef.current) {
        return {
          status: "error",
          formError: "The server rejected the change. Please try again.",
        };
      }
      onSaved(values.displayName);
      feedback.notifySuccess("Display name saved");
      return { status: "success" };
    },
  });

  return (
    <Form onSubmit={form.handleSubmit} busy={form.isSubmitting}>
      <FormErrorSummary
        formError={form.formError}
        fieldErrors={form.fieldErrors}
        order={form.fieldOrder as string[]}
        onFocusField={form.focusField}
      />
      <SettingsRow
        control={
          <TextField
            label="Display name"
            help="How you appear across the workspace."
            {...form.field("displayName")}
            required
            maxLength={40}
          />
        }
      />
      <FormActions>
        <FormButton type="submit" variant="primary" pending={form.isSubmitting}>
          Save
        </FormButton>
        <FormButton
          type="button"
          onClick={form.reset}
          disabled={!form.isDirty || form.isSubmitting}
        >
          Cancel
        </FormButton>
      </FormActions>
    </Form>
  );
}

// ---------------------------------------------------------------- page

function DesignSettingsPage() {
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [savedName, setSavedName] = useState("Ada Lovelace");
  // A hydration marker so Playwright waits for handlers to attach before acting
  // (the same pattern as the other design fixtures).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // A dangerous action that fails on its first attempt, then succeeds — to
  // demonstrate the in-dialog error + retry path.
  const deleteAttempts = useRef(0);
  const deleteWorkspace = useCallback(async () => {
    await delay(450);
    deleteAttempts.current += 1;
    if (deleteAttempts.current < 2) {
      throw new Error("Couldn’t reach the server. Please try again.");
    }
  }, []);

  const resetSettings = useCallback(async () => {
    await delay(350);
  }, []);

  return (
    <div className="settings-demo" data-hydrated={hydrated ? "true" : "false"}>
      <header className="settings-demo__header">
        <h1>Settings layout</h1>
        <p>
          DS-10b — the one reusable Settings surface every module composes for
          app, workspace, module and record settings. Immediate and
          explicit-save changes, dangerous actions, one accessible layout at
          every scope.
        </p>
      </header>

      <SettingsLayout
        title="Workspace settings"
        description="Demonstration settings backed by in-memory fixture data only."
      >
        <SettingsGroup
          title="General"
          description="Ordinary settings — an immediate toggle and select, plus a disabled control."
        >
          <ImmediateToggleRow />
          <ImmediateSelectRow />
          <DisabledControlsRow />
        </SettingsGroup>

        <SettingsGroup
          title="Profile"
          description="An explicit-save setting: edit, then Save or Cancel. Validation runs on blur and submit."
        >
          <DisplayNameForm
            simulateFailure={simulateFailure}
            onSaved={setSavedName}
          />
          <SettingsRow
            label="Current display name"
            description="The last saved value."
            status={savedName}
            control={<span aria-hidden="true" />}
          />
          <SettingsRow
            label="Simulate a save failure"
            description="When on, the next Save is rejected by the (fake) server so you can retry."
            control={(ids) => (
              <input
                id={ids.controlId}
                type="checkbox"
                role="switch"
                className="dh-settings-switch"
                aria-labelledby={ids.labelId}
                aria-describedby={ids.describedById}
                checked={simulateFailure}
                onChange={(event) => setSimulateFailure(event.target.checked)}
                data-testid="toggle-simulate-failure"
              />
            )}
          />
        </SettingsGroup>

        <SettingsGroup
          title="Long content"
          description="Long labels and descriptions wrap cleanly and never clip or overflow."
        >
          <SettingsRow
            label="Automatically archive completed projects after a long period of inactivity across every area of the workspace"
            description="When a project has had no activity for the configured retention window, it is moved out of the active list into the archive so the workspace stays focused on current work — this description is deliberately long to prove wrapping at every width."
            control={(ids) => (
              <input
                id={ids.controlId}
                type="checkbox"
                role="switch"
                className="dh-settings-switch"
                aria-labelledby={ids.labelId}
                aria-describedby={ids.describedById}
                defaultChecked={false}
              />
            )}
          />
        </SettingsGroup>

        <SettingsGroup
          title="Danger zone"
          description="Destructive actions are visually separated and require a deliberate confirmation."
          tone="danger"
        >
          <DangerousAction
            label="Reset all settings"
            description="Restore every setting on this surface to its default."
            actionLabel="Reset settings"
            confirmTitle="Reset all settings?"
            confirmBody="This restores the defaults for this demonstration surface. It cannot be undone."
            confirmLabel="Reset settings"
            busyLabel="Resetting…"
            successMessage="Settings reset to defaults"
            onConfirm={resetSettings}
          />
          <DangerousAction
            label="Delete this workspace"
            description="Permanently delete the workspace and everything in it."
            actionLabel="Delete workspace…"
            confirmTitle="Delete workspace?"
            confirmBody={
              <>
                This permanently deletes <strong>Demo workspace</strong> and all
                of its data. This cannot be undone.
              </>
            }
            confirmLabel="Delete workspace"
            busyLabel="Deleting…"
            typedConfirmation={{ phrase: "DELETE" }}
            successMessage="Workspace deleted"
            onConfirm={deleteWorkspace}
          />
        </SettingsGroup>
      </SettingsLayout>

      <section
        className="settings-demo__narrow-wrap"
        aria-label="Constrained container"
      >
        <h2 className="settings-demo__narrow-title">
          Embedded in a narrow container
        </h2>
        <p className="settings-demo__narrow-note">
          The same layout inside a ~20rem container (as in a Drawer or
          Inspector) — rows stack via a container query, not the viewport width.
        </p>
        <div className="settings-demo__narrow" data-testid="narrow-container">
          <SettingsLayout aria-label="Embedded settings">
            <SettingsGroup title="Notifications">
              <SettingsRow
                label="Email digests"
                description="A weekly summary of activity."
                control={(ids) => (
                  <input
                    id={ids.controlId}
                    type="checkbox"
                    role="switch"
                    className="dh-settings-switch"
                    aria-labelledby={ids.labelId}
                    aria-describedby={ids.describedById}
                    defaultChecked
                  />
                )}
              />
            </SettingsGroup>
          </SettingsLayout>
        </div>
      </section>
    </div>
  );
}

export default function DesignSettingsRoute() {
  return <DesignSettingsPage />;
}
