/**
 * ASSET-03 — Quick Capture: Asset.
 *
 * The panel is deliberately THIN. Every other capture panel asks for the least
 * that can work and then hands off to the module's fuller creation surface;
 * Assets does not need that split, because the canonical New Asset form ALREADY
 * asks for the least that can work — a name and a type — and reveals the rest
 * progressively. So capture composes that exact component (`NewAssetForm`,
 * posting to `/assets/create` → `AssetRepository.create`) rather than
 * re-implementing a second, thinner Asset form that would immediately drift from
 * the real one. There is no capture-only Asset model, validator or create path.
 *
 * It owns only the things the sheet needs and the form does not have:
 *   - the shared post-capture confirmation (Done · Open asset · Add another);
 *   - remounting the form for "Add another", which is how a `useForm` host is
 *     cleared, and returning focus to Name afterwards.
 *
 * It lives in the module, not in `app/shared/capture`, because it is Assets'
 * creation surface; the shared sheet reaches it through a LAZY import, so the
 * shell never statically depends on a module and no Asset form enters the
 * initial bundle.
 */

import { useCallback, useEffect, useState } from "react";

import {
  CaptureResult,
  type CapturePanelProps,
  type CaptureSuccess,
} from "~/shared/capture";

import { NewAssetForm } from "./NewAssetForm";

export default function AssetCapturePanel({
  firstFieldRef,
  onClose,
}: CapturePanelProps) {
  const [success, setSuccess] = useState<CaptureSuccess | null>(null);
  /** Bumped by "Add another": a new key remounts the form, clearing its state. */
  const [formKey, setFormKey] = useState(0);

  /*
   * Focus Name once this panel has actually arrived.
   *
   * The sheet moves focus to `firstFieldRef` a frame after a type becomes
   * active. Every other panel is bundled with the sheet, so by that frame its
   * first field exists — but this one is LAZY, and on the load frame the ref is
   * still null, leaving focus on the sheet's Close button. The panel therefore
   * claims focus itself when it mounts, which is the only moment at which the
   * field is guaranteed to exist.
   */
  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      firstFieldRef.current?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [firstFieldRef]);

  const addAnother = useCallback(() => {
    setSuccess(null);
    setFormKey((key) => key + 1);
    // A frame lets the remounted form attach its Name control to the ref.
    window.requestAnimationFrame(() => firstFieldRef.current?.focus());
  }, [firstFieldRef]);

  if (success) {
    return (
      <CaptureResult
        success={success}
        onAddAnother={addAnother}
        onDone={onClose}
      />
    );
  }

  return (
    <NewAssetForm
      key={formKey}
      surface="sheet"
      firstFieldRef={firstFieldRef}
      onCreated={(assetId) =>
        setSuccess({
          id: assetId,
          href: `/asset/${encodeURIComponent(assetId)}`,
          openLabel: "Open asset",
          message: "Asset created.",
        })
      }
    />
  );
}
