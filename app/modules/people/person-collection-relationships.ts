/**
 * PEOPLE-03 — the People collection's BATCHED relationship read.
 *
 * The three collection routes (`/people`, `/people/recent`, `/people/archived`)
 * each load one bounded page of People and then need one stay-in-touch signal per
 * card. The naive shape — evaluate per Person — would be a textbook N+1: one link
 * scan and three Activity aggregates for every row on the page.
 *
 * This helper is the opposite: ONE `listPersonRelationshipFacts` call for the WHOLE
 * page, which the repository resolves in a fixed number of grouped, chunked
 * statements regardless of page size, followed by pure in-memory evaluation. Adding
 * a card to the page costs no extra round trip.
 *
 * A Person with no relationships is simply absent from the facts map; the honest
 * zero shape is composed here rather than fabricated in SQL. A facts failure
 * degrades the whole page to no signal at all — the collection must stay usable.
 */

import type { FollowUpFrequency, Person } from "~/kernel/people";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import type { AppPreferencesRepository } from "~/kernel/preferences";
import {
  emptyPersonRelationshipFacts,
  evaluatePersonRelationship,
  type PersonRelationshipFacts,
  type RelationshipRepository,
} from "~/kernel/relationships";
import { createOwnerRelationshipContext } from "~/shared/relationships";

import {
  serializePersonListItem,
  type SerializedPersonListItem,
  type SerializedPersonStayInTouch,
} from "./person-view";

/** The minimum a Person must carry for the signal to be evaluated. */
export interface RelationshipPageSubject {
  readonly id: string;
  readonly followUpFrequency: FollowUpFrequency | null;
  readonly nextFollowUp: string | null;
}

/**
 * Evaluate the stay-in-touch signal for a whole page of People in ONE batched
 * facts read. Returns a map keyed by Person id; a Person missing from the map has
 * no signal to show (only possible when the read itself failed).
 */
export async function loadPageStayInTouch(
  relationships: RelationshipRepository,
  people: readonly RelationshipPageSubject[],
  now: Date,
  timeZone: string | undefined,
): Promise<Map<string, SerializedPersonStayInTouch>> {
  const signals = new Map<string, SerializedPersonStayInTouch>();
  if (people.length === 0) {
    return signals;
  }

  let facts: Map<string, PersonRelationshipFacts>;
  try {
    facts = await relationships.listPersonRelationshipFacts(
      people.map((person) => person.id),
    );
  } catch {
    // The collection stays usable without the signal — never a 500, and never a
    // half-populated page that would read as "these People have no history".
    return signals;
  }

  for (const person of people) {
    const relationship = evaluatePersonRelationship(
      facts.get(person.id) ?? emptyPersonRelationshipFacts(person.id),
      createOwnerRelationshipContext(now, timeZone, {
        followUpFrequency: person.followUpFrequency,
        nextFollowUpIso: person.nextFollowUp,
      }),
    );
    signals.set(person.id, {
      state: relationship.state,
      label: relationship.label,
      tone: relationship.tone,
      // Only the PRIMARY reason travels to a card: it is the one line the card has
      // room for, and shipping the rest would be payload for nothing.
      reasons: relationship.reasons.slice(0, 1),
      lastInteractionDate: relationship.summary.lastInteractionDate,
      daysSinceLastInteraction: relationship.cadence.daysSinceLastInteraction,
    });
  }
  return signals;
}

/**
 * Resolve the owner's calendar timezone for a collection read, falling back to the
 * deterministic application default when no preference is stored or the read fails.
 * A timezone lookup must never take a collection down.
 */
export async function resolveOwnerTimezone(
  appPreferences: AppPreferencesRepository,
  subject: string,
): Promise<string> {
  try {
    return (await appPreferences.get(subject)).timezone;
  } catch {
    return DEFAULT_APP_PREFERENCES.timezone;
  }
}

/**
 * Serialize a whole bounded page of People WITH their derived stay-in-touch signal,
 * in ONE batched facts read. This is the shape every People collection route uses,
 * so none of them can drift into a per-Person read.
 */
export async function serializePeoplePage(
  relationships: RelationshipRepository,
  appPreferences: AppPreferencesRepository,
  subject: string,
  people: readonly Person[],
  now: Date = new Date(),
): Promise<SerializedPersonListItem[]> {
  const timeZone = await resolveOwnerTimezone(appPreferences, subject);
  const signals = await loadPageStayInTouch(
    relationships,
    people,
    now,
    timeZone,
  );
  return people.map((person) =>
    serializePersonListItem(person, signals.get(person.id)),
  );
}
