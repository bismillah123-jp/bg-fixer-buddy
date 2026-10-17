import { cn } from "@/lib/utils";

export const KELENGKAPAN_OPTIONS = ["Hp Only", "Fullset", "Hp Ces"] as const;

interface KelengkapanSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

/** Pilihan kelengkapan HP second: Hp Only / Fullset / Hp Ces (chips, toggle). */
export function KelengkapanSelect({ value, onValueChange, className }: KelengkapanSelectProps) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {KELENGKAPAN_OPTIONS.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onValueChange(active ? "" : opt)}
            className={cn(
              "px-3 h-8 rounded-full text-xs font-semibold border transition-all active:scale-95",
              active
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
