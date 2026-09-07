import { Suspense } from "react";
import { MapCrm } from "@/components/map/MapCrm";

export const dynamic = "force-dynamic";

/** Map CRM landing page. */
export default function HomePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-[var(--muted)]">Loading map...</div>}>
      <MapCrm />
    </Suspense>
  );
}
