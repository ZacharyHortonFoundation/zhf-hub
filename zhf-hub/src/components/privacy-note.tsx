import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Short privacy notice for public forms. ZHF Hub is not a system for health information,
 * so we ask people not to share it and link to ZHF's privacy policy.
 */
export function PrivacyNote({ url, purpose, className }: { url?: string | null; purpose: string; className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 text-xs leading-relaxed text-slate-500", className)}>
      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand-500" />
      <span>
        We use your information only {purpose} and never sell or share it. Please don&apos;t include health, medical or recovery details in your answers.
        {url ? (
          <>
            {" "}
            <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 underline-offset-2 hover:underline">
              Privacy policy
            </a>
          </>
        ) : null}
      </span>
    </p>
  );
}
