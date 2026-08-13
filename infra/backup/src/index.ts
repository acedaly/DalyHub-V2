/**
 * BACKUP-01 — entrypoint for `dalyhub-v2-backup`.
 *
 * This Worker has NO application role. It does not serve DalyHub traffic, does
 * not share the main Worker's routes, bindings, Access policy or Cron Trigger,
 * and exists only so the production backup Workflow has somewhere to live. It is
 * deployed with `workers_dev: false`, no route and no custom domain, so nothing
 * on the public internet can reach the `fetch` handler below.
 *
 * The handler exists at all because a module Worker needs a default export, and
 * because a Worker that is *supposed* to be unreachable should say so plainly if
 * it ever is reached — a silent 200 would make an accidental route-binding
 * invisible. It returns 404 and nothing else: no version, no configuration, no
 * bucket contents, and above all no way to trigger a backup. Manual runs go
 * through `wrangler workflows trigger`, which is authenticated by the operator's
 * own Cloudflare credentials rather than by an HTTP endpoint this Worker would
 * have to protect.
 */

export { ProductionBackupWorkflow } from "./backup-workflow";

export default {
  fetch(): Response {
    return new Response("Not found.\n", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
