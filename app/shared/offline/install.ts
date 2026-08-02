/**
 * PWA-01 — installation: the programmable path, and the honest one.
 *
 * Two very different platforms, described accurately rather than uniformly:
 *
 *   - **Chromium** fires `beforeinstallprompt`, which can be deferred and
 *     replayed from a button. DalyHub captures it and offers an Install control
 *     where the owner would look for one (Settings), never as an interstitial or
 *     a floating banner.
 *   - **iOS and iPadOS Safari** have no such event and never will on the current
 *     platform: installation is a user action in the Share menu. DalyHub does not
 *     pretend otherwise, does not render a fake "Install" button that cannot
 *     install, and instead gives the three actual steps.
 *
 * The detection below is capability- and platform-shaped, not a user-agent
 * feature test dressed up as one, and it is used ONLY to choose which
 * instructions to show — never to fork behaviour.
 */

/** The `beforeinstallprompt` event, which is not in the DOM lib types. */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

/** How this device can install DalyHub. */
export type InstallCapability =
  /** A deferred prompt is held; `promptInstall()` will work. */
  | { readonly kind: "prompt" }
  /** The platform installs by hand; show the steps. */
  | { readonly kind: "manual"; readonly platform: "ios" | "other" }
  /** Already installed / already running standalone. */
  | { readonly kind: "installed" };

/**
 * True for iOS and iPadOS. iPadOS reports a Macintosh user agent, so the
 * touch-points check is what actually distinguishes an iPad from a Mac —
 * a Mac reports 0.
 */
export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}

/** The manual Add to Home Screen steps, as accurate prose. */
export const IOS_INSTALL_STEPS: readonly string[] = [
  "Open DalyHub in Safari (Add to Home Screen is a Safari feature and is not offered in other iOS browsers).",
  "Tap the Share button — the square with an arrow pointing up.",
  "Scroll down, tap “Add to Home Screen”, then tap “Add”.",
];

/** The desktop/Android manual steps, for browsers with no prompt event. */
export const GENERIC_INSTALL_STEPS: readonly string[] = [
  "Open your browser’s menu.",
  "Look for “Install DalyHub”, “Install app”, or “Add to Home screen”.",
  "Confirm, and DalyHub opens in its own window.",
];

/**
 * Watch for an installable state. Returns a cleanup function.
 *
 * `beforeinstallprompt` fires once and must be captured synchronously or the
 * browser shows its own mini-infobar; `preventDefault()` is what defers it to
 * DalyHub's own control.
 */
export function watchInstallability(
  onChange: (event: BeforeInstallPromptEvent | null) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const onBeforeInstallPrompt = (event: Event) => {
    event.preventDefault();
    onChange(event as BeforeInstallPromptEvent);
  };
  const onInstalled = () => onChange(null);

  window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

/** Resolve what to offer this device. Pure given its inputs. */
export function installCapability(input: {
  readonly deferredPrompt: BeforeInstallPromptEvent | null;
  readonly standalone: boolean;
  readonly ios: boolean;
}): InstallCapability {
  if (input.standalone) return { kind: "installed" };
  if (input.deferredPrompt) return { kind: "prompt" };
  return { kind: "manual", platform: input.ios ? "ios" : "other" };
}
