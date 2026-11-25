/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

/** Official ZHF logo (public/brand/zhf-logo.png — 500×171, transparent PNG). */
export const LOGO_SRC = "/brand/zhf-logo.png";

/**
 * - default: full-colour logo for light backgrounds
 * - light:   white version for navy backgrounds (sidebar, footer, login panel)
 * - compact: just the tree mark (left part of the logo) for tight spaces
 */
export function Logo({ className, light = false, compact = false }: { className?: string; light?: boolean; compact?: boolean }) {
  if (compact) {
    return (
      <span className={cn("inline-block h-9 w-9 overflow-hidden", className)}>
        <img src={LOGO_SRC} alt="Zachary Horton Foundation" className={cn("h-full w-auto max-w-none object-left", light && "brightness-0 invert")} />
      </span>
    );
  }
  return (
    <img
      src={LOGO_SRC}
      alt="Zachary Horton Foundation"
      width={500}
      height={171}
      // object-contain keeps the proportions even if a flex/grid parent stretches the box
      className={cn("h-11 w-auto max-w-full object-contain object-left", light && "brightness-0 invert", className)}
    />
  );
}
