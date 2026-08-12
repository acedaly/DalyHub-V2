/**
 * The DalyHub secrets kernel — authenticated encryption at rest for the small
 * number of owner-configured third-party credentials that must stay USABLE.
 *
 * Introduced by CAL-01 for external calendar feed URLs. Deliberately a kernel
 * primitive rather than Calendar code: the next credential of this shape (a
 * webhook endpoint, an inbound feed token) must reuse it rather than acquire a
 * second crypto implementation. See `sealed-secret.ts` for the full rationale
 * and `docs/development/DEPLOYMENT.md` for how the key is configured.
 */

export {
  EncryptionKeyUnavailableError,
  SealedSecretError,
  fingerprintSecret,
  importEncryptionKey,
  openSecret,
  sealSecret,
} from "./sealed-secret";
