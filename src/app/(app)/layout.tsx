import { Sidebar } from "@/components/sidebar";
import { MutationProvider } from "@/components/mutation-provider";
import { SessionProvider } from "@/components/session-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <MutationProvider>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </MutationProvider>
    </SessionProvider>
  );
}
