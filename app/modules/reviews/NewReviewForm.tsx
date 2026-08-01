import { useMemo, useState } from "react";
import { Form, Link, useActionData, useNavigation } from "react-router";

import {
  REVIEW_TYPES,
  addCalendarDays,
  addCalendarMonths,
  currentReviewPeriod,
  monthlyPeriod,
  quarterlyPeriod,
  annualPeriod,
  weeklyPeriod,
  type ReviewType,
} from "~/kernel/reviews";

import {
  defaultReviewDraftTitle,
  reviewPeriodLabel,
  REVIEW_TYPE_LABELS,
  type ReviewCreationDefaults,
} from "./review-view";
import { useSetMobileTopBar } from "~/shared/shell";

import type { NewReviewActionData } from "./routes/new";

function nextPeriod(
  type: ReviewType,
  start: string,
  direction: -1 | 1,
  firstDayOfWeek: ReviewCreationDefaults["firstDayOfWeek"],
) {
  if (type === "weekly") {
    return weeklyPeriod(addCalendarDays(start, direction * 7), firstDayOfWeek);
  }
  if (type === "monthly")
    return monthlyPeriod(addCalendarMonths(start, direction));
  if (type === "quarterly")
    return quarterlyPeriod(addCalendarMonths(start, direction * 3));
  if (type === "annual")
    return annualPeriod(addCalendarMonths(start, direction * 12));
  return { start, end: start };
}

export function NewReviewForm({
  defaults,
}: {
  readonly defaults: ReviewCreationDefaults;
}) {
  const actionData = useActionData<NewReviewActionData>();
  const navigation = useNavigation();
  const [type, setType] = useState<ReviewType>("weekly");
  const initial = currentReviewPeriod(
    "weekly",
    defaults.today,
    defaults.firstDayOfWeek,
  );
  const [periodStart, setPeriodStart] = useState(initial.start);
  const [periodEnd, setPeriodEnd] = useState(initial.end);
  const [titleTouched, setTitleTouched] = useState(false);
  const generatedTitle = useMemo(
    () =>
      defaultReviewDraftTitle({
        type,
        periodStart,
        periodEnd,
        dateFormat: defaults.dateFormat,
      }),
    [type, periodStart, periodEnd, defaults.dateFormat],
  );
  const [title, setTitle] = useState(generatedTitle);
  const displayedTitle = titleTouched ? title : generatedTitle;
  const submitting = navigation.state !== "idle";

  // UX-01 — this page composes no `PaneHeader`, so it must publish its own phone
  // top-bar identity; without it the bar showed the workspace name and offered no
  // way back to the collection.
  useSetMobileTopBar({ title: "New Review", backTo: "/reviews" });

  const selectType = (nextType: ReviewType) => {
    setType(nextType);
    const next = currentReviewPeriod(
      nextType,
      defaults.today,
      defaults.firstDayOfWeek,
    );
    setPeriodStart(next.start);
    setPeriodEnd(next.end);
    setTitleTouched(false);
  };

  const move = (direction: -1 | 1) => {
    const next = nextPeriod(
      type,
      periodStart,
      direction,
      defaults.firstDayOfWeek,
    );
    setPeriodStart(next.start);
    setPeriodEnd(next.end);
    setTitleTouched(false);
  };

  return (
    // UX-01 — a `section`, not a `main`. The app shell already renders the one
    // `main` landmark (`#main-content`) that this route is rendered INSIDE, so a
    // second `main` here gave the page two main landmarks — a WCAG 2.2 landmark
    // defect that a screen-reader user meets as an ambiguous "main region" choice.
    <section className="dh-review-new" aria-labelledby="new-review-title">
      <div className="dh-review-new__header">
        <div>
          <p className="dh-review-new__eyebrow">Reviews</p>
          <h1 id="new-review-title">New Review</h1>
          <p>
            Create a durable reflection record for a weekly, monthly, quarterly,
            annual or custom period.
          </p>
        </div>
        <Link className="dh-btn dh-btn--secondary" to="/reviews">
          Back to Reviews
        </Link>
      </div>

      <Form method="post" className="dh-review-new__form">
        <input type="hidden" name="reviewType" value={type} />
        <input type="hidden" name="periodStart" value={periodStart} />
        <input type="hidden" name="periodEnd" value={periodEnd} />

        <section
          className="dh-review-new__section"
          aria-labelledby="review-type-heading"
        >
          <h2 id="review-type-heading">Review type</h2>
          <div
            className="dh-review-type-grid"
            role="radiogroup"
            aria-label="Review type"
          >
            {REVIEW_TYPES.map((reviewType) => (
              <button
                key={reviewType}
                type="button"
                className="dh-review-type-option"
                data-selected={reviewType === type ? "true" : "false"}
                role="radio"
                aria-checked={reviewType === type}
                onClick={() => selectType(reviewType)}
              >
                <span>{REVIEW_TYPE_LABELS[reviewType]}</span>
              </button>
            ))}
          </div>
        </section>

        <section
          className="dh-review-new__section"
          aria-labelledby="period-heading"
        >
          <div className="dh-review-new__section-header">
            <h2 id="period-heading">Period</h2>
            {type !== "custom" ? (
              <div className="dh-review-new__period-controls">
                <button
                  type="button"
                  className="dh-btn dh-btn--secondary"
                  onClick={() => move(-1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="dh-btn dh-btn--secondary"
                  onClick={() => move(1)}
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>

          {type === "custom" ? (
            <div className="dh-review-date-grid">
              <label>
                <span>Start date</span>
                <input
                  className="dh-input"
                  type="date"
                  value={periodStart}
                  onChange={(event) => {
                    setPeriodStart(event.currentTarget.value);
                    setTitleTouched(false);
                  }}
                  required
                />
              </label>
              <label>
                <span>End date</span>
                <input
                  className="dh-input"
                  type="date"
                  value={periodEnd}
                  onChange={(event) => {
                    setPeriodEnd(event.currentTarget.value);
                    setTitleTouched(false);
                  }}
                  required
                />
              </label>
            </div>
          ) : null}

          <p className="dh-review-period-preview" aria-live="polite">
            {reviewPeriodLabel(
              type,
              periodStart,
              periodEnd,
              defaults.dateFormat,
            )}
          </p>
          <p className="dh-review-new__help">
            Dates are stored as wall-calendar YYYY-MM-DD values. They are not
            converted into UTC instants.
          </p>
        </section>

        <section
          className="dh-review-new__section"
          aria-labelledby="title-heading"
        >
          <h2 id="title-heading">Title</h2>
          <label className="dh-review-title-field">
            <span className="dh-visually-hidden">Review title</span>
            <input
              className="dh-input"
              name="title"
              value={displayedTitle}
              onChange={(event) => {
                setTitleTouched(true);
                setTitle(event.currentTarget.value);
              }}
              required
            />
          </label>
        </section>

        {actionData?.ok === false ? (
          <p className="dh-review-form-error" role="alert">
            {actionData.message}
          </p>
        ) : null}

        <div className="dh-review-new__actions">
          <Link className="dh-btn dh-btn--secondary" to="/reviews">
            Cancel
          </Link>
          <button
            className="dh-btn dh-btn--primary"
            type="submit"
            disabled={submitting}
          >
            Start Review
          </button>
        </div>
      </Form>
    </section>
  );
}
