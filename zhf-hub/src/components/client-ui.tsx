"use client";

import { startTransition, useEffect, useState, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, X, AlertCircle } from "lucide-react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./ui";
import { cn } from "@/lib/utils";

/**
 * Copies a submit button's name/value into a hidden field of its form.
 * Form actions here don't reliably include the clicked button's value in the FormData,
 * so buttons like Approve / Decline (name="decision") must go through this.
 */
export function stampSubmitter(btn: HTMLButtonElement, name?: string, value?: unknown) {
  const form = btn.form;
  if (!form) return;
  // clear stamps left by an earlier click (e.g. "Save & add another" then "Save")
  form.querySelectorAll("input[data-submitter]").forEach((el) => el.remove());
  if (!name) return;
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = name;
  input.dataset.submitter = name;
  input.value = value === undefined || value === null ? "" : String(value);
  form.appendChild(input);
}

/**
 * onSubmit handler for multi-step public forms that use useActionState.
 * React auto-resets a <form action={fn}> after every submission — including ones that come
 * back with validation errors — which wipes what the person typed. Submitting through
 * onSubmit + startTransition keeps their input intact.
 */
export function submitNoReset(dispatch: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    let fd: FormData;
    try {
      fd = submitter ? new FormData(e.currentTarget, submitter) : new FormData(e.currentTarget);
    } catch {
      fd = new FormData(e.currentTarget);
    }
    startTransition(() => dispatch(fd));
  };
}

/** Submit button that shows a spinner while its parent <form> action is pending. */
export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "md",
  className,
  name,
  value,
  onClick,
  pending: pendingProp,
  ...props
}: ComponentProps<"button"> & { pendingText?: string; variant?: ButtonVariant; size?: ButtonSize; pending?: boolean }) {
  const status = useFormStatus();
  const pending = status.pending || Boolean(pendingProp);
  return (
    <button
      type="submit"
      disabled={pending || props.disabled}
      className={buttonClass(variant, size, className)}
      onClick={(e) => {
        stampSubmitter(e.currentTarget, name, value);
        onClick?.(e);
      }}
      {...props}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

/**
 * Two-step destructive submit: first click arms it ("Click again to confirm"),
 * second click submits. Avoids blocking browser confirm() dialogs.
 */
export function ConfirmSubmit({
  children,
  confirmText = "Click again to confirm",
  variant = "danger-outline",
  size = "sm",
  className,
  formAction,
}: {
  children: ReactNode;
  confirmText?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  formAction?: ComponentProps<"button">["formAction"];
}) {
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type={armed ? "submit" : "button"}
      formAction={armed ? formAction : undefined}
      onClick={(e) => {
        if (!armed) {
          e.preventDefault();
          setArmed(true);
        }
      }}
      disabled={pending}
      className={buttonClass(armed ? "danger" : variant, size, className)}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {armed ? confirmText : children}
    </button>
  );
}

/**
 * Shows a toast for ?ok=... or ?err=... in the URL (set by server actions on redirect),
 * then strips the param so a refresh doesn't show it again.
 */
export function FlashToast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const ok = params.get("ok");
  const err = params.get("err");
  const [visible, setVisible] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!ok && !err) return;
    setVisible(ok ? { tone: "ok", text: ok } : { tone: "err", text: err! });
    const next = new URLSearchParams(params.toString());
    next.delete("ok");
    next.delete("err");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    const t = setTimeout(() => setVisible(null), 4500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok, err]);

  if (!visible) return null;
  return (
    <div className="no-print fixed bottom-5 right-5 z-50 animate-[fadeIn_.2s_ease-out]">
      <div
        className={cn(
          "flex max-w-sm items-start gap-3 rounded-xl border bg-white px-4 py-3 text-sm shadow-lg",
          visible.tone === "ok" ? "border-emerald-200" : "border-red-200",
        )}
        role="status"
      >
        {visible.tone === "ok" ? <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" /> : <AlertCircle className="mt-0.5 size-4 text-red-600" />}
        <span className="text-slate-800">{visible.text}</span>
        <button onClick={() => setVisible(null)} className="ml-2 text-slate-400 hover:text-slate-600" aria-label="Dismiss">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** Auto-submits its parent GET form when a select / checkbox changes (filters). */
export function AutoSubmitSelect(props: ComponentProps<"select">) {
  return (
    <select
      {...props}
      onChange={(e) => {
        props.onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
      className={cn(
        "block h-10 rounded-xl border border-slate-300 bg-white px-3 pr-8 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100",
        props.className,
      )}
    />
  );
}

export function PrintButton({ children = "Print", className }: { children?: ReactNode; className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("outline", "md", cn("no-print", className))}>
      {children}
    </button>
  );
}

export function CopyButton({ text, children = "Copy", className }: { text: string; children?: ReactNode; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className={buttonClass("outline", "sm", className)}
    >
      {done ? "Copied!" : children}
    </button>
  );
}
