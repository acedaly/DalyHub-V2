/**
 * MOBILE-01 — the shared Quick Capture sheet.
 *
 * ONE capture surface for Task, Diary entry, Meeting and Note. It opens on the
 * chooser (or straight into the type remembered for this browsing session), and
 * every panel keeps a "Change type" control so no other type is ever more than one
 * tap away.
 *
 * Each panel:
 *   - asks for the LEAST information that can work (a Task is a title), with
 *     optional classification behind progressive disclosure;
 *   - posts to the module's CANONICAL creation route — there is no second create
 *     path, no second validator and no capture-only store;
 *   - keeps the entered text on a recoverable failure (the DS-06 `useForm`
 *     contract) so a network blip never costs the user their words;
 *   - offers the same three next steps on success: Done, Open the record, or Add
 *     another (which clears the form and re-focuses the first field).
 *
 * Layout is the shared {@link Sheet}: DS-03 focus/inert/scroll-lock machinery, a
 * scrolling body and a sticky footer that sits above the phone keyboard via the
 * shared `--app-keyboard-inset` token. The whole module (and each panel beneath it)
 * is lazy-loaded by `CaptureProvider`.
 */

import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";

import { EntityIcon } from "~/shared/entity";
import { Sheet } from "~/shared/sheet";

import {
  CAPTURE_TYPE_DESCRIPTORS,
  captureDescriptor,
  readRememberedCaptureType,
  rememberCaptureType,
  resolveInitialCaptureType,
  type CaptureType,
} from "./capture-model";
import {
  contextForCaptureType,
  fullFormLabel,
  fullFormRoute,
  type CaptureContextContract,
} from "./capture-context";
import { CaptureContextChip } from "./CaptureContextChip";
import { DiaryCapturePanel } from "./DiaryCapturePanel";
import { MeetingCapturePanel } from "./MeetingCapturePanel";
import { NoteCapturePanel } from "./NoteCapturePanel";
import { TaskCapturePanel } from "./TaskCapturePanel";
import type { CapturePanelProps } from "./types";

/**
 * ASSET-03 — Assets' capture panel is the module's OWN canonical New Asset form,
 * not a capture-only copy of it, so it lives with the module. The edge is a lazy
 * import: the shell never statically depends on a module, and the Asset form
 * loads only when someone chooses to capture an Asset.
 */
const AssetCapturePanel = lazy(
  () => import("~/modules/assets/AssetCapturePanel"),
);

/**
 * HABITS-01 — Habits' capture panel is the module's OWN canonical New Habit
 * form, for the same reason Assets' is. Lazy, so the shell never statically
 * depends on the module and no Habit form enters the initial bundle.
 */
const HabitCapturePanel = lazy(
  () => import("~/modules/habits/HabitCapturePanel"),
);

export type CaptureSheetProps = {
  /** Open straight into this type; omitted opens the chooser (or the remembered type). */
  readonly requestedType?: CaptureType;
  /** The control that opened the sheet, for focus restoration. */
  readonly opener: HTMLElement | null;
  readonly captureContext: CaptureContextContract | null;
  readonly onClose: () => void;
};

export default function CaptureSheet({
  requestedType,
  opener,
  captureContext,
  onClose,
}: CaptureSheetProps) {
  const navigate = useNavigate();
  // Resolved once on mount: an explicit request wins, then the session memory.
  const [active, setActive] = useState<CaptureType>(() =>
    resolveInitialCaptureType(requestedType, readRememberedCaptureType()),
  );
  const firstFieldRef = useRef<HTMLElement | null>(null);
  /*
   * UIX-01 — the id that links the header's Save to the active panel's form.
   *
   * Only the Task panel opts in so far, because Task is the capture the
   * redesign reference draws and the one an owner performs many times a day. A
   * panel that does not put this on its form keeps its own in-body submit and
   * this sheet renders no header action for it.
   */
  const formId = useId();
  const [activeContext, setActiveContext] =
    useState<CaptureContextContract | null>(() =>
      contextForCaptureType(active, captureContext),
    );

  useEffect(() => {
    rememberCaptureType(active);

    /*
     * Focus the panel's first field whenever a type becomes active.
     *
     * The Sheet's own initial-focus contract (DS-03 `useDrawerFocus`) runs ONCE
     * on mount. That is correct for a sheet whose content is fixed, but this
     * sheet swaps its content in place: arriving from the chooser, or switching
     * type, leaves the Sheet mounted, so the mount effect never re-runs and
     * focus would sit on the Close button while the user expected to be typing.
     * Re-mounting the Sheet per type would fix the focus but would also fire the
     * unmount focus-restoration (bouncing focus back to the opener) and re-run
     * the scroll lock, so this is an explicit, additive focus move instead.
     *
     * A frame's delay lets the newly-rendered panel attach its control ref (the
     * ref is set by the field's `controlRef` during commit).
     */
    const frame = window.requestAnimationFrame(() =>
      firstFieldRef.current?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [active]);

  const choose = useCallback((type: CaptureType) => {
    setActive(type);
    setActiveContext((current) => contextForCaptureType(type, current));
    /*
     * Land in the field even when the type did not CHANGE.
     *
     * The effect above keys on `active`, so pressing the chip for the type you
     * are already capturing is a no-op to it and focus stays on the chip. That
     * is the wrong end state for a control whose whole point is "capture this,
     * now": a tap on a type means writing, whichever type it was.
     */
    window.requestAnimationFrame(() => firstFieldRef.current?.focus());
  }, []);

  /*
   * MOBILE-02 — the type SELECTOR replaces the chooser screen.
   *
   * The sheet used to open on a list of five options and only then show a
   * field. It now opens on the field, with the five types as a compact chip row
   * above it: the common case costs no decision at all, and an uncommon one
   * costs exactly one tap instead of one tap plus a screen.
   *
   * It is a `dh-scroll-strip`, so five chips on a 320px phone announce that
   * they continue rather than being cut off — the same affordance every other
   * horizontally-constrained strip in the product uses. `aria-pressed` carries
   * which type is active; the chip is never distinguished by fill alone.
   */
  const typeSelector = (
    <div
      className="dh-capture-types dh-scroll-strip"
      role="group"
      aria-label="Capture type"
    >
      {CAPTURE_TYPE_DESCRIPTORS.map((descriptor) => (
        <button
          key={descriptor.type}
          type="button"
          className="dh-capture-type"
          aria-pressed={descriptor.type === active}
          onClick={() => choose(descriptor.type)}
          data-testid={`capture-choose-${descriptor.type}`}
        >
          <span className="dh-capture-type__icon" aria-hidden="true">
            <EntityIcon type={descriptor.entityType} />
          </span>
          {descriptor.label}
        </button>
      ))}
    </div>
  );

  const descriptor = captureDescriptor(active);
  const handoffRoute = fullFormRoute(active, activeContext);
  const handoffLabel = fullFormLabel(active);
  const panelProps: CapturePanelProps = {
    firstFieldRef,
    onClose,
    captureContext: activeContext,
    formId,
  };
  /* The Task panel is the one that hosts its primary action in the header. */
  const headerSubmit = active === "task";

  return (
    <Sheet
      title={`New ${descriptor.label.toLowerCase()}`}
      opener={opener}
      onClose={onClose}
      initialFocusRef={firstFieldRef}
      /*
       * UIX-01 — a Task captures in a SHEET, not a full-screen page.
       *
       * The reference's new-task surface rises from the bottom over the list
       * with the list still visible behind it, which is what says "this is a
       * quick thing and you have not left where you were". `full` was the right
       * variant when every panel was a form with a parent picker and two chip
       * rows; the Task panel is now a title and three rows, and a full-screen
       * takeover for four fields is the composition the redesign is removing.
       * The other capture types keep `full`.
       */
      variant={active === "task" ? "sheet" : "full"}
      data-testid="capture-sheet"
      {...(headerSubmit
        ? {
            /* Cancel · New task · Save — the reference's own header, and the
             * platform convention it comes from. The Cancel IS the sheet's one
             * close control, worded rather than drawn (see `Sheet`). */
            closeLabel: "Cancel",
            closePlacement: "leading" as const,
            trailing: (
              <button
                type="submit"
                form={formId}
                className="dh-sheet__submit md-state-layer"
                data-testid="capture-save"
              >
                Save
              </button>
            ),
          }
        : {})}
    >
      {/* The type selector, above everything: it says what this sheet is about
          to create before the field asks for its title. */}
      {typeSelector}
      {activeContext ? (
        <CaptureContextChip
          captureType={active}
          context={activeContext}
          onRemove={() => setActiveContext(null)}
        />
      ) : null}
      {active === "task" ? (
        <TaskCapturePanel {...panelProps} />
      ) : active === "diary" ? (
        <DiaryCapturePanel {...panelProps} />
      ) : active === "meeting" ? (
        <MeetingCapturePanel {...panelProps} />
      ) : active === "asset" ? (
        <Suspense fallback={null}>
          <AssetCapturePanel {...panelProps} />
        </Suspense>
      ) : active === "habit" ? (
        <Suspense fallback={null}>
          <HabitCapturePanel {...panelProps} />
        </Suspense>
      ) : (
        <NoteCapturePanel {...panelProps} />
      )}
      {/*
        DEBT-45 — the full-form hand-off. The sheet asks for the least that can
        work; the module's own creation surface is where the rest lives. Leaving
        for it must not cost the user their context, so the link carries the SAME
        contract in the URL and the destination form shows the SAME chip. It is a
        real link (not a scripted button) so it is middle-clickable, focusable and
        announced as navigation.

        A type whose panel IS the module's canonical form (Asset) has no fuller
        surface to offer, so it gets no link rather than one that goes nowhere new.
      */}
      {handoffRoute && handoffLabel ? (
        <div className="dh-capture-context-actions">
          <a
            className="dh-capture-handoff"
            href={handoffRoute}
            /*
             * HARDEN-02 — pressing this must not blur the field behind it.
             *
             * A pointer press focuses what it lands on, so pressing the hand-off
             * blurred the panel's title field, DS-06 validated it, and its "a
             * title is required" message appeared ABOVE this link — moving the
             * link out from under the pointer between `pointerdown` and
             * `pointerup`. Two elements, no `click`, and the hand-off silently
             * did nothing on the first tap. MEASURED on a 390x844 phone: press at
             * y=562, release at y=578 on a different element.
             *
             * Keeping focus where it is fixes it at the cause AND is the right
             * behaviour on its own terms: leaving for the module's fuller form is
             * not abandoning the title, it is going somewhere to write one, so
             * flagging the field as a problem on the way out is a false alarm.
             * Keyboard activation is untouched — this only suppresses the focus
             * a MOUSE press would move, which is the same technique every
             * toolbar control that must not steal focus uses.
             */
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              if (
                event.defaultPrevented ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey ||
                event.button !== 0
              ) {
                return;
              }
              event.preventDefault();
              onClose();
              navigate(handoffRoute);
            }}
            data-testid="capture-full-form"
          >
            {handoffLabel}
          </a>
        </div>
      ) : null}
    </Sheet>
  );
}
