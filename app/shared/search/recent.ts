/**
 * The RETIRED client-side "recent searches" list — reduced to the one thing
 * that still has a job (FIND-01).
 *
 * ── What used to be here, and why it is gone ────────────────────────────────
 * Until FIND-01, Search's empty state offered a list built in the BROWSER: the
 * results the owner had activated from inside Search, kept in `localStorage`
 * under the key below, with a bespoke encoder, a bespoke decoder, a bespoke
 * sensitive-subtitle rule and a "Clear" button. It could not answer the question
 * the empty query actually asks, for reasons no amount of polish would fix:
 *
 *   - it was **empty on first use**, on a new device, in a new browser profile
 *     and after clearing site data — which is precisely when a shell that
 *     answers before you type is most valuable;
 *   - it knew only what the owner had opened **through Search**, so a record
 *     they had spent the morning editing was absent unless they had also
 *     searched for it;
 *   - it was per-BROWSER, not per-workspace, so it was not workspace-scoped in
 *     any sense the product's isolation boundary (ADR-003) recognises.
 *
 * [DEBT-195] was open the whole time it existed, which is the evidence that it
 * did not close it. The empty query is now answered by the server from the
 * workspace's own Activity history — see `~/kernel/recent-records` for the rule
 * and `recent-outcome.ts` for its presentation.
 *
 * ── Why the key survives its feature ────────────────────────────────────────
 * Owners who used a build before this one still have that data in their
 * browser. Nothing writes the key any more, but SET-03's local-data model has to
 * be able to NAME every key it clears rather than sweeping a prefix, so signing
 * out still purges it. Deleting the constant would strand that data in the
 * browser of every owner who had it — a silent, permanent residue of a feature
 * that no longer exists.
 *
 * When enough time has passed that no browser plausibly still holds it, this
 * file and its entry in `local-data.ts` go together.
 */

/**
 * The key the retired client-side recent-search list was stored under.
 *
 * Read by `~/shared/account-security/local-data` so sign-out clears it. Written
 * by nothing.
 */
export const RECENT_SEARCH_STORAGE_KEY = "dalyhub.search.recent.v1";
