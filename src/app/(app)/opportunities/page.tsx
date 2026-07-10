import { Suspense } from "react";
import OpportunitiesPageClient from "./opportunities-client";

function OpportunitiesLoading() {
  return (
    <div className="p-8 space-y-6">
      <div className="h-8 w-48 bg-neutral-900 rounded animate-pulse" />
      <div className="h-4 w-72 bg-neutral-900 rounded animate-pulse" />
      <div className="border border-neutral-800 rounded-lg overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 border-b border-neutral-800 bg-neutral-900/40 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default function OpportunitiesPage() {
  return (
    <Suspense fallback={<OpportunitiesLoading />}>
      <OpportunitiesPageClient />
    </Suspense>
  );
}
