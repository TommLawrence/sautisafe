"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NativeSelectOption {
  value: string;
  label: string;
  hint?: string;
}

/** A styled native <select>. On mobile it opens the OS picker sheet
 *  (better UX than a custom popover); on desktop it renders as a clean
 *  dropdown. Fully keyboard- and screen-reader-accessible out of the box. */
export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  {
    value: string;
    onValueChange: (value: string) => void;
    options: NativeSelectOption[];
    placeholder?: string;
    id?: string;
    className?: string;
    disabled?: boolean;
    "aria-label"?: string;
  }
>(function NativeSelect(
  { value, onValueChange, options, placeholder, id, className, disabled, ...rest },
  ref,
) {
  return (
    <div className={cn("relative", className)}>
      <select
        ref={ref}
        id={id}
        value={value}
        disabled={disabled}
        aria-label={rest["aria-label"]}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn(
          "h-10 w-full appearance-none rounded-md border border-input bg-background pl-3 pr-9 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          value ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {placeholder && (
          <option value="" disabled hidden>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
            {o.hint ? ` · ${o.hint}` : ""}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
});
