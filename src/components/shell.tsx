import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function Shell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div
        className="min-h-screen"
        style={{ marginLeft: "var(--sidebar-width)" }}
      >
        <Topbar title={title} />
        <main className="px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
