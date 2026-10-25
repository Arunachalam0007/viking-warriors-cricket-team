import Link from "next/link";
import { cn } from "@/lib/utils";

/** Tabs that are plain links (?param=value), so each view has a shareable URL. */
export function LinkTabs({
  param,
  current,
  tabs,
  basePath,
  searchParams,
}: {
  param: string;
  current: string;
  tabs: { value: string; label: string }[];
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  return (
    <nav aria-label="Views" className="inline-flex max-w-full overflow-x-auto rounded-lg bg-muted p-1">
      {tabs.map((t) => {
        const next = new URLSearchParams();
        for (const [k, v] of Object.entries(searchParams)) if (v) next.set(k, v);
        next.set(param, t.value);
        const active = current === t.value;
        return (
          <Link
            key={t.value}
            href={`${basePath}?${next.toString()}`}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
              active && "bg-background text-foreground shadow-sm",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
