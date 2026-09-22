import { ShieldCheck } from "lucide-react";

export function WorkingStage({ status }: { status: string }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-background p-6">
      <div className="flex flex-col items-center gap-6 max-w-md text-center transition-all duration-300 animate-in fade-in-50">
        <div className="relative flex items-center justify-center">
          <div
            className="w-20 h-20 rounded-full border-4 border-primary-container border-t-transparent spin"
            style={{ boxShadow: "0 0 25px rgba(245,158,11,0.3)" }}
          />
          <ShieldCheck className="absolute h-8 w-8 text-primary animate-pulse" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-on-surface">Local Security Engine Active</h2>
          <div className="mt-3 text-sm text-on-surface font-mono min-h-[28px] bg-surface-container px-4 py-2 rounded-lg border border-outline-variant/60 flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
            <span>{status || "Processing on this device…"}</span>
          </div>
        </div>
        <p className="font-mono text-[10px] text-on-surface-variant/60 tracking-widest uppercase">
          Local-first execution · No raw data leaves this device
        </p>
      </div>
    </div>
  );
}
