import { Sidebar, type SidebarSite } from "./sidebar";
import { Topbar } from "./topbar";

export function Shell({
  children,
  title,
  userEmail,
  sites,
  lastSync,
}: {
  children: React.ReactNode;
  title?: string;
  userEmail: string;
  sites: SidebarSite[];
  lastSync?: Date | null;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar userEmail={userEmail} sites={sites} />
      <div
        className="min-h-screen"
        style={{ marginLeft: "var(--sidebar-width)" }}
      >
        <Topbar title={title} lastSync={lastSync ?? null} />
        <main className="px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
