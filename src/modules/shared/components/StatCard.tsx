import type { LucideIcon } from "lucide-react";

const ACCENTS: Record<string, string> = {
  navy: "bg-navy/10 text-navy",
  teal: "bg-teal/10 text-teal",
  medical: "bg-medical/10 text-medical",
  danger: "bg-danger-bg text-danger",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
};

export default function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "navy",
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  accent?: "navy" | "teal" | "medical" | "danger" | "success" | "warning";
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">
            {label}
          </p>
          <p className="mt-1.5 text-[22px] leading-7 font-semibold tracking-tight text-navy">
            {value}
          </p>
        </div>
        {Icon ? (
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ACCENTS[accent]}`}
            aria-hidden
          >
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      {hint ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
