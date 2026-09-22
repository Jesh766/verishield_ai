/** Live in-app camera. The stream stays local; a single frame is grabbed to a Blob. */

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  facing: "environment" | "user";
  title: string;
  hint: string;
  onCapture: (blob: Blob) => void;
  onClose: () => void;
};

export function CameraCapture({ facing, title, hint, onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setReady(true);
      } catch {
        setError(
          "This device would not open the camera. Allow camera access in the browser, or use Upload instead.",
        );
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  const shoot = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        onCapture(blob);
      },
      "image/jpeg",
      0.95,
    );
  }, [onCapture]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-field-deep/98 backdrop-blur">
      <header className="flex items-center justify-between px-4 pt-5">
        <div>
          <p className="font-display text-sm font-bold text-field-ink">{title}</p>
          <p className="text-[11px] text-field-ink-dim">{hint}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close camera capture"
          className="rounded-full border border-field-line px-3 py-1.5 text-xs text-field-ink-dim"
        >
          Close
        </button>
      </header>

      <div className="relative mx-4 mt-4 flex-1 overflow-hidden rounded-lg border border-field-line bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-label="Live camera feed for document capture"
          className={`h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
        />
        {!error && (
          <div className="pointer-events-none absolute inset-6 rounded border-2 border-dashed border-field-accent/60" />
        )}
        {error && (
          <p aria-live="assertive" className="absolute inset-0 grid place-items-center px-8 text-center text-xs leading-relaxed text-verdict-fail">
            {error}
          </p>
        )}
      </div>

      <div className="px-4 pb-8 pt-5">
        <button
          type="button"
          onClick={shoot}
          disabled={!ready || !!error}
          aria-label={ready ? "Capture frame from camera" : "Starting camera"}
          aria-live="polite"
          className="w-full rounded-lg bg-field-accent px-4 py-4 font-display text-base font-bold text-field-deep disabled:opacity-40"
        >
          {ready ? "Capture frame" : "Starting camera…"}
        </button>
      </div>
    </div>
  );
}
