/**
 * The loader an ACTION-ONLY route needs in order to fail properly.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Thirty-one routes in DalyHub are mutation endpoints: `POST /tasks/new`,
 * `POST /projects/mutate`, `POST /tasks/bulk` and so on. None declared a
 * loader, because none has anything to load — and React Router's answer to a
 * GET on such a route is a 400 carrying its own internal error object:
 *
 *     {"message":"You made a GET request to \"/tasks/new\" but did not provide
 *      a `loader` …","stack":"Error: …\n    at getInternalRouterError
 *      (/home/user/DalyHub-V2/node_modules/.pnpm/react-router@8.3.0…"}
 *
 * A person reaches that by following a shared link, by a browser prefetching a
 * form's action, or by pressing Back onto a POST. What they get is a raw stack
 * trace naming the framework version and absolute filesystem paths — an
 * unhandled-exception page dressed as an API response, which is both an
 * information leak and the least finished thing in the product.
 *
 * ── The fix ──────────────────────────────────────────────────────────────────
 * A loader that THROWS a `Response`. React Router treats a thrown Response as a
 * routing outcome rather than a crash, so the application's own error boundary
 * renders it: the owner sees DalyHub saying the address does not exist, in the
 * shell, with a way back. `405` with an `Allow` header is the honest status —
 * the URL is real, the method is not — and it is what a client library or a
 * prefetching browser should be told.
 *
 * It is deliberately not a redirect. Several of these routes accept context in
 * their body that a GET cannot reproduce, so "helpfully" sending the browser to
 * a create screen would silently discard what the request was about.
 */

/** The methods every action-only route in DalyHub accepts. */
const ALLOWED = "POST";

/**
 * Reject a GET on a mutation endpoint with 405, through the error boundary.
 *
 * Use as `export const loader = actionOnlyLoader;` on any route that declares
 * an `action` and no `loader`. `test/unit/modules/action-only-routes.test.ts`
 * asserts that every such route has one, so the next mutation endpoint cannot
 * ship without it.
 */
export function actionOnlyLoader(): never {
  throw new Response("Method Not Allowed", {
    status: 405,
    statusText: "Method Not Allowed",
    headers: { Allow: ALLOWED },
  });
}
