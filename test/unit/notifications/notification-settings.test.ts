/**
 * NOTIFY-01 — the settings validation, and the "off by default" contract.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationSettingsValidationError,
  parseDigestSendTime,
  parseNotificationSettingsPatch,
  parseNotificationTimeZone,
  parsePushoverAppToken,
  parsePushoverUserKey,
  resolveNotificationTimeZone,
} from "~/kernel/notifications";

describe("the defaults", () => {
  it("are off", () => {
    // A product that reaches a phone must be asked to.
    expect(DEFAULT_NOTIFICATION_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_NOTIFICATION_SETTINGS.pushoverEnabled).toBe(false);
  });

  it("have both sources ready for the moment it is turned on", () => {
    expect(DEFAULT_NOTIFICATION_SETTINGS.digestEnabled).toBe(true);
    expect(DEFAULT_NOTIFICATION_SETTINGS.assetObligationsEnabled).toBe(true);
    expect(DEFAULT_NOTIFICATION_SETTINGS.digestSendTime).toBe("07:00");
  });

  it("follow the owner's profile timezone until told otherwise", () => {
    expect(DEFAULT_NOTIFICATION_SETTINGS.timeZone).toBeNull();
    expect(
      resolveNotificationTimeZone({ timeZone: null }, "Europe/London"),
    ).toBe("Europe/London");
    expect(
      resolveNotificationTimeZone(
        { timeZone: "Australia/Perth" },
        "Europe/London",
      ),
    ).toBe("Australia/Perth");
  });
});

describe("the send time", () => {
  it("accepts what a native time input produces", () => {
    expect(parseDigestSendTime("07:00")).toBe("07:00");
    expect(parseDigestSendTime("00:00")).toBe("00:00");
    expect(parseDigestSendTime("23:59")).toBe("23:59");
  });

  it("refuses anything else rather than guessing", () => {
    for (const bad of ["7:00", "0700", "24:00", "07:60", "", null, 7]) {
      expect(() => parseDigestSendTime(bad)).toThrow(
        NotificationSettingsValidationError,
      );
    }
  });
});

describe("the timezone", () => {
  it("accepts an IANA zone", () => {
    expect(parseNotificationTimeZone("Australia/Sydney")).toBe(
      "Australia/Sydney",
    );
  });

  it("reads an empty value as 'follow my profile'", () => {
    expect(parseNotificationTimeZone("")).toBeNull();
    expect(parseNotificationTimeZone(null)).toBeNull();
  });

  it("refuses a zone that is not one", () => {
    expect(() => parseNotificationTimeZone("Mars/Olympus")).toThrow(
      NotificationSettingsValidationError,
    );
  });
});

describe("the Pushover credentials", () => {
  const KEY = "uQiRzpo4DXghDmr9QzzfQu27cmVRsG";

  it("accepts a Pushover-shaped identifier", () => {
    expect(parsePushoverUserKey(KEY)).toBe(KEY);
    expect(parsePushoverAppToken(KEY)).toBe(KEY);
  });

  it("trims a pasted value", () => {
    expect(parsePushoverUserKey(`  ${KEY}\n`)).toBe(KEY);
  });

  it("reads an empty value as 'forget this key'", () => {
    expect(parsePushoverUserKey("")).toBeNull();
    expect(parsePushoverAppToken(null)).toBeNull();
  });

  it("refuses a URL, an email or an accidental page paste", () => {
    for (const bad of [
      "https://pushover.net/users/abc",
      "someone@example.test",
      "short",
      "x".repeat(200),
      "has spaces in it here",
    ]) {
      expect(() => parsePushoverUserKey(bad)).toThrow(
        NotificationSettingsValidationError,
      );
    }
  });

  it("names the field it refused, so the surface can point at it", () => {
    try {
      parsePushoverAppToken("nope");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(NotificationSettingsValidationError);
      expect((error as NotificationSettingsValidationError).field).toBe(
        "pushoverAppToken",
      );
    }
  });
});

describe("a whole patch", () => {
  it("touches only the fields it names", () => {
    expect(parseNotificationSettingsPatch({ enabled: "true" })).toEqual({
      enabled: true,
    });
    expect(parseNotificationSettingsPatch({})).toEqual({});
  });

  it("reads a form's string booleans", () => {
    expect(
      parseNotificationSettingsPatch({
        digestEnabled: "false",
        assetObligationsEnabled: "true",
      }),
    ).toEqual({ digestEnabled: false, assetObligationsEnabled: true });
  });

  it("refuses the whole patch when one field is bad", () => {
    expect(() =>
      parseNotificationSettingsPatch({
        enabled: "true",
        digestSendTime: "breakfast",
      }),
    ).toThrow(NotificationSettingsValidationError);
  });

  it("has no way to assert that credentials were validated", () => {
    // "These keys worked" is an observation the server makes after talking to
    // Pushover, never something a form may claim. There is no patch field for
    // it, which is the strongest form that rule can take.
    const patch = parseNotificationSettingsPatch({
      pushoverValidatedAt: "2026-08-16T00:00:00.000Z",
    } as Record<string, unknown>);
    expect(patch).toEqual({});
  });
});
