import { Link } from "@tanstack/react-router";
import {
  Activity,
  ClipboardList,
  Cpu,
  FileSearch,
  LayoutDashboard,
  Shield,
  Wifi,
} from "lucide-react";
import type { ReactNode } from "react";

const navigation = [
  { to: "/", label: "Verify", icon: Shield },
  { to: "/cases", label: "Cases", icon: ClipboardList },
  { to: "/intelligence", label: "Intelligence", icon: FileSearch },
  { to: "/admin", label: "Command Center", icon: LayoutDashboard },
  { to: "/history", label: "Audit", icon: Activity },
  { to: "/devices", label: "Devices", icon: Cpu },
] as const;

export function OperationsShell({
  children,
  active,
  title,
  eyebrow = "Identity security operations",
  officer,
  state = "LOCAL VERIFICATION ACTIVE",
}: {
  children: ReactNode;
  active: (typeof navigation)[number]["label"];
  title: string;
  eyebrow?: string;
  officer?: { badge: string; checkpoint: string } | null;
  state?: string;
}) {
  return (
    <div className="ops-shell min-h-dvh text-on-surface">
      <div className="mx-auto flex min-h-dvh max-w-[1680px]">
        <aside className="hidden w-64 shrink-0 border-r border-outline-variant bg-surface-container-lowest px-4 py-6 lg:flex lg:flex-col">
          <Link to="/" className="mb-10 flex items-center gap-3 px-3">
            <span className="grid h-9 w-9 place-items-center border border-primary/50 bg-primary/10 text-primary">
              <Shield className="h-5 w-5" />
            </span>
            <span>
              <strong className="block text-sm tracking-[0.18em]">VERISHIELD</strong>
              <span className="ops-label mt-1 block">Identity trust platform</span>
            </span>
          </Link>
          <p className="ops-label px-3">Workspace</p>
          <nav className="mt-3 space-y-1" aria-label="Primary navigation">
            {navigation.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 border-l-2 px-3 py-3 text-sm transition-colors ${active === label ? "border-primary bg-primary/10 font-semibold text-primary" : "border-transparent text-on-surface-variant hover:bg-surface-container hover:text-on-surface"}`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto border-t border-outline-variant pt-4">
            <div className="flex items-center gap-2 text-status-pass">
              <Wifi className="h-4 w-4" />
              <span className="ops-label text-status-pass">{state}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">
              Authority gateway: <span className="text-status-warn">not configured</span>
            </p>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-outline-variant bg-background/95 px-4 backdrop-blur md:px-8">
            <div className="flex items-center gap-3 lg:hidden">
              <Shield className="h-5 w-5 text-primary" />
              <span className="text-sm font-bold tracking-[0.14em]">VERISHIELD</span>
            </div>
            <div className="hidden min-w-0 lg:block">
              <p className="ops-label">{eyebrow}</p>
              <h1 className="truncate text-lg font-bold">{title}</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden items-center gap-2 border border-status-pass/30 bg-status-pass/10 px-3 py-2 font-mono text-[10px] font-bold tracking-widest text-status-pass sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-status-pass" />
                {state}
              </span>
              {officer && (
                <span className="hidden font-mono text-[10px] text-on-surface-variant md:block">
                  {officer.badge} / {officer.checkpoint}
                </span>
              )}
              <Link to="/" className="text-xs font-semibold text-primary hover:underline">
                New verification
              </Link>
            </div>
          </header>
          <main className="ops-grid min-h-[calc(100dvh-4rem)] px-4 py-5 pb-24 md:px-8 md:py-8">
            {children}
          </main>
          <nav
            className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-6 border-t border-outline-variant bg-surface-container-lowest/95 py-2 backdrop-blur lg:hidden"
            aria-label="Mobile navigation"
          >
            {navigation.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={`flex min-h-12 flex-col items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wider ${active === label ? "text-primary" : "text-on-surface-variant"}`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
