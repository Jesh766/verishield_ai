import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, ClipboardList, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { OperationsShell } from "@/components/verishield/OperationsShell";
import { listSessions, type StoredSession } from "@/lib/verishield";

export const Route = createFileRoute("/cases")({
  head: () => ({ meta: [{ title: "VeriShield — Case Investigation" }] }),
  component: CasesPage,
});

function bandTone(band: StoredSession["risk"]["band"]) {
  if (band === "escalate") return "border-status-fail/40 bg-status-fail/10 text-status-fail";
  if (band === "review") return "border-status-warn/40 bg-status-warn/10 text-status-warn";
  return "border-status-pass/40 bg-status-pass/10 text-status-pass";
}

function CasesPage() {
  const [query, setQuery] = useState("");
  const sessions = useMemo(() => listSessions(), []);
  const visible = sessions.filter((session) => {
    const haystack =
      `${session.id} ${session.documentType} ${session.officerId} ${session.risk.headline}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <OperationsShell active="Cases" title="Case Investigation" eyebrow="Evidence-led review queue">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">
                Evidence-led review queue
              </p>
              <h2 className="mt-1 text-2xl font-bold">Investigations</h2>
              <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">
                Every reason below is taken from a recorded verification signal. No inferred fraud
                labels are added here.
              </p>
            </div>
            <label className="flex h-10 items-center gap-2 border border-outline-variant bg-surface-container px-3 text-on-surface-variant focus-within:border-primary">
              <Search className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Search investigations</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search case or signal"
                className="w-44 bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant/60"
              />
            </label>
          </div>

          {visible.length === 0 ? (
            <div className="border border-dashed border-outline-variant bg-surface-container-low p-10 text-center">
              <ClipboardList className="mx-auto h-8 w-8 text-on-surface-variant" />
              <p className="mt-3 font-semibold">No local cases match this search</p>
              <p className="mt-1 text-sm text-on-surface-variant">
                Complete a verification on the officer workstation or sync a session to HQ.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visible.map((session) => (
                <article
                  key={session.id}
                  className="border border-outline-variant bg-surface-container-low p-4 transition-colors hover:border-primary/60"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        {session.risk.band === "clear" ? (
                          <ShieldCheck className="h-4 w-4 text-status-pass" aria-hidden="true" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-status-warn" aria-hidden="true" />
                        )}
                        <h3 className="font-mono text-sm font-bold">{session.id}</h3>
                      </div>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        {session.documentType.toUpperCase()} / {session.officerId} /{" "}
                        {new Date(session.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={`border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest ${bandTone(session.risk.band)}`}
                    >
                      {session.risk.band}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant">
                        Why this was flagged
                      </p>
                      {session.risk.contributions.length === 0 ? (
                        <p className="mt-1 text-sm text-on-surface-variant">
                          No blocking anomalies were recorded.
                        </p>
                      ) : (
                        <ul className="mt-2 space-y-1 text-sm">
                          {session.risk.contributions.slice(0, 3).map((reason) => (
                            <li key={reason.source} className="flex gap-2">
                              <span className="font-mono text-primary">+{reason.points}</span>
                              <span>
                                {reason.label}
                                <span className="ml-2 text-xs text-on-surface-variant">
                                  {reason.kind}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <Link
                      to="/session/$id"
                      params={{ id: session.id }}
                      className="inline-flex h-9 items-center justify-center border border-outline-variant px-3 font-mono text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-surface-container-high"
                    >
                      Open evidence
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="border border-outline-variant bg-surface-container-low p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
            Investigation model
          </p>
          <h2 className="mt-2 text-lg font-bold">Signal, not speculation</h2>
          <div className="mt-5 space-y-4 text-sm">
            <div className="border-l-2 border-primary pl-3">
              <p className="font-semibold">Stored evidence</p>
              <p className="mt-1 text-on-surface-variant">
                OCR confidence, structural checks, integrity analysis, face similarity, and advisory
                risk contributions.
              </p>
            </div>
            <div className="border-l-2 border-status-warn pl-3">
              <p className="font-semibold">Officer decision</p>
              <p className="mt-1 text-on-surface-variant">
                The system recommends a band. The officer records the operational decision.
              </p>
            </div>
            <div className="border-l-2 border-status-pass pl-3">
              <p className="font-semibold">Authority status</p>
              <p className="mt-1 text-on-surface-variant">
                No authoritative provider is connected in this deployment.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </OperationsShell>
  );
}
