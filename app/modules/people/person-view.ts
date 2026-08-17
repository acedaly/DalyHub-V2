/**
 * PEOPLE-01 — the People view-model (pure, React-free, server-safe).
 *
 * Converts a kernel `Person` into JSON-safe display data for the collection and
 * the canonical record, and owns the small pure derivations the UI needs (display
 * name, avatar initials, vocabulary labels). Mirrors `~/modules/notes/note-view.ts`
 * and `~/modules/areas/area-view.ts` in shape. Dates are already wall-calendar
 * `YYYY-MM-DD` strings on the kernel record, so no timezone conversion happens
 * here.
 */

import type {
  RelationshipReason,
  RelationshipState,
  RelationshipTone,
} from "~/kernel/relationships";

import {
  CONTACT_METHODS,
  FOLLOW_UP_FREQUENCIES,
  PERSON_RELATIONSHIPS,
  type ContactMethod,
  type FollowUpFrequency,
  type Person,
  type PersonRelationship,
} from "~/kernel/people";

/**
 * PEOPLE-03 — the compact, card-sized projection of a Person's DERIVED
 * stay-in-touch signal. It satisfies the shared `StayInTouchSignal` contract, so the
 * collection card and the Person record render the SAME pill from the same
 * component; only the primary reason travels, because that is all a card shows.
 * Nothing here is stored — it is evaluated per request from live facts.
 */
export type SerializedPersonStayInTouch = {
  readonly state: RelationshipState;
  readonly label: string;
  readonly tone: RelationshipTone;
  readonly reasons: readonly RelationshipReason[];
  /** The owner-calendar date of the last shared moment `YYYY-MM-DD`, or null. */
  readonly lastInteractionDate: string | null;
  /** Owner-calendar days since that moment, or null when there is none. */
  readonly daysSinceLastInteraction: number | null;
  /**
   * CONVERGE-01 §7 — the two counts the row's CONNECTION line is built from.
   *
   * Both come out of the same batched `listPersonRelationshipFacts` read the
   * signal above already performs (`relationship.summary`), so the row leads
   * with what connects the owner to this Person at no extra query and no new
   * repository method.
   *
   * `openTasks` is the honest single answer to "what have I got outstanding with
   * them": a `task.waiting_on` link and an ordinary Task↔Person link are both
   * active EntityLinks from a Task to this Person, so the inventory counts them
   * together and the row says "open Tasks" rather than claiming a distinction
   * the count does not make.
   */
  readonly openTasks: number;
  /** Linked Projects that are neither complete nor archived. */
  readonly activeProjects: number;
};

/**
 * UIX-05 — one reachable contact, already resolved to a real `href`.
 *
 * The People row's most-used affordance is "write to this person", and until
 * this pass a People list could not do it: the collection projection carried the
 * NAME of the preferred method ("Email") and not the address, so reaching anyone
 * meant opening their record first. The address itself is what an owner scans
 * for, so the address is what travels.
 *
 * This is the owner's own contact book on the owner's own screen, which is a
 * different question from §17's rule about what may leave the product: nothing
 * here is sent anywhere, indexed, or put in a search snippet. `href` is built
 * server-side by `personReach` so no component ever assembles a scheme from a
 * raw field.
 */
export type SerializedPersonReach = {
  /** "Email", "Mobile", "Work phone" — what it is, for the accessible name. */
  readonly kind: string;
  /** The address or number itself, exactly as the owner entered it. */
  readonly value: string;
  /** `mailto:` or `tel:`. */
  readonly href: string;
};

/** One Person on the `/people` collection (card-sized projection). */
export type SerializedPersonListItem = {
  readonly id: string;
  readonly title: string;
  readonly preferredName: string | null;
  readonly organisation: string | null;
  readonly role: string | null;
  readonly relationship: PersonRelationship | null;
  readonly relationshipLabel: string | null;
  readonly favouriteContactMethod: ContactMethod | null;
  readonly favouriteContactMethodLabel: string | null;
  /**
   * Up to two ways to reach this person, preferred first. Empty when nothing
   * reachable was recorded — an absence, drawn as one.
   */
  readonly reach: readonly SerializedPersonReach[];
  readonly tags: readonly string[];
  readonly lastInteraction: string | null;
  readonly nextFollowUp: string | null;
  readonly photoUrl: string | null;
  readonly initials: string;
  readonly archived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  /**
   * The derived stay-in-touch signal, when the page resolved one. Optional so the
   * collection stays renderable if the batched facts read fails — the card simply
   * shows no signal rather than a wrong one.
   */
  readonly stayInTouch?: SerializedPersonStayInTouch;
};

/** The full Person detail projection for the canonical record. */
export type SerializedPerson = {
  readonly id: string;
  readonly title: string;
  readonly preferredName: string | null;
  readonly firstName: string | null;
  readonly middleName: string | null;
  readonly lastName: string | null;
  readonly pronouns: string | null;
  readonly organisation: string | null;
  readonly role: string | null;
  readonly department: string | null;
  readonly email: string | null;
  readonly secondaryEmail: string | null;
  readonly mobile: string | null;
  readonly workPhone: string | null;
  readonly address: string | null;
  readonly website: string | null;
  readonly birthday: string | null;
  readonly relationship: PersonRelationship | null;
  readonly relationshipLabel: string | null;
  readonly tags: readonly string[];
  readonly notes: string | null;
  readonly favouriteContactMethod: ContactMethod | null;
  readonly favouriteContactMethodLabel: string | null;
  readonly followUpFrequency: FollowUpFrequency | null;
  readonly followUpFrequencyLabel: string | null;
  readonly nextFollowUp: string | null;
  readonly lastInteraction: string | null;
  readonly photoUrl: string | null;
  readonly initials: string;
  readonly archived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

const RELATIONSHIP_LABELS = new Map<string, string>(
  PERSON_RELATIONSHIPS.map((r) => [r.value, r.label]),
);
const CONTACT_METHOD_LABELS = new Map<string, string>(
  CONTACT_METHODS.map((c) => [c.value, c.label]),
);
const FOLLOW_UP_FREQUENCY_LABELS = new Map<string, string>(
  FOLLOW_UP_FREQUENCIES.map((f) => [f.value, f.label]),
);

/** The human label for a relationship value, or null. */
export function relationshipLabel(value: string | null): string | null {
  return value ? (RELATIONSHIP_LABELS.get(value) ?? null) : null;
}

/** The human label for a contact-method value, or null. */
export function contactMethodLabel(value: string | null): string | null {
  return value ? (CONTACT_METHOD_LABELS.get(value) ?? null) : null;
}

/** The human label for a follow-up-frequency value, or null. */
export function followUpFrequencyLabel(value: string | null): string | null {
  return value ? (FOLLOW_UP_FREQUENCY_LABELS.get(value) ?? null) : null;
}

/**
 * Derive up to two initials for the generated avatar from the best available
 * name: preferred/first + last, else the display name's words, else the first
 * letter. Always returns at least one visible character.
 */
export function personInitials(person: {
  readonly title: string;
  readonly preferredName?: string | null;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
}): string {
  const first = (person.preferredName ?? person.firstName ?? "").trim();
  const last = (person.lastName ?? "").trim();
  if (first && last) {
    return (letter(first) + letter(last)).toLocaleUpperCase();
  }
  const words = person.title.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (
      letter(words[0]) + letter(words[words.length - 1])
    ).toLocaleUpperCase();
  }
  if (words.length === 1) {
    return letter(words[0]).toLocaleUpperCase() || "·";
  }
  return "·";
}

function letter(value: string): string {
  return [...value][0] ?? "";
}

/**
 * UIX-05 — the reachable contacts for one Person, preferred first.
 *
 * The owner's chosen `favouriteContactMethod` leads when it names a field that
 * is actually filled; otherwise the natural order does — an email before a
 * phone, a mobile before a desk phone, because that is the order a personal
 * contact book is used in. At most two travel: a Person with five recorded
 * addresses is still one person to write to, and the record holds the rest.
 *
 * Only `mailto:` and `tel:` are produced. An address and a website are genuine
 * contact methods and are deliberately NOT here — neither is a way to reach a
 * person from a list, and `https:` from a stored string is a link this surface
 * has no business building.
 */
export function personReach(person: {
  readonly email: string | null;
  readonly secondaryEmail: string | null;
  readonly mobile: string | null;
  readonly workPhone: string | null;
  readonly favouriteContactMethod: ContactMethod | null;
}): SerializedPersonReach[] {
  const candidates: { method: ContactMethod; reach: SerializedPersonReach }[] =
    [];
  const push = (
    method: ContactMethod,
    kind: string,
    value: string | null,
    scheme: "mailto" | "tel",
  ) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    candidates.push({
      method,
      reach: {
        kind,
        value: trimmed,
        // A phone number is written for humans ("0412 345 678"); `tel:` wants it
        // without the spacing, and the visible text keeps the owner's own form.
        href:
          scheme === "tel"
            ? `tel:${trimmed.replace(/[^+\d]/g, "")}`
            : `mailto:${trimmed}`,
      },
    });
  };

  push("email", "Email", person.email, "mailto");
  push("mobile", "Call", person.mobile, "tel");
  push("work_phone", "Call", person.workPhone, "tel");
  push("secondary_email", "Email", person.secondaryEmail, "mailto");

  const preferred = person.favouriteContactMethod;
  const ordered =
    preferred === null
      ? candidates
      : [
          ...candidates.filter((entry) => entry.method === preferred),
          ...candidates.filter((entry) => entry.method !== preferred),
        ];
  return ordered.slice(0, 2).map((entry) => entry.reach);
}

export function serializePersonListItem(
  person: Person,
  stayInTouch?: SerializedPersonStayInTouch,
): SerializedPersonListItem {
  return {
    ...(stayInTouch ? { stayInTouch } : {}),
    reach: personReach(person),
    id: person.id,
    title: person.title,
    preferredName: person.preferredName,
    organisation: person.organisation,
    role: person.role,
    relationship: person.relationship,
    relationshipLabel: relationshipLabel(person.relationship),
    favouriteContactMethod: person.favouriteContactMethod,
    favouriteContactMethodLabel: contactMethodLabel(
      person.favouriteContactMethod,
    ),
    tags: person.tags,
    lastInteraction: person.lastInteraction,
    nextFollowUp: person.nextFollowUp,
    photoUrl: person.photoUrl,
    initials: personInitials(person),
    archived: person.archivedAt !== null,
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
  };
}

export function serializePerson(person: Person): SerializedPerson {
  return {
    id: person.id,
    title: person.title,
    preferredName: person.preferredName,
    firstName: person.firstName,
    middleName: person.middleName,
    lastName: person.lastName,
    pronouns: person.pronouns,
    organisation: person.organisation,
    role: person.role,
    department: person.department,
    email: person.email,
    secondaryEmail: person.secondaryEmail,
    mobile: person.mobile,
    workPhone: person.workPhone,
    address: person.address,
    website: person.website,
    birthday: person.birthday,
    relationship: person.relationship,
    relationshipLabel: relationshipLabel(person.relationship),
    tags: person.tags,
    notes: person.notes,
    favouriteContactMethod: person.favouriteContactMethod,
    favouriteContactMethodLabel: contactMethodLabel(
      person.favouriteContactMethod,
    ),
    followUpFrequency: person.followUpFrequency,
    followUpFrequencyLabel: followUpFrequencyLabel(person.followUpFrequency),
    nextFollowUp: person.nextFollowUp,
    lastInteraction: person.lastInteraction,
    photoUrl: person.photoUrl,
    initials: personInitials(person),
    archived: person.archivedAt !== null,
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
  };
}

/** Format a `YYYY-MM-DD` calendar date for display, or null when unset/invalid. */
export function formatPersonDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [y, m, d] = value.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Format a birthday, omitting the year when it is a placeholder (e.g. 0001). */
export function formatBirthday(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [y, m, d] = value.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}
