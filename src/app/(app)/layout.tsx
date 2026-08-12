import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { MutationProvider } from "@/components/mutation-provider";
import { SessionProvider } from "@/components/session-provider";
import { QueryCacheSeed } from "@/components/query-cache-provider";
import { prefetchListData, prefetchSession } from "@/lib/server-data";

/**
 * Streams the shared list data into the client cache after the shell renders.
 * Kept out of the main tree so the sidebar paints without waiting on Postgres.
 */
async function ListDataSeed() {
  const data = await prefetchListData();
  if (!data) return null;
  return <QueryCacheSeed seed={data} />;
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await prefetchSession();

  return (
    <SessionProvider initialUser={user}>
      <Suspense fallback={null}>
        <ListDataSeed />
      </Suspense>
      <MutationProvider>
        <AppShell>{children}</AppShell>
      </MutationProvider>
    </SessionProvider>
  );
}
