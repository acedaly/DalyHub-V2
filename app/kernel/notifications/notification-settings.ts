/**
 * NOTIFY-01 — the owner's notification configuration, and its validation.
 *
 * OFF by default, and off means off: while `enabled` is false nothing is
 * evaluated, nothing is written to the ledger and nothing is sent. An absent
 * settings row and a row with `enabled = false` are the same state, so a
 * deployment whose owner never opens the section behaves exactly as it did
 * before this item existed.
 *
 * ── Two shapes, on purpose ──────────────────────────────────────────────────
 * {@link NotificationSettings} is what Settings renders and what a loader may
 * return: it says WHETHER a channel credential is present, never what it is.
 * {@link NotificationSettingsWithSecrets} adds the credentials and exists for
 * exactly two callers — the channel adapter and the validation action. Keeping
 * them apart is what makes "a Pushover key cannot reach the browser" a property
 * of the types rather than of a reviewer noticing.
 */

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

export class NotificationSettingsValidationError extends Error {
  readonly code = "validation" as const;
  constructor(
    readonly field:
      | "ownerId"
      | "enabled"
      | "digestEnabled"
      | "assetObligationsEnabled"
      | "digestSendTime"
      | "timeZone"
      | "pushoverEnabled"
      | "pushoverUserKey"
      | "pushoverAppToken",
    message: string,
  ) {
    super(message);
    this.name = "NotificationSettingsValidationError";
  }
}

export class NotificationStorageError extends Error {
  readonly code = "storage" as const;
  constructor(operation: string, options?: ErrorOptions) {
    super(`A notification storage error occurred (${operation}).`, options);
    this.name = "NotificationStorageError";
  }
}

/* -------------------------------------------------------------------------- */
/* The settings                                                                */
/* -------------------------------------------------------------------------- */

/** The configuration, WITHOUT any credential. Safe to return to a browser. */
export interface NotificationSettings {
  /** The master switch. Everything below is inert while this is false. */
  readonly enabled: boolean;
  readonly digestEnabled: boolean;
  readonly assetObligationsEnabled: boolean;
  /** `HH:MM`, read in {@link NotificationSettings.timeZone}. */
  readonly digestSendTime: string;
  /**
   * The zone the send time is read in, or null for "follow the owner's profile
   * timezone". Null is the DEFAULT and is displayed rather than hidden: a send
   * time with an unstated zone is a setting nobody can reason about.
   */
  readonly timeZone: string | null;
  readonly pushoverEnabled: boolean;
  /** Whether both Pushover credentials are stored. Never their values. */
  readonly pushoverConfigured: boolean;
  /** When those credentials last passed Pushover's own validation endpoint. */
  readonly pushoverValidatedAt: Date | null;
  readonly version: number;
}

/** The configuration WITH credentials. Server-only; two callers, both named. */
export interface NotificationSettingsWithSecrets extends NotificationSettings {
  readonly ownerId: string;
  readonly pushoverUserKey: string | null;
  readonly pushoverAppToken: string | null;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  digestEnabled: true,
  assetObligationsEnabled: true,
  digestSendTime: "07:00",
  timeZone: null,
  pushoverEnabled: false,
  pushoverConfigured: false,
  pushoverValidatedAt: null,
  version: 1,
};

/** A partial write. Only the named fields are touched. */
export interface NotificationSettingsPatch {
  readonly enabled?: boolean;
  readonly digestEnabled?: boolean;
  readonly assetObligationsEnabled?: boolean;
  readonly digestSendTime?: string;
  /** `null` clears the override and returns to the profile timezone. */
  readonly timeZone?: string | null;
  readonly pushoverEnabled?: boolean;
  /** `null` clears the stored credential (and, with it, the validation). */
  readonly pushoverUserKey?: string | null;
  readonly pushoverAppToken?: string | null;
}

/**
 * The zone the digest is actually read in.
 *
 * One function, so the evaluator, the Settings surface and the digest renderer
 * cannot each answer "which zone?" differently — which is exactly how a setting
 * comes to display one thing and behave as another.
 */
export function resolveNotificationTimeZone(
  settings: Pick<NotificationSettings, "timeZone">,
  profileTimeZone: string,
): string {
  return settings.timeZone ?? profileTimeZone;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

const OWNER_ID_MAX_LENGTH = 256;

let supportedTimezones: ReadonlySet<string> | null = null;

function timezoneSet(): ReadonlySet<string> {
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };
  supportedTimezones ??= new Set(
    intlWithSupportedValues.supportedValuesOf?.("timeZone") ?? [],
  );
  return supportedTimezones;
}

export function parseNotificationOwnerId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new NotificationSettingsValidationError(
      "ownerId",
      "Owner identity is required.",
    );
  }
  if (value.length > OWNER_ID_MAX_LENGTH) {
    throw new NotificationSettingsValidationError(
      "ownerId",
      `Owner identity must be at most ${OWNER_ID_MAX_LENGTH} characters.`,
    );
  }
  return value;
}

/**
 * `HH:MM`, 24-hour, zero-padded.
 *
 * A native `<input type="time">` produces exactly this, and the database CHECKs
 * it too — so a malformed send time cannot reach the evaluator from a form, from
 * a hand-edited row, or from a future caller that forgot to parse.
 */
export function parseDigestSendTime(value: unknown): string {
  if (typeof value === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) {
    return value;
  }
  throw new NotificationSettingsValidationError(
    "digestSendTime",
    "Choose a time of day.",
  );
}

/** An IANA zone, or null to follow the owner's profile timezone. */
export function parseNotificationTimeZone(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value === "string") {
    const supported = timezoneSet();
    // `supportedValuesOf` is absent on some runtimes; where it is, fall back to
    // asking Intl whether it can format in the zone — the same two-step the
    // application-preferences parser uses, for the same reason.
    if (supported.size === 0) {
      try {
        new Intl.DateTimeFormat("en-AU", { timeZone: value });
        return value;
      } catch {
        // fall through to the refusal below
      }
    } else if (supported.has(value)) {
      return value;
    }
  }
  throw new NotificationSettingsValidationError(
    "timeZone",
    "Choose a valid IANA timezone.",
  );
}

/**
 * A Pushover key or token.
 *
 * Pushover issues 30-character alphanumeric identifiers. The bound here is
 * deliberately a little wider than that and a little narrower than the column:
 * wide enough not to reject a format Pushover changes, narrow enough that a
 * pasted URL, an email address or an accidental whole-page paste is refused
 * before it is stored.
 */
function parsePushoverCredential(
  field: "pushoverUserKey" | "pushoverAppToken",
  value: unknown,
  label: string,
): string | null {
  if (value === null || value === "") return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^[A-Za-z0-9]{20,64}$/.test(trimmed)) return trimmed;
  }
  throw new NotificationSettingsValidationError(
    field,
    `That does not look like a Pushover ${label}.`,
  );
}

export function parsePushoverUserKey(value: unknown): string | null {
  return parsePushoverCredential("pushoverUserKey", value, "user key");
}

export function parsePushoverAppToken(value: unknown): string | null {
  return parsePushoverCredential(
    "pushoverAppToken",
    value,
    "application token",
  );
}

/** A form-post boolean. `"true"` / `"false"`, or a real boolean. */
export function parseNotificationBoolean(
  field: NotificationSettingsValidationError["field"],
  value: unknown,
): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new NotificationSettingsValidationError(field, "Choose on or off.");
}

/** Validate a whole patch, field by field, refusing the first bad value. */
export function parseNotificationSettingsPatch(
  patch: Record<string, unknown>,
): NotificationSettingsPatch {
  const out: {
    -readonly [
      K in keyof NotificationSettingsPatch
    ]: NotificationSettingsPatch[K];
  } = {};
  if (patch.enabled !== undefined) {
    out.enabled = parseNotificationBoolean("enabled", patch.enabled);
  }
  if (patch.digestEnabled !== undefined) {
    out.digestEnabled = parseNotificationBoolean(
      "digestEnabled",
      patch.digestEnabled,
    );
  }
  if (patch.assetObligationsEnabled !== undefined) {
    out.assetObligationsEnabled = parseNotificationBoolean(
      "assetObligationsEnabled",
      patch.assetObligationsEnabled,
    );
  }
  if (patch.digestSendTime !== undefined) {
    out.digestSendTime = parseDigestSendTime(patch.digestSendTime);
  }
  if (patch.timeZone !== undefined) {
    out.timeZone = parseNotificationTimeZone(patch.timeZone);
  }
  if (patch.pushoverEnabled !== undefined) {
    out.pushoverEnabled = parseNotificationBoolean(
      "pushoverEnabled",
      patch.pushoverEnabled,
    );
  }
  if (patch.pushoverUserKey !== undefined) {
    out.pushoverUserKey = parsePushoverUserKey(patch.pushoverUserKey);
  }
  if (patch.pushoverAppToken !== undefined) {
    out.pushoverAppToken = parsePushoverAppToken(patch.pushoverAppToken);
  }
  return out;
}
