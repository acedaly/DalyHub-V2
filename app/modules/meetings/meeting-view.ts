import type { Meeting } from "~/kernel/meetings";
export function serializeMeeting(m: Meeting) {
  return {
    ...m,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    deletedAt: null,
    startsAt: m.startsAt.toISOString(),
    endsAt: m.endsAt?.toISOString() ?? null,
    archivedAt: m.archivedAt?.toISOString() ?? null,
    heldAt: m.heldAt?.toISOString() ?? null,
    items: m.items.map((i) => ({
      ...i,
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
    })),
  };
}
export type SerializedMeeting = ReturnType<typeof serializeMeeting>;
