"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, CameraOff, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { checkInByCode, undoCheckIn, type ScanResult } from "@/app/admin/check-in/actions";
import { cn } from "@/lib/utils";

// Minimal typing for the (Chromium / Safari 17+) BarcodeDetector API
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => { detect: (src: CanvasImageSource) => Promise<DetectedBarcode[]> };

export function QrScanner({ eventId }: { eventId: string }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const busyRef = useRef(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  const submit = useCallback(
    (raw: string) => {
      const c = raw.trim();
      if (!c) return;
      const now = Date.now();
      if (lastRef.current.code === c && now - lastRef.current.at < 3500) return; // ignore repeat frames
      lastRef.current = { code: c, at: now };
      busyRef.current = true;
      startTransition(async () => {
        const res = await checkInByCode(eventId, c);
        setResult(res);
        busyRef.current = false;
        if (res.status === "ok") {
          setCode("");
          if (navigator.vibrate) navigator.vibrate(80);
        }
        router.refresh();
      });
    },
    [eventId, router],
  );

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector;
        const detector = new Detector({ formats: ["qr_code"] });
        const tick = async () => {
          if (cancelled) return;
          if (!busyRef.current && video.readyState >= 2) {
            try {
              const codes = await detector.detect(video);
              if (codes[0]?.rawValue) submit(codes[0].rawValue);
            } catch {
              /* frame not ready */
            }
          }
          timer = setTimeout(tick, 250);
        };
        tick();
      } catch (e) {
        setCamError(e instanceof Error && e.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access or type the code below." : "Couldn't start the camera. Type the code below instead.");
        setScanning(false);
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [scanning, submit]);

  const tone =
    result?.status === "ok"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : result?.status === "already"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-red-300 bg-red-50 text-red-900";

  return (
    <div className="space-y-4">
      {/* Camera */}
      {supported ? (
        <div>
          {scanning ? (
            <div className="relative overflow-hidden rounded-2xl bg-black">
              <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover" />
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="size-52 rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,.35)]" />
              </div>
              <button type="button" onClick={stop} className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium text-slate-800">
                <CameraOff className="size-4" /> Stop
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setCamError(null);
                setScanning(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-700 px-4 py-4 text-base font-semibold text-white shadow-sm hover:bg-brand-800"
            >
              <Camera className="size-5" /> Scan ticket QR code
            </button>
          )}
        </div>
      ) : supported === false ? (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">QR scanning with the camera isn&apos;t supported in this browser (try Chrome on Android or Safari on iOS 17+). Type the ticket code instead.</p>
      ) : null}
      {camError ? <p className="text-sm text-red-600">{camError}</p> : null}

      {/* Manual entry */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          lastRef.current = { code: "", at: 0 };
          submit(code);
        }}
        className="flex gap-2"
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Ticket code, e.g. K7M2QX9A"
          autoCapitalize="characters"
          autoComplete="off"
          className="h-12 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 font-mono text-base tracking-widest shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
        />
        <button type="submit" disabled={pending || !code.trim()} className="h-12 shrink-0 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-40">
          {pending ? <Loader2 className="size-4 animate-spin" /> : "Check in"}
        </button>
      </form>

      {/* Result */}
      {result ? (
        <div className={cn("flex items-start gap-3 rounded-2xl border-2 p-4", tone)} role="status" aria-live="polite">
          {result.status === "ok" ? (
            <CheckCircle2 className="mt-0.5 size-7 shrink-0 text-emerald-600" />
          ) : result.status === "already" ? (
            <AlertTriangle className="mt-0.5 size-7 shrink-0 text-amber-600" />
          ) : (
            <XCircle className="mt-0.5 size-7 shrink-0 text-red-600" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">
              {result.status === "ok" && `Welcome, ${result.name}!`}
              {result.status === "already" && `${result.name} is already checked in`}
              {result.status === "not_found" && "Ticket not found"}
              {result.status === "wrong_event" && "Ticket is for a different event"}
              {result.status === "unpaid" && "Order not paid"}
            </p>
            <p className="text-sm opacity-80">
              {result.status === "ok" && result.ticket}
              {result.status === "already" && result.checkedInAt && `Checked in at ${new Date(result.checkedInAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${result.ticket}`}
              {result.status === "not_found" && "Double-check the code, or search by name below."}
              {result.status === "wrong_event" && `${result.name} — ${result.eventTitle}`}
              {result.status === "unpaid" && `${result.name}'s order is still pending. Take payment, then mark it paid in Orders.`}
            </p>
          </div>
          {result.status === "ok" && result.attendeeId ? (
            <button
              type="button"
              onClick={() =>
                startTransition(async () => {
                  await undoCheckIn(result.attendeeId!);
                  setResult(null);
                  router.refresh();
                })
              }
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium underline"
            >
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
