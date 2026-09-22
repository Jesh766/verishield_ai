export function OfflineBanner({
  online,
  queued,
  onRetry,
}: {
  online: boolean;
  queued: number;
  onRetry: () => void;
}) {
  if (online && queued === 0) {
    return (
      <div
        aria-live="polite"
        className="flex items-center gap-2 rounded-lg border border-field-line bg-field-surface-raised px-3 py-2 text-xs text-field-ink-dim"
      >
        <span className="h-2 w-2 rounded-full bg-verdict-pass" aria-hidden="true" />
        Field Mode online — verification engine running on this device. No cloud call.
      </div>
    );
  }
  return (
    <div
      aria-live="assertive"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-verdict-warn/50 bg-verdict-warn-soft/60 px-3 py-2 text-xs text-verdict-warn"
    >
      <span className="h-2 w-2 rounded-full bg-verdict-warn" aria-hidden="true" />
      <span className="font-semibold">
        {online ? "Reconnected" : "Offline — no signal at this checkpoint"}
      </span>
      <span className="text-field-ink-dim">
        {queued > 0
          ? `${queued} capture${queued > 1 ? "s" : ""} queued on device.`
          : "Captures will be queued and processed on this device."}
      </span>
      {queued > 0 && (
        <button
          type="button"
          onClick={onRetry}
          aria-label="Process queued verification captures"
          className="ml-auto rounded-md border border-current px-2 py-1 font-semibold"
        >
          Process queue
        </button>
      )}
    </div>
  );
}
