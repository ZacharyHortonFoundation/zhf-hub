import { Award, Medal } from "lucide-react";
import { TIER_STYLES } from "@/lib/volunteers";
import { cn } from "@/lib/utils";

/** Circular badge "medal" used on the volunteer portal and the admin volunteer panel. */
export function BadgeMedal({
  name,
  tier,
  kind,
  earned = true,
  progress,
  size = "md",
}: {
  name: string;
  tier: string;
  kind: string;
  earned?: boolean;
  progress?: number; // 0–100 for unearned hour badges
  size?: "sm" | "md";
}) {
  const t = TIER_STYLES[tier] ?? TIER_STYLES.BRONZE!;
  const short = name.replace(/^(Bronze|Silver|Gold)\s*[–-]\s*/i, "");
  return (
    <div className={cn("flex flex-col items-center text-center", size === "sm" ? "w-20" : "w-24")}>
      <span
        className={cn(
          "grid place-items-center rounded-full ring-4",
          size === "sm" ? "size-12" : "size-16",
          earned ? cn(t.bg, t.ring, t.text, "shadow-sm") : "bg-slate-100 text-slate-300 ring-slate-100",
        )}
        title={name}
      >
        {kind === "HOURS" ? <Medal className={size === "sm" ? "size-5" : "size-7"} /> : <Award className={size === "sm" ? "size-5" : "size-7"} />}
      </span>
      <p className={cn("mt-2 text-xs font-medium leading-tight", earned ? "text-slate-800" : "text-slate-400")}>{short}</p>
      <p className={cn("text-[10px] uppercase tracking-wide", earned ? "text-slate-500" : "text-slate-300")}>{t.label}</p>
      {!earned && progress !== undefined ? (
        <div className="mt-1 h-1 w-14 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-brand-400" style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
      ) : null}
    </div>
  );
}
