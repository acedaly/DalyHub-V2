/**
 * The Cloudflare Access application logout endpoint (ADR-016 §5.7).
 *
 * Its own module (SET-03) because two things now need it — the account menu's
 * Sign out and the shared sign-out hook — and having the hook import it from the
 * menu component would make the menu depend on the hook and the hook on the menu.
 * `UserMenu` still re-exports it, because that has always been its import path.
 *
 * This is Cloudflare's endpoint, not DalyHub's. DalyHub does not implement, wrap
 * or emulate it: ending the session is Access's job, and the supported way to ask
 * for that is to send the browser here.
 */
export const ACCESS_LOGOUT_PATH = "/cdn-cgi/access/logout";
