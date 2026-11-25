import Link from "next/link";
import { Children, cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn, initials } from "@/lib/utils";

/* ───────────────────────── Buttons ───────────────────────── */

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";
const btnVariants = {
  primary: "bg-brand-700 text-white hover:bg-brand-800 shadow-sm",
  secondary: "bg-brand-50 text-brand-800 hover:bg-brand-100",
  outline: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
  ghost: "text-slate-700 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
  "danger-outline": "border border-red-200 bg-white text-red-700 hover:bg-red-50",
  accent: "bg-accent text-ink hover:bg-accent-600 shadow-sm",
  white: "bg-white text-brand-800 hover:bg-brand-50 shadow-sm",
} as const;
const btnSizes = {
  xs: "h-7 px-2.5 text-xs rounded-lg",
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
} as const;

export type ButtonVariant = keyof typeof btnVariants;
export type ButtonSize = keyof typeof btnSizes;

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(btnBase, btnVariants[variant], btnSizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/* ───────────────────────── Cards ───────────────────────── */

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
        {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}

/* ───────────────────────── Form controls ───────────────────────── */

const control =
  "block w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:bg-slate-50";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "py-2.5 min-h-[96px]", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(control, "h-10 pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("mb-1.5 block text-sm font-medium text-slate-700", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
  htmlFor,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  // Link the label to a single named control (accessibility) by giving it a stable id.
  let control = children;
  let forId = htmlFor;
  if (!forId && label && Children.count(children) === 1 && isValidElement(children)) {
    const el = children as ReactElement<{ id?: string; name?: string }>;
    const name = el.props.name;
    if (el.props.id) forId = el.props.id;
    else if (typeof name === "string" && name) {
      forId = `f-${name.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
      control = cloneElement(el, { id: forId });
    }
  }
  return (
    <div className={className}>
      {label ? (
        <Label htmlFor={forId}>
          {label}
          {required ? <span className="ml-0.5 text-red-500">*</span> : null}
        </Label>
      ) : null}
      {control}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({
  label,
  description,
  className,
  ...props
}: ComponentProps<"input"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3", className)}>
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 rounded border-slate-300 text-brand-600 accent-brand-600 focus:ring-brand-500"
        {...props}
      />
      <span className="text-sm">
        <span className="font-medium text-slate-800">{label}</span>
        {description ? <span className="block text-slate-500">{description}</span> : null}
      </span>
    </label>
  );
}

/* ───────────────────────── Badges ───────────────────────── */

const tones = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-brand-50 text-brand-700 ring-brand-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  purple: "bg-violet-50 text-violet-700 ring-violet-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "gray", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tones[tone], className)}>
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  SUCCEEDED: "green",
  PAID: "green",
  ACTIVE: "green",
  APPROVED: "green",
  PUBLISHED: "green",
  REGISTERED: "blue",
  ATTENDED: "green",
  SENT: "green",
  PENDING: "amber",
  PAUSED: "amber",
  DRAFT: "gray",
  LOGGED: "blue",
  PAST_DUE: "red",
  FAILED: "red",
  REJECTED: "red",
  CANCELED: "gray",
  REFUNDED: "purple",
  NO_SHOW: "red",
  INACTIVE: "gray",
  SKIPPED: "gray",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const text = label ?? status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  return <Badge tone={STATUS_TONES[status] ?? "gray"}>{text}</Badge>;
}

/* ───────────────────────── Layout bits ───────────────────────── */

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumbs?.length ? (
          <nav className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            {breadcrumbs.map((b, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {b.href ? (
                  <Link href={b.href} className="hover:text-brand-700">
                    {b.label}
                  </Link>
                ) : (
                  <span>{b.label}</span>
                )}
                {i < breadcrumbs.length - 1 ? <span className="text-slate-300">/</span> : null}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon ? <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">{icon}</div> : null}
      <p className="font-medium text-slate-900">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  delta,
  hint,
  icon,
  href,
}: {
  label: string;
  value: ReactNode;
  delta?: number | null;
  hint?: ReactNode;
  icon?: ReactNode;
  href?: string;
}) {
  const body = (
    <Card className={cn("p-5", href && "transition hover:border-brand-200 hover:shadow-md")}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {icon ? <span className="text-brand-500">{icon}</span> : null}
      </div>
      <p className="mt-2 text-[26px] font-semibold tracking-tight text-slate-900">{value}</p>
      <div className="mt-1 flex items-center gap-1.5 text-xs">
        {delta !== undefined ? <Delta value={delta} /> : null}
        {hint ? <span className="text-slate-500">{hint}</span> : null}
      </div>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="font-medium text-emerald-600">New</span>;
  if (value === 0)
    return (
      <span className="inline-flex items-center gap-0.5 font-medium text-slate-500">
        <Minus className="size-3" />
        0%
      </span>
    );
  const up = value > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium", up ? "text-emerald-600" : "text-red-600")}>
      {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {Math.abs(value)}%
    </span>
  );
}

export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const palette = ["bg-brand-100 text-brand-800", "bg-amber-100 text-amber-800", "bg-emerald-100 text-emerald-800", "bg-violet-100 text-violet-800", "bg-rose-100 text-rose-800", "bg-sky-100 text-sky-800"];
  const idx = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length;
  const sz = size === "sm" ? "size-7 text-[11px]" : size === "lg" ? "size-14 text-lg" : "size-9 text-xs";
  return <span className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold", palette[idx], sz, className)}>{initials(name) || "?"}</span>;
}

export function Progress({ value, className, tone = "brand" }: { value: number; className?: string; tone?: "brand" | "accent" | "green" }) {
  const color = tone === "accent" ? "bg-accent" : tone === "green" ? "bg-emerald-500" : "bg-brand-500";
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/* ───────────────────────── Tables ───────────────────────── */

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className={cn("w-full text-left text-sm", className)} {...props} />
    </div>
  );
}
export function THead({ className, ...props }: ComponentProps<"thead">) {
  return <thead className={cn("border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500", className)} {...props} />;
}
export function TH({ className, ...props }: ComponentProps<"th">) {
  return <th className={cn("px-4 py-3 font-medium whitespace-nowrap", className)} {...props} />;
}
export function TR({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("border-b border-slate-100 last:border-0 hover:bg-slate-50/60", className)} {...props} />;
}
export function TD({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-4 py-3 align-middle text-slate-700", className)} {...props} />;
}

/* ───────────────────────── Misc ───────────────────────── */

export function Pagination({ page, pageCount, makeHref }: { page: number; pageCount: number; makeHref: (p: number) => string }) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
      <span className="text-slate-500">
        Page {page} of {pageCount}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <LinkButton variant="outline" size="sm" href={makeHref(page - 1)}>
            Previous
          </LinkButton>
        ) : null}
        {page < pageCount ? (
          <LinkButton variant="outline" size="sm" href={makeHref(page + 1)}>
            Next
          </LinkButton>
        ) : null}
      </div>
    </div>
  );
}

export function DescriptionList({ items, className }: { items: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2", className)}>
      {items.map((it) => (
        <div key={it.label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{it.label}</dt>
          <dd className="mt-1 text-sm text-slate-900">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Notice({ tone = "blue", children, className }: { tone?: "blue" | "amber" | "green" | "red"; children: ReactNode; className?: string }) {
  const map = {
    blue: "bg-brand-50 text-brand-800 border-brand-100",
    amber: "bg-amber-50 text-amber-900 border-amber-200",
    green: "bg-emerald-50 text-emerald-800 border-emerald-200",
    red: "bg-red-50 text-red-800 border-red-200",
  };
  return <div className={cn("rounded-xl border px-4 py-3 text-sm", map[tone], className)}>{children}</div>;
}
