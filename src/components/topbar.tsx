export function Topbar({ title = "Overview" }: { title?: string }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-topbar/95 px-6 backdrop-blur">
      <div>
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Accura Watch
        </p>
        <h1 className="text-sm font-medium text-foreground">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">
          mock data
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          live shell
        </span>
      </div>
    </header>
  );
}
