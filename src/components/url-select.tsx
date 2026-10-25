"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ALL = "__all__";

/** A select whose value lives in the URL (?name=value), so filtered views can be shared. */
export function UrlSelect({
  name,
  options,
  allLabel,
  label,
  className,
  resets = [],
}: {
  name: string;
  options: { value: string; label: string }[];
  allLabel?: string;
  label: string;
  className?: string;
  /** Other params cleared when this one changes (e.g. picking a month clears the match) */
  resets?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const current = params.get(name) ?? (allLabel ? ALL : options[0]?.value);

  return (
    <Select
      value={current}
      onValueChange={(value) => {
        const next = new URLSearchParams(params.toString());
        if (value === ALL) next.delete(name);
        else next.set(name, value);
        for (const r of resets) next.delete(r);
        startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
      }}
    >
      <SelectTrigger aria-label={label} className={cn("min-w-36", pending && "opacity-60", className)}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
