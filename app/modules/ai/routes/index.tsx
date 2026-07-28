/**
 * PX-03 — the AI module route (Coming Soon placeholder).
 *
 * Module-owned route referenced declaratively by the AI manifest. It renders the
 * shared PX-03 "Coming Soon" scaffold only; the AI proposal engine is a later
 * roadmap item (AI-01 → AI-04). No entity type — AI has no `entityType` prop, so
 * the Pane Header and sidebar both fall back to the generic glyph, the same as
 * Today.
 */

import { ModuleComingSoon } from "~/shared/shell/ModuleComingSoon";

export function meta() {
  return [
    { title: "AI · DalyHub" },
    {
      name: "description",
      content: "A propose → review → apply loop over your real data.",
    },
  ];
}

export default function AiRoute() {
  return (
    <ModuleComingSoon
      name="AI"
      summary="A propose → review → apply loop over your real data."
      fit="AI in DalyHub is a proposer, never an autonomous actor — it reads the same Areas, Goals, Projects, Tasks and links every human action touches and emits structured, reviewable proposals you accept, edit or reject; nothing is written to your data without your approval."
      roadmapStatus="It’s planned for Phase 11 — AI (AI-01 → AI-04) of the DalyHub V2 roadmap."
      capabilities={[
        "A propose → review → apply loop that never mutates your data without approval",
        "Meeting notes turned into reviewable task and note proposals",
        "Reviewable daily and weekly planning and review-summary proposals grounded in real system state",
        "Per-action privacy controls for sensitive data like People and Diary",
      ]}
    />
  );
}
