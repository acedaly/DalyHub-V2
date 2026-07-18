/**
 * FND-09 shell — authenticated user summary and logout.
 *
 * Shows the safe display identity (the verified email) and an ordinary logout
 * LINK to the Cloudflare-managed Access endpoint (ADR-016 §5.7). Logout is a
 * plain navigation to `/cdn-cgi/access/logout`, which clears the Access
 * session — DalyHub never fakes a "logout" by deleting a local cookie, and never
 * puts the JWT in the URL.
 */

/** The Cloudflare Access application logout endpoint. */
export const ACCESS_LOGOUT_PATH = "/cdn-cgi/access/logout";

export type UserMenuProps = {
  /** The authenticated owner's verified email (safe display identity). */
  readonly email: string;
};

export function UserMenu({ email }: UserMenuProps) {
  return (
    <div className="user-menu">
      <span className="user-email" title={email}>
        {email}
      </span>
      <a className="logout-link" href={ACCESS_LOGOUT_PATH}>
        Log out
      </a>
    </div>
  );
}
