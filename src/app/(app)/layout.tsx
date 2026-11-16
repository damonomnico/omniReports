import { Sidebar } from "@/components/shell/sidebar";
import { listAccessibleClients } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/guards";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const clients = await listAccessibleClients(user);

  return (
    <div className="min-h-screen">
      <Sidebar
        user={{ name: user.name, email: user.email, role: user.role }}
        clients={clients.map((c) => ({
          id: c.id,
          name: c.name,
          domain: c.domain,
          isDemo: c.isDemo,
        }))}
      />
      <div className="lg:pl-64">
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
