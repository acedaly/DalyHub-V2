/**
 * PX-03 — the Help module route (Coming Soon placeholder).
 *
 * Module-owned route referenced declaratively by the Help manifest. It renders
 * the shared PX-03 "Coming Soon" scaffold. Unlike the other placeholders, Help has
 * no dedicated ROADMAP_V2 phase yet, so its copy says that honestly rather than
 * citing a phase that doesn't exist, and its "planned capabilities" list names
 * only what is already real (the TODAY-05 keyboard-shortcut reference) plus a
 * general, non-specific commitment to grow — never invented features.
 */

import { ModuleComingSoon } from "~/shared/shell/ModuleComingSoon";

export function meta() {
  return [
    { title: "Help · DalyHub" },
    { name: "description", content: "Guidance for how DalyHub works." },
  ];
}

export default function HelpRoute() {
  return (
    <ModuleComingSoon
      name="Help"
      summary="Guidance for how DalyHub works."
      fit="Help is planned to become DalyHub’s in-app guidance — how the Area → Goal → Project → Task model fits together, and a reference for every keyboard shortcut and command — so support never means leaving the app."
      roadmapStatus="Help isn’t a dedicated phase on the DalyHub V2 roadmap yet; it will grow alongside each module as it ships."
      capabilities={[
        "The keyboard-shortcut reference already shipped for Today (TODAY-05) — press “?” while on Today, or find “Keyboard shortcuts” in the Command Palette (⌘K) there",
        "Guidance for DalyHub’s Area → Goal → Project → Task model as it grows",
      ]}
    />
  );
}
