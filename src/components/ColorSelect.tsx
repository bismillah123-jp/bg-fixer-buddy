import { usePhoneColors } from "@/hooks/usePhoneColors";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ColorSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export function ColorSelect({ value, onValueChange, className, placeholder = "Pilih warna" }: ColorSelectProps) {
  const { data: colors } = usePhoneColors();

  const selectedColor = colors?.find(c => c.name === value);

  return (
    <Select value={value || "__none__"} onValueChange={(v) => onValueChange(v === "__none__" ? "" : v)}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder}>
          {value && selectedColor ? (
            <span className="flex items-center gap-1.5">
              <span
                className="h-3 w-3 rounded-full shrink-0 border border-border"
                style={{ backgroundColor: selectedColor.hex_color }}
              />
              {value}
            </span>
          ) : value ? (
            <span>{value}</span>
          ) : (
            placeholder
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">{placeholder}</SelectItem>
        {colors?.map((color) => (
          <SelectItem key={color.id} value={color.name}>
            <span className="flex items-center gap-1.5">
              <span
                className="h-3 w-3 rounded-full shrink-0 border border-border"
                style={{ backgroundColor: color.hex_color }}
              />
              {color.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
