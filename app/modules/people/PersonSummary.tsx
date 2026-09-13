/**
 * UNTITLED-13 — the Person's relationship workspace.
 *
 * ── What this was, and why it changed ───────────────────────────────────────
 *
 * PEOPLE-01/03 built a "Summary" tab and it was, structurally, a stack of five
 * unrelated regions: an identity head, a grid of up to nine counting tiles, an
 * explanatory cadence panel, a `<dl>` of key dates, a tag row and a text link.
 * Everything on it was true. None of it answered the question §21 of the brief
 * says a Person record exists to answer — *how do I know them, what is between
 * us, and is anything coming up?* — because the answers were spread across
 * three other tabs (Linked, Activity, Contact) and the tab that opened first
 * led with a scoreboard.
 *
 * Two of those tiles were the scoreboard specifically. "Total interactions: 47"
 * is a CRM metric wearing DalyHub's vocabulary: it counts a relationship. §21
 * rules that out by name, and the honest version of the same fact — that you
 * have 47 recorded moments across 22 days — is CONTEXT for the rhythm, so it
 * moved under the rhythm rather than being deleted. Nothing is lost; one thing
 * stopped being a headline.
 *
 * ── The order now, which is §25's ───────────────────────────────────────────
 *
 *   identity                → who they are, and the two things you would do next
 *   what is happening now   → the rhythm, and anything genuinely upcoming
 *   what you share          → Meetings, Notes, commitments, Projects
 *   recent meaningful activity → the real timeline, bounded, leading to all of it
 *   secondary details       → dates, preference, tags
 *
 * ── The Pro composition ─────────────────────────────────────────────────────
 *
 * `informational-01/17` and `informational-02/12` (both Pro, both studied from
 * their screenshots — the connector will not release Pro source here). Their
 * profile pages are: a large mark with a name and ONE line about the person,
 * the actions beside it, then prose, then a QUIET two-column labelled strip of
 * reference facts, then a divided list of history. Not one labelled field grid
 * anywhere. That is the shape below, and it is why the dates and the contact
 * preference are a quiet strip near the bottom rather than a table near the top.
 *
 * Nothing here is computed: the loader evaluates the kernel's relationship model
 * server-side and this component lays it out.
 */

import type { ReactNode } from "react";
import { Link } from "react-router";

import type { PersonRelationship } from "~/kernel/relationships";
import { PersonIdentityBand } from "~/shared/person-identity";
import {
  StayInTouchPanel,
  formatRelationshipDate,
} from "~/shared/relationships";
import { Badge, ButtonLink, TagChipList } from "~/shared/ui";
import { SectionHeading } from "~/shared/ui/untitled/overrides/section-heading";
import { cx } from "~/shared/ui/untitled/utils/cx";

import { personCircle, personCircleRank } from "./person-circles";
import {
  personActivityHref,
  personLinkedHref,
  personSharedRecords,
  type PersonSharedRecord,
} from "./person-relationship-view";
import { PersonRecentActivity } from "./PersonRecentActivity";
import {
  formatBirthday,
  formatPersonDate,
  type SerializedPerson,
} from "./person-view";

interface PersonSummaryProps {
  readonly person: SerializedPerson;
  /** The PEOPLE-03 derived relationship, evaluated server-side on every load. */
  readonly relationship: PersonRelationship;
  readonly onEditContact: () => void;
}

const STAY_IN_TOUCH_HEADING_ID = "dh-person-stay-in-touch-heading";
const SHARED_HEADING_ID = "dh-person-shared-heading";

export function PersonSummary({
  person,
  relationship,
  onEditContact,
}: PersonSummaryProps) {
  const shared = personSharedRecords(relationship);
  const upcoming = upcomingItems(person, relationship);
  const details = detailItems(person, relationship);

  return (
    <div className="dh-person-summary flex flex-col gap-8">
      <h2 className="dh-visually-hidden">Summary</h2>

      <PersonIdentityBand
        name={person.title}
        initials={person.initials}
        photoUrl={person.photoUrl}
        colourRank={personCircleRank(personCircle(person.relationship))}
        /*
         * RECORD-01's rule, unchanged: the record's `h1` above already states
         * the title, the role and the organisation, so this band carries only
         * what a header cannot — the face, what they are actually called, and
         * the relationship word that makes this a relationship record rather
         * than a contact row.
         */
        preferredName={
          person.preferredName && person.preferredName !== person.title
            ? person.preferredName
            : null
        }
        relationship={
          person.relationshipLabel ? (
            <p className="m-0">
              <Badge tone="accent">{person.relationshipLabel}</Badge>
            </p>
          ) : null
        }
        actions={<ContactActions person={person} />}
      />

      {/*
        WHAT IS HAPPENING NOW — the rhythm, and anything genuinely ahead.

        §30's rule is the load-bearing one here: upcoming context is surfaced
        only where the DATA supports it. A Person with no follow-up date and no
        birthday recorded gets no band at all, rather than an empty one telling
        them what they have not filled in.
      */}
      <Band
        title="Staying in touch"
        headingId={STAY_IN_TOUCH_HEADING_ID}
        description={rhythmContext(relationship)}
      >
        <StayInTouchPanel
          relationship={relationship}
          headingId={STAY_IN_TOUCH_HEADING_ID}
        />
        {upcoming.length > 0 ? <FactStrip items={upcoming} /> : null}
      </Band>

      {/*
        WHAT YOU SHARE — the linked records, as one divided band of links.

        This replaces the DS-13 summary-card grid on this record only (Projects,
        Areas and Assets keep it). Nine tiles of counts down a Person record is
        the "dashboard-card overload" DESIGN_DIRECTION rules out, and a count
        with nowhere to go is a number rather than a relationship. Every row
        here leads to the Linked tab, which is the surface that opens the record
        behind it.
      */}
      {shared.length > 0 ? (
        <Band
          title="What you share"
          headingId={SHARED_HEADING_ID}
          description="Every record you have linked to this person."
        >
          <SharedRecordList
            records={shared}
            href={personLinkedHref(person.id)}
            headingId={SHARED_HEADING_ID}
          />
        </Band>
      ) : null}

      {/*
        RECENT MEANINGFUL ACTIVITY — the real timeline, bounded.

        §28/§29: the shared activity composition, over the same one
        `/person/:id/activity` endpoint the Activity tab reads, showing the most
        recent moments and leading to all of them. Nothing is fabricated and
        nothing is duplicated — it IS the Activity tab's stream, read short.
      */}
      <PersonRecentActivity
        personId={person.id}
        reloadKey={person.updatedAt}
        allHref={personActivityHref(person.id)}
      />

      {/* SECONDARY DETAILS — reference, in the quiet strip the Pro profile
          pages put reference facts in. Tags come with them, because a tag is
          the same kind of thing: something you filed, not something you do. */}
      {details.length > 0 || person.tags.length > 0 ? (
        <Band title="Details">
          {details.length > 0 ? <FactStrip items={details} /> : null}
          <TagChipList
            tags={person.tags}
            label="Tags"
            className="dh-person-summary__tags flex list-none flex-wrap gap-2 p-0"
          />
          {/*
            §36 — this NAVIGATES, so it is a link with a real href. It used to
            be a `<button>` calling `onTabChange("contact")`, which meant the
            one control on the record for "let me fix their phone number" could
            not be opened in a new tab, middle-clicked or copied. The tab is
            URL state on this record already, so the href is the whole
            behaviour and the callback only keeps the switch client-side.
          */}
          <p className="dh-person-summary__edit m-0">
            <Link
              to={`/person/${encodeURIComponent(person.id)}?tab=contact`}
              className="text-sm font-semibold text-brand-secondary outline-focus-ring hover:text-brand-secondary_hover focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => onEditContact()}
            >
              Edit contact details
            </Link>
          </p>
        </Band>
      ) : null}
    </div>
  );
}

/**
 * One region of the workspace.
 *
 * Untitled's own band grammar: a `SectionHeading` (its `section-headers`
 * recipe, at the heading LEVEL a record demands) over content, separated from
 * its neighbours by space rather than by a card each. §44 — the record panel is
 * already a surface, and five boxes inside it is the card-inside-a-card the
 * brief rules out.
 */
function Band({
  title,
  description,
  headingId,
  children,
}: {
  readonly title: string;
  readonly description?: string | null;
  readonly headingId?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="dh-person-summary__section flex min-w-0 flex-col gap-4">
      <SectionHeading
        level={2}
        title={title}
        description={description ?? undefined}
        id={headingId}
      />
      {children}
    </section>
  );
}

/**
 * The quiet labelled fact strip.
 *
 * `informational-01/17`'s right-hand column: a small quaternary label over a
 * primary value, two or more per row, wrapping down to one on a phone. It is a
 * `<dl>` because that is what it is, and the labels are what keep a bare date
 * from being ambiguous.
 */
function FactStrip({
  items,
}: {
  readonly items: readonly { id: string; label: string; value: ReactNode }[];
}) {
  return (
    <dl className="dh-person-summary__facts m-0 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="dh-person-summary__fact flex min-w-0 flex-col gap-0.5"
        >
          <dt className="text-xs font-medium text-quaternary">{item.label}</dt>
          <dd className="m-0 text-sm font-medium break-words text-primary">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The shared-records band: a divided list, each row a link to the Linked tab.
 *
 * The anatomy is `application/table`'s divided body — a bounded surface whose
 * rows are separated by hairlines and light up on hover — because that is what
 * this is: a short table of one column. It is deliberately NOT the table
 * component itself; a React Aria `grid` for four rows of "Meetings … 4" would
 * cost a keyboard user a grid to navigate out of for no benefit.
 */
function SharedRecordList({
  records,
  href,
  headingId,
}: {
  readonly records: readonly PersonSharedRecord[];
  readonly href: string;
  readonly headingId: string;
}) {
  return (
    <ul
      className="dh-person-shared m-0 list-none overflow-hidden rounded-xl bg-primary p-0 shadow-xs ring-1 ring-secondary"
      aria-labelledby={headingId}
      data-testid="person-shared-records"
    >
      {records.map((record) => (
        <li
          key={record.id}
          className="border-b border-secondary last:border-b-0"
        >
          <Link
            to={href}
            className={cx(
              "flex items-center gap-3 px-4 py-3 outline-focus-ring transition duration-100 ease-linear",
              "hover:bg-secondary focus-visible:outline-2 focus-visible:-outline-offset-2",
            )}
            // The count and the noun both, so a screen-reader user hears the
            // whole fact rather than "4, link".
            aria-label={`${record.label}: ${record.value}`}
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary">
              {record.label}
            </span>
            <span className="shrink-0 text-sm text-tertiary tabular-nums">
              {record.value}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * UIQ-011 — the Person's PRIMARY actions are Call and Email, and only when the
 * contact data supports them.
 *
 * A greyed-out Call on someone with no number is a control that can never do
 * anything, so it is not rendered rather than rendered disabled — the Contact
 * tab is where a missing number gets added. `sms:` needs a MOBILE specifically,
 * so a person with only a work number gets two actions and not a third that
 * would text a landline. Everything else this row used to carry (create a Task,
 * a Meeting, a Note, a Diary entry; copy a field) is in the record header's
 * overflow with this Person's context attached — see `PersonRecord`.
 */
function ContactActions({ person }: { readonly person: SerializedPerson }) {
  const phone = person.mobile ?? person.workPhone;
  const actions: ReactNode[] = [];
  if (phone) {
    actions.push(
      <ButtonLink
        key="call"
        variant="secondary"
        size="sm"
        href={`tel:${phone}`}
      >
        Call
      </ButtonLink>,
    );
  }
  if (person.email) {
    actions.push(
      <ButtonLink
        key="email"
        variant="secondary"
        size="sm"
        href={`mailto:${person.email}`}
      >
        Email
      </ButtonLink>,
    );
  }
  if (person.mobile) {
    actions.push(
      <ButtonLink
        key="message"
        variant="secondary"
        size="sm"
        href={`sms:${person.mobile}`}
      >
        Message
      </ButtonLink>,
    );
  }
  return actions.length > 0 ? <>{actions}</> : null;
}

/**
 * The rhythm band's supporting line — and the new home of the two facts that
 * used to be counting tiles.
 *
 * "47 moments across 22 days" under a heading about staying in touch is the
 * evidence the rhythm rests on. The same two numbers in their own tiles, at the
 * top of the record, were a score. Nothing is computed here: both come from the
 * kernel's evaluator.
 */
function rhythmContext(relationship: PersonRelationship): string | null {
  const { summary, cadence } = relationship;
  if (summary.totalInteractions === 0) return null;
  const moments =
    summary.totalInteractions === 1
      ? "1 recorded moment"
      : `${summary.totalInteractions} recorded moments`;
  return cadence.interactionDays > 1
    ? `${moments} across ${cadence.interactionDays} days.`
    : `${moments}.`;
}

/**
 * §30 — genuinely upcoming context, and nothing manufactured.
 *
 * Only two things about a Person are actually AHEAD of the owner: a follow-up
 * they chose a date for, and a birthday. Neither is invented and neither is
 * given urgency; a Person with neither recorded gets no strip.
 */
function upcomingItems(
  person: SerializedPerson,
  relationship: PersonRelationship,
): { id: string; label: string; value: ReactNode }[] {
  const items: { id: string; label: string; value: ReactNode }[] = [];
  const nextFollowUp = formatPersonDate(person.nextFollowUp);
  if (nextFollowUp) {
    items.push({ id: "next", label: "Next follow-up", value: nextFollowUp });
  }
  const birthday = formatBirthday(person.birthday);
  if (birthday) {
    items.push({ id: "birthday", label: "Birthday", value: birthday });
  }
  const first = formatRelationshipDate(
    relationship.summary.firstInteractionDate,
  );
  if (first) {
    items.push({ id: "first", label: "Known since", value: first });
  }
  return items;
}

/**
 * The reference facts.
 *
 * PEOPLE-03's rule survives: the hand-entered `lastInteraction` field is a
 * FALLBACK, shown only while nothing has actually been recorded. Once the
 * relationship has real history the derived answer above is the honest one, and
 * two fields of the same name that can disagree would be worse than one.
 */
function detailItems(
  person: SerializedPerson,
  relationship: PersonRelationship,
): { id: string; label: string; value: ReactNode }[] {
  const items: { id: string; label: string; value: ReactNode }[] = [];
  const noted =
    relationship.summary.lastInteractionDate === null
      ? formatPersonDate(person.lastInteraction)
      : null;
  if (noted) {
    items.push({
      id: "last",
      label: "Last interaction (noted)",
      value: noted,
    });
  }
  if (person.favouriteContactMethodLabel) {
    items.push({
      id: "prefers",
      label: "Prefers",
      value: person.favouriteContactMethodLabel,
    });
  }
  if (person.followUpFrequencyLabel) {
    items.push({
      id: "cadence",
      label: "Catch up",
      value: person.followUpFrequencyLabel,
    });
  }
  if (person.website) {
    items.push({
      id: "website",
      label: "Website",
      value: (
        <a
          className="text-brand-secondary outline-focus-ring hover:text-brand-secondary_hover focus-visible:outline-2 focus-visible:outline-offset-2"
          href={person.website}
          target="_blank"
          rel="noreferrer"
        >
          {person.website}
        </a>
      ),
    });
  }
  if (person.address) {
    items.push({ id: "address", label: "Address", value: person.address });
  }
  return items;
}
