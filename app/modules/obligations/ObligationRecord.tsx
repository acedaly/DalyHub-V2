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

import type { SerializedAttachment } from "~/kernel/attachments";
import { ASSET_METER_UNIT_OPTIONS, DEFAULT_CURRENCY } from "~/kernel/assets";
import type { AiSurfaceAvailabilityGate } from "~/shared/ai";
import { attachmentsTab } from "~/shared/attachments";
import { EntityIcon } from "~/shared/entity";
import { OverflowMenu, type OverflowMenuItem } from "~/shared/overflow-menu";
import { UntitledStatusBadge } from "~/shared/pill";
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
import { ObligationFollowUp } from "./ObligationFollowUp";
import { Button } from "~/shared/ui";
import { SectionHeading } from "~/shared/ui/untitled/overrides/section-heading";

export interface ObligationRecordProps {
  readonly obligation: SerializedObligation;
  readonly todayIso: string;
  /**
   * V2.11 FILE-01 — the policy, the invoice, the notice, the receipt.
   *
   * This is the V2.10 → V2.11 bridge: the record that most wants a file is the
   * one that says a renewal is due. It is on the record, in the shared Evidence
   * tab — never on the Life Admin collection row and never on Today, because a
   * list of what is due is not the place to carry a document.
   */
  readonly attachments: readonly SerializedAttachment[];
  readonly activeTabId: string;
  /** Open with the completion form already showing (the collection's route in). */
  readonly startCompleting?: boolean;
  readonly onTabChange: (tabId: string) => void;
  readonly onSaved: () => void;
  /**
   * V2.15 — whether the follow-up draft control can run, resolved server-side.
   *
   * Optional so every other caller of this component (and every test that
   * renders it) is unchanged: absent means the control is simply not offered,
   * which is the correct behaviour for a surface that has not resolved it.
   */
  readonly aiFollowUp?: AiSurfaceAvailabilityGate;
}

/** What the record is currently doing in its feature region. */
type Mode = "idle" | "completing" | "editing";

export function ObligationRecord({
  obligation,
  todayIso,
  attachments,
  activeTabId,
  startCompleting = false,
  onTabChange,
  onSaved,
  aiFollowUp,
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

  /*
   * The obligation's own secondary actions, for the fold's menu. They are NOT
   * merged into the record header's overflow: that menu is the record's
   * LIFECYCLE (delete), and the three below act on the current occurrence's
   * state. Keeping them apart is what stops "Dismiss this occurrence" and
   * "Delete this obligation" sitting one line from each other.
   */
  const featureActions: readonly OverflowMenuItem[] = [
    ...(obligation.taskId === null
      ? [
          {
            id: "create-task",
            label: "Create task",
            ariaLabel: `Create task for ${obligation.title}`,
            onSelect: () => void actions.createTask(obligation),
            ...(busy ? { pending: true } : {}),
          } satisfies OverflowMenuItem,
        ]
      : []),
    {
      id: "hold",
      label: "Hold",
      ariaLabel: `Hold ${obligation.title}`,
      onSelect: () => void actions.hold(obligation),
      ...(busy ? { pending: true } : {}),
    },
    {
      id: "dismiss",
      label: "Dismiss",
      ariaLabel: `Dismiss ${obligation.title}`,
      tone: "danger",
      separatorBefore: true,
      onSelect: () => void actions.dismiss(obligation),
      ...(busy ? { pending: true } : {}),
    },
  ];

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
      <div className="flex flex-col items-start gap-2">
        {/*
         * The state's WORD, in the genuine Untitled badge rather than the
         * hand-drawn stadium `obligations.css` carried with its own five-tone
         * container map. Same tone vocabulary, one drawing, shared with the row.
         */}
        <UntitledStatusBadge tone={obligationStateTone(obligation.state)}>
          {obligation.stateLabel}
        </UntitledStatusBadge>
        <p className="m-0 text-lg text-primary">{obligation.stateText}</p>
        {obligation.expectedAmountDisplay ? (
          <p className="m-0 text-sm text-tertiary tabular-nums">
            Expected {obligation.expectedAmountDisplay}
            {obligation.completedAmountDisplay
              ? ` · paid ${obligation.completedAmountDisplay}`
              : ""}
          </p>
        ) : null}
        {/*
         * UNTITLED-16 — ONE thing to do, plus Edit, plus a menu.
         *
         * The fold used to hold five equal-weight controls, so "Record it as
         * done" — the single reason an owner opens this page — sat in a row
         * beside "Dismiss", which makes the commitment stop asking. Completing
         * is the primary; editing is the one other thing a record is for; Create
         * task, Hold and Dismiss are the shared menu, with Dismiss behind a
         * separator in the destructive tone.
         */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {open ? (
            <>
              <Button variant="primary" onClick={() => setMode("completing")}>
                Record it as done
              </Button>
              <Button variant="secondary" onClick={() => setMode("editing")}>
                Edit
              </Button>
              <OverflowMenu
                items={featureActions}
                label={`More actions for ${obligation.title}`}
              />
            </>
          ) : obligation.status === "completed" ? (
            <p className="m-0 text-sm text-tertiary">
              Recorded as done
              {obligation.completedDateLabel
                ? ` on ${obligation.completedDateLabel}`
                : ""}
              .
            </p>
          ) : (
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => actions.reopen(obligation)}
            >
              Make it live again
            </Button>
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
              <div className="flex flex-col gap-6">
                {obligation.description ? (
                  <section className="flex flex-col gap-2">
                    <SectionHeading level={2} title="Notes" />
                    <p className="m-0 text-sm break-words text-secondary">
                      {obligation.description}
                    </p>
                  </section>
                ) : null}
                <section className="flex flex-col gap-2">
                  <SectionHeading level={2} title="Series" />
                  <p className="m-0 text-sm text-tertiary">
                    {obligation.recurrenceKind === "none"
                      ? "This one does not repeat."
                      : `${obligation.recurrenceLabel}. Occurrence ${obligation.sequence + 1} of this series.`}
                  </p>
                </section>
                {aiFollowUp === undefined ? null : (
                  <ObligationFollowUp
                    obligation={obligation}
                    availability={aiFollowUp}
                  />
                )}
                {obligation.taskId ? (
                  <section className="flex flex-col gap-2">
                    <SectionHeading level={2} title="Task" />
                    <p className="m-0 text-sm text-tertiary">
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
          attachmentsTab({
            ownerEntityId: obligation.id,
            attachments,
            /*
             * A completed occurrence is still worth reading — the receipt that
             * proves it is exactly what an owner comes back for — but it is
             * finished, so it does not take new files. Its successor does.
             */
            readOnly: obligation.status === "completed",
            description:
              "The policy, the invoice, the notice or the receipt that proves this one.",
            onChanged: onSaved,
          }),
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
