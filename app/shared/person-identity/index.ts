/**
 * UNTITLED-13 — the shared Person identity presentation.
 *
 * ONE answer to "how is a person drawn", reachable from every module, built on
 * the genuine Untitled `base/avatar` source. It exists because there were two
 * answers — one inside `~/modules/people`, one written in `meetings.css`
 * because the first was unreachable — and the same person therefore looked like
 * a different object depending on which screen you found them on (§34).
 *
 * It is presentation only. It resolves no relationships, derives no circles and
 * reads nothing: a caller hands it already-derived display data, which is what
 * lets Meetings draw a Person without importing from People.
 */

export {
  PersonAvatar,
  type PersonAvatarProps,
  type PersonAvatarSize,
} from "./PersonAvatar";
export {
  PersonAvatarGroup,
  type PersonAvatarGroupMember,
  type PersonAvatarGroupProps,
} from "./PersonAvatarGroup";
export {
  PersonIdentityBand,
  type PersonIdentityBandProps,
} from "./PersonIdentityBand";
export { initialsFromName } from "./person-initials";
