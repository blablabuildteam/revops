import { Sidebar } from "@/components/sidebar";
import { MutationProvider } from "@/components/mutation-provider";
import { SessionProvider } from "@/components/session-provider";
import { QueryCacheProvider } from "@/components/query-cache-provider";
import { prefetchAppBootstrap } from "@/lib/server-data";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const bootstrap = await prefetchAppBootstrap();

  return (
    <SessionProvider initialUser={bootstrap ? bootstrap.user : undefined}>
      <QueryCacheProvider seed={bootstrap}>
        <MutationProvider>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 min-h-0 overflow-y-auto contain-layout">
              {children}
            </main>
          </div>
        </MutationProvider>
      </QueryCacheProvider>
    </SessionProvider>
  );
}
