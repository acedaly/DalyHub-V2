/**
 * V2.13 RPT-04 — one report: its question, its controls, its answer.
 *
 * ── The controls are LINKS ─────────────────────────────────────────────────
 * Every control is a list of ordinary links that change the address bar. So the
 * URL is always exactly what is on screen, a reload is a no-op, back works, the
 * page is bookmarkable and shareable, and there is no client state to keep in
 * step with it. It also means there is no "query storm": a change is one
 * intentional navigation, never a request per keystroke — there are no
 * keystrokes.
 *
 * ── Save is explicit, and never touches a built-in ─────────────────────────
 * Changing a built-in and saving writes a NEW report; the built-in is
 * untouched. Changing a saved report offers "Update" beside "Save as new",
 * because those are different intentions and guessing between them is how an
 * owner loses a definition they meant to keep.
 *
 * Presentation only — every figure, label and sentence is computed server-side.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";

import { CollectionLayout } from "~/shared/collection-layout";
import { EmptyState } from "~/shared/empty-state";
import { Button, ButtonLink, Input } from "~/shared/ui";

import { ReportResultView } from "./ReportResultView";
import type { ReportControl, ReportPageData } from "./reports-view";
import type { ReportsSavedResult } from "./routes/saved";

export function ReportScreen(data: ReportPageData) {
  return (
    <CollectionLayout
      className="dh-report"
      title={data.title}
      headingLevel={1}
      subtitle={data.question || undefined}
      primaryAction={
        <ButtonLink href="/reports" variant="subtle">
          All reports
        </ButtonLink>
      }
    >
      <div className="dh-report__body">
        {data.incompatible ? (
          <EmptyState
            title="This report can’t be opened"
            description={`${data.incompatible} Nothing has been lost: a stored definition is left exactly as it is, byte for byte.`}
            primaryAction={
              <Link className="dh-btn dh-btn--primary" to="/reports/new">
                New report
              </Link>
            }
          />
        ) : data.needs ? (
          <EmptyState
            title={`Choose a ${data.needs.toLocaleLowerCase("en-AU")}`}
            description="This example is about one record at a time, so DalyHub cannot pick for you. Choose one below and the figures appear."
          />
        ) : null}

        {data.controls.length > 0 ? (
          <ReportControls controls={data.controls} />
        ) : null}

        {data.refusal ? (
          <p className="dh-report__refusal" role="status">
            {data.refusal}
          </p>
        ) : null}

        {data.result ? <ReportResultView result={data.result} /> : null}

        {data.result ? <SaveBar data={data} /> : null}
      </div>
    </CollectionLayout>
  );
}

/**
 * The progressive builder: source, then measure, then period, then the
 * breakdown, then filters, then the visual.
 *
 * Rendered as a fieldset of link groups. A `<ul>` of links inside a labelled
 * group is what this genuinely is — a set of alternative destinations — and it
 * is keyboard-complete for free, which a custom listbox would not be.
 */
function ReportControls({
  controls,
}: {
  readonly controls: readonly ReportControl[];
}) {
  return (
    <div className="dh-report__controls">
      {controls.map((control) => (
        <div key={control.id} className="dh-report__control">
          <p className="dh-report__control-label" id={`ctl-${control.id}`}>
            {control.label}
          </p>
          <ul
            className="dh-report__options"
            aria-labelledby={`ctl-${control.id}`}
          >
            {control.options.map((option) => (
              <li key={`${control.id}-${option.value}`}>
                <Link
                  className="dh-report__option"
                  to={option.href}
                  /* The current choice is stated for assistive technology, not
                   * left to the tint that marks it visually. */
                  aria-current={
                    option.value === control.value ? "true" : undefined
                  }
                  data-selected={
                    option.value === control.value ? "true" : undefined
                  }
                  replace
                >
                  {option.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Save, update, rename and delete. Every one of them an explicit submit. */
function SaveBar({ data }: { readonly data: ReportPageData }) {
  const fetcher = useFetcher<ReportsSavedResult>();
  const [naming, setNaming] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const busy = fetcher.state !== "idle";
  const result = fetcher.data;

  useEffect(() => {
    if (naming) nameRef.current?.focus();
  }, [naming]);

  useEffect(() => {
    if (result?.ok) setNaming(false);
  }, [result]);

  const saveable = !data.builtIn && data.reportId !== null;

  return (
    <div className="dh-report__save">
      {/*
       * Feedback is announced, not merely printed: a save that succeeds while
       * the owner is reading the figures below must reach a screen reader.
       */}
      <p className="dh-report__save-status" role="status">
        {result?.message ?? result?.formError ?? ""}
      </p>

      {naming ? (
        <fetcher.Form
          className="dh-report__save-form"
          method="post"
          action="/reports/saved"
        >
          <input type="hidden" name="intent" value="create" />
          <input type="hidden" name="query" value={data.query} />
          <div className="dh-report__save-field">
            <label className="dh-report__control-label" htmlFor="report-name">
              Report name
            </label>
            <Input
              id="report-name"
              ref={nameRef}
              name="name"
              defaultValue={data.title === "New report" ? "" : data.title}
              maxLength={80}
              required
            />
          </div>
          <div className="dh-report__save-actions">
            <Button type="submit" variant="primary" loading={busy}>
              Save report
            </Button>
            <Button type="button" onClick={() => setNaming(false)}>
              Cancel
            </Button>
          </div>
        </fetcher.Form>
      ) : (
        <div className="dh-report__save-actions">
          <Button
            type="button"
            variant="primary"
            onClick={() => setNaming(true)}
          >
            {data.builtIn || data.reportId === null
              ? "Save as a new report"
              : "Save a copy"}
          </Button>
          {saveable ? (
            <fetcher.Form method="post" action="/reports/saved">
              <input type="hidden" name="intent" value="update" />
              <input
                type="hidden"
                name="reportId"
                value={data.reportId ?? ""}
              />
              <input type="hidden" name="query" value={data.query} />
              <Button type="submit" loading={busy}>
                Update this report
              </Button>
            </fetcher.Form>
          ) : null}
          {saveable ? (
            <fetcher.Form method="post" action="/reports/saved">
              <input type="hidden" name="intent" value="delete" />
              <input
                type="hidden"
                name="reportId"
                value={data.reportId ?? ""}
              />
              <Button type="submit" variant="danger" loading={busy}>
                Delete
              </Button>
            </fetcher.Form>
          ) : null}
        </div>
      )}

      {/*
       * The one output format. A real `<a href download>`, so middle-click and
       * "save as" behave, and so the download is an ordinary authenticated GET
       * of the SAME definition through the SAME executor — a downloaded figure
       * and the figure above it cannot differ.
       */}
      <p className="dh-report__save-hint">
        <a
          className="dh-report__download"
          href={`/reports/export?${data.query}`}
          download
        >
          Download these rows as CSV
        </a>
      </p>

      {data.builtIn ? (
        <p className="dh-report__save-hint">
          This is one of DalyHub’s examples. Changing it here never changes the
          example — save it as your own report to keep this question.
        </p>
      ) : null}
    </div>
  );
}
