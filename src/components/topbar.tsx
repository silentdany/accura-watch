export function Topbar({ title = "Overview" }: { title?: string }) {
  const lastSync = new Date().toLocaleString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-border bg-topbar px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-medium text-foreground">{title}</h1>
        <span className="hidden text-[11px] text-muted-foreground sm:inline">
          Accura Watch
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] text-muted-foreground">
          Last sync {lastSync}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          live
        </span>
      </div>
    </header>
  );
}
