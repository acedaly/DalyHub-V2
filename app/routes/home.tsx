import { FoundationPage } from "../components/foundation-page";

export function meta() {
  return [
    { title: "DalyHub" },
    {
      name: "description",
      content: "DalyHub V2 — repository and toolchain foundation.",
    },
  ];
}

export default function Home() {
  return <FoundationPage />;
}
