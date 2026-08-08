/**
 * AUDIT-10 — reading the document's CSP nonce on the CLIENT.
 *
 * The server puts a fresh nonce on every script it renders and names that same
 * nonce in the response's `Content-Security-Policy`. A browser-side library that
 * needs to inject a `<style>` element — CodeMirror, through `style-mod`, is the
 * only one DalyHub has — must stamp it with the same nonce or the injected
 * stylesheet is refused by `style-src`.
 *
 * There is no client-side nonce channel to invent here, because the document
 * already carries one. `HTMLElement.nonce` is the IDL attribute browsers keep
 * readable after they hide the CONTENT attribute (a deliberate anti-exfiltration
 * measure: `getAttribute("nonce")` returns the empty string once the document is
 * parsed, so a script-injected `[nonce]` selector cannot lift it out of the
 * markup). Reading the property from our own script element is the sanctioned
 * way for first-party code to learn its own nonce.
 *
 * Returns the empty string when there is no nonce to read — during SSR, in a test
 * DOM, or on a document served without a policy. Callers pass the empty string
 * straight through: an absent nonce must produce no `nonce` attribute at all
 * rather than an empty one that matches nothing.
 */

/** The document's CSP nonce, or the empty string when there is none. */
export function readDocumentCspNonce(): string {
  if (typeof document === "undefined") {
    return "";
  }
  const script = document.querySelector<HTMLScriptElement>("script[nonce]");
  return script?.nonce ?? "";
}
