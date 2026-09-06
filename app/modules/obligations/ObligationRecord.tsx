/**
 * V2.10 LIFE-02 — the canonical Obligation record, composed through the shared
 * DS-02 Record Layout.
 *
 * It answers the four questions the record exists to answer, in this order:
 *
 *   What is due, and when?   the title, the state in words, the date
 *   What is it about?        the subject, or the honest absence of one
 *   What does it cost?       the expected amount, where there is one
 *   What happened?           the completion, the series, the timeline
 *
 * ── The fold ────────────────────────────────────────────────────────────────
 * The one thing an owner came here to do — record that it is done — is the
 * first thing on the page, above the summary and above the tabs, in the
 * layout's `feature` slot. Everything else is reference.
 *
 * ── One completion sheet, not a second modal ────────────────────────────────
 * Completing opens the shared form INLINE in that same feature region rather
 * than in a dialog over the record. A modal over a record the owner is already
 * looking at is a second layer for no reason, and on a phone it is a sheet over
 * a sheet.
 *
 * Presentation and client-side mutation plumbing only: data loading lives in the
 * route, and every write posts to `/obligations/:id/mutate`.
 */

import { useCallback, useState } from "react";
import { useNavigate } from "react-router";

import { ASSET_METER_UNIT_OPTIONS, DEFAULT_CURRENCY } from "~/kernel/assets";
import { EntityIcon } from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";
import { LinkedItemsTab } from "~/shared/linked-items";
import {
  CompleteObligationForm,
  ObligationForm,
  obligationStateTone,
  type SerializedObligation,
  useObligationActions,
} from "~/shared/obligations";
import { RecordLayout, type RecordMetaItem } from "~/shared/record-layout";
import { useRecordLifecycle } from "~/shared/record-lifecycle";

import { ObligationActivityTab } from "./ObligationActivityTab";

export interface ObligationRecordProps {
  readonly obligation: SerializedObligation;
  readonly todayIso: string;
  readonly activeTabId: string;
  /** Open with the completion form already showing (the collection's route in). */
  readonly startCompleting?: boolean;
  readonly onTabChange: (tabId: string) => void;
  readonly onSaved: () => void;
}

/** What the record is currently doing in its feature region. */
type Mode = "idle" | "completing" | "editing";

export function ObligationRecord({
  obligation,
  todayIso,
  activeTabId,
  startCompleting = false,
  onTabChange,
  onSaved,
}: ObligationRecordProps) {
  const feedback = useFeedback();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(
    startCompleting && obligation.status === "open" ? "completing" : "idle",
  );
  const [pending, setPending] = useState(false);

  const actions = useObligationActions({ onChanged: onSaved, feedback });

  /*
   * Every action here posts and then revalidates, so the button that started it
   * stays on screen, enabled, for as long as the round trip takes. The shared
   * row has passed `busy` to its controls since LIFE-02 (`ObligationsCollection`
   * and `AssetObligationsTab` both do); the record was the one surface that read
   * `actions.pendingId` and never used it.
   *
   * "Create task" is the one where that costs something real rather than a
   * duplicate no-op: two clicks send two requests that both read an obligation
   * with no `task_id`, both create a Task, and then race to claim the pointer —
   * leaving the loser's Task alive in the task list, linked to nothing, which no
   * later action here can reach. The rest are guarded with it because a pending
   * mutation is a pending mutation, not because each has its own story.
   */
  const busy = actions.pendingId === obligation.id;

  const post = useCallback(
    async (intent: string): Promise<boolean> => {
      const body = new FormData();
      body.set("intent", intent);
      const response = await fetch(
        `/obligations/${encodeURIComponent(obligation.id)}/mutate`,
        { method: "POST", body },
      );
      const result = (await response.json()) as { readonly ok?: boolean };
      return result.ok === true;
    },
    [obligation.id],
  );

  const onDelete = useCallback(async () => {
    setPending(true);
    try {
      if (await post("delete")) {
        navigate("/obligations");
        return;
      }
      throw new Error("Couldn’t delete this obligation.");
    } finally {
      setPending(false);
    }
  }, [navigate, post]);

  const lifecycle = useRecordLifecycle({
    entityType: "obligation",
    title: obligation.title,
    /*
     * An obligation has no archived state. It is open, held, dismissed or done,
     * and "dismissed" is what an owner reaches for when a commitment stops
     * applying — so there is no Archive action to offer, and offering one would
     * add a fifth state that means the same as the fourth.
     */
    onDelete,
    deleteMode: "reversible",
    pending,
    notifyOnSuccess: false,
  });

  const open = obligation.status === "open";

  const metadata: RecordMetaItem[] = [
    { id: "category", label: "Category", value: obligation.categoryLabel },
    { id: "state", label: "State", value: obligation.stateText },
  ];
  if (obligation.dueDateLabel) {
    metadata.push({
      id: "due",
      label: "Due",
      value: obligation.dueDateLabel,
    });
  }
  metadata.push({
    id: "subject",
    label: "About",
    value: obligation.subject ? (
      obligation.subject.href ? (
        <a href={obligation.subject.href}>{obligation.subject.title}</a>
      ) : (
        obligation.subject.title
      )
    ) : (
      // Stated, not blank. "About nothing in particular" is an answer.
      "Nothing in particular"
    ),
  });
  if (obligation.recurrenceKind !== "none") {
    metadata.push({
      id: "repeat",
      label: "Repeats",
      value: obligation.recurrenceLabel,
    });
  }

  /*
   * Meter editing is offered on the SUBJECT'S capability, not on whether a
   * meter target happens to be set already.
   *
   * Gating it on `obligation.meterUnit` made this record disagree with the
   * Asset tab, which passes the vocabulary unconditionally because everything
   * it draws is about an Asset: a date-only rego could be given a kilometre
   * threshold from the ute's page and not from its own. "One record with one
   * page" has to mean the same edits either way.
   *
   * A meter belongs to the domain that owns its units (ADR-049's rule, applied
   * to meters), so the capability is the Assets one and nothing else claims it.
   * An existing target is honoured whatever the subject is, so data written
   * before this rule — or by a client that ignored it — stays editable rather
   * than becoming a value the owner can see and not clear.
   */
  const subjectKeepsMeter = obligation.subject?.type === "asset";
  const meterUnits =
    subjectKeepsMeter || obligation.meterUnit
      ? ASSET_METER_UNIT_OPTIONS.map((unit) => ({
          value: unit.value,
          label: unit.label,
        }))
      : undefined;

  const feature =
    mode === "completing" ? (
      <CompleteObligationForm
        obligation={obligation}
        today={todayIso}
        defaultCurrency={obligation.currencyCode ?? DEFAULT_CURRENCY}
        subjectKeepsHistory={obligation.subject?.type === "asset"}
        onSaved={() => {
          setMode("idle");
          feedback.notifySuccess("Recorded.");
          onSaved();
        }}
        onCancel={() => setMode("idle")}
      />
    ) : mode === "editing" ? (
      <ObligationForm
        obligation={obligation}
        action={`/obligations/${encodeURIComponent(obligation.id)}/mutate`}
        defaultCurrency={obligation.currencyCode ?? DEFAULT_CURRENCY}
        meterUnits={meterUnits}
        onSaved={() => {
          setMode("idle");
          feedback.notifySuccess("Saved.");
          onSaved();
        }}
        onCancel={() => setMode("idle")}
      />
    ) : (
      <div className="dh-obligation-feature">
        <p
          className={`dh-obligation-badge dh-obligation-badge--${obligationStateTone(obligation.state)}`}
        >
          {obligation.stateLabel}
        </p>
        <p className="dh-obligation-feature__state">{obligation.stateText}</p>
        {obligation.expectedAmountDisplay ? (
          <p className="dh-obligation-feature__amount">
            Expected {obligation.expectedAmountDisplay}
            {obligation.completedAmountDisplay
              ? ` · paid ${obligation.completedAmountDisplay}`
              : ""}
          </p>
        ) : null}
        <div className="dh-obligation-feature__actions">
          {open ? (
            <>
              <button
                type="button"
                className="dh-btn dh-btn--primary"
                onClick={() => setMode("completing")}
              >
                Record it as done
              </button>
              <button
                type="button"
                className="dh-btn dh-btn--secondary"
                onClick={() => setMode("editing")}
              >
                Edit
              </button>
              {obligation.taskId === null ? (
                <button
                  type="button"
                  className="dh-btn dh-btn--ghost"
                  disabled={busy}
                  onClick={() => actions.createTask(obligation)}
                >
                  Create task
                </button>
              ) : null}
              <button
                type="button"
                className="dh-btn dh-btn--ghost"
                disabled={busy}
                onClick={() => actions.hold(obligation)}
              >
                Hold
              </button>
              <button
                type="button"
                className="dh-btn dh-btn--ghost"
                disabled={busy}
                onClick={() => actions.dismiss(obligation)}
              >
                Dismiss
              </button>
            </>
          ) : obligation.status === "completed" ? (
            <p className="dh-obligation-feature__done">
              Recorded as done
              {obligation.completedDateLabel
                ? ` on ${obligation.completedDateLabel}`
                : ""}
              .
            </p>
          ) : (
            <button
              type="button"
              className="dh-btn dh-btn--primary"
              disabled={busy}
              onClick={() => actions.reopen(obligation)}
            >
              Make it live again
            </button>
          )}
        </div>
      </div>
    );

  return (
    <>
      <RecordLayout
        title={obligation.title}
        typeLabel={obligation.categoryLabel}
        icon={<EntityIcon type="obligation" />}
        breadcrumb={[
          { id: "obligations", label: "Life Admin", href: "/obligations" },
        ]}
        status={
          open
            ? undefined
            : {
                label: obligation.stateLabel,
                tone:
                  obligation.status === "completed" ? "completed" : "warning",
              }
        }
        metadata={metadata}
        overflowActions={lifecycle.overflowActions}
        feature={feature}
        featureLabel="What is due"
        activeTabId={activeTabId}
        onTabChange={onTabChange}
        tabs={[
          {
            id: "summary",
            label: "Overview",
            content: (
              <div className="dh-obligation-summary">
                {obligation.description ? (
                  <section>
                    <h2 className="dh-obligation-summary__heading">Notes</h2>
                    <p>{obligation.description}</p>
                  </section>
                ) : null}
                <section>
                  <h2 className="dh-obligation-summary__heading">Series</h2>
                  <p className="dh-obligation-summary__quiet">
                    {obligation.recurrenceKind === "none"
                      ? "This one does not repeat."
                      : `${obligation.recurrenceLabel}. Occurrence ${obligation.sequence + 1} of this series.`}
                  </p>
                </section>
                {obligation.taskId ? (
                  <section>
                    <h2 className="dh-obligation-summary__heading">Task</h2>
                    <p className="dh-obligation-summary__quiet">
                      {obligation.taskOpen ? (
                        <>
                          Tracked as a task.{" "}
                          <a
                            href={`/tasks?drawer=task%3A${encodeURIComponent(obligation.taskId)}`}
                          >
                            Open task
                          </a>
                        </>
                      ) : (
                        "Its task is done. Recording what happened here is what completes the obligation."
                      )}
                    </p>
                  </section>
                ) : null}
              </div>
            ),
          },
          {
            id: "linked",
            label: "Linked",
            content: (
              <LinkedItemsTab
                anchorId={obligation.id}
                anchorType="obligation"
                readOnly={obligation.status === "completed"}
                linkCommandTarget={{
                  kind: "route",
                  to: `/obligations/${encodeURIComponent(obligation.id)}?tab=linked`,
                }}
              />
            ),
          },
          {
            id: "activity",
            label: "Activity",
            content: <ObligationActivityTab obligationId={obligation.id} />,
          },
        ]}
      />
      {lifecycle.dialogs}
    </>
  );
}
