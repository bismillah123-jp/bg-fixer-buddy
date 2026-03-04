import { useLabels } from "@/hooks/useLabels";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface LabelSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

export function LabelSelect({ value, onValueChange, className }: LabelSelectProps) {
  const { data: labels } = useLabels();

  return (
    <Select value={value || "__none__"} onValueChange={(v) => onValueChange(v === "__none__" ? "" : v)}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Pilih label (opsional)">
          {value ? (
            <span className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: labels?.find(l => l.name === value)?.color || '#6B7280' }}
              />
              {value}
            </span>
          ) : (
            "Tanpa label"
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Tanpa label</SelectItem>
        {labels?.map((label) => (
          <SelectItem key={label.id} value={label.name}>
            <span className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: label.color }}
              />
              {label.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
