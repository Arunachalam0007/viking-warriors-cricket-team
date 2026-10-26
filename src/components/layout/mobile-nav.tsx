"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActive, PUBLIC_NAV } from "./nav-items";

/** Bottom tab bar on phones; the sidebar drawer still holds every page. */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="team-gradient-x fixed inset-x-0 bottom-0 z-40 border-t border-sidebar-border text-sidebar-foreground pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(0_0_0/0.15)] md:hidden"
    >
      <ul className="grid grid-cols-5 gap-1 px-1 py-1">
        {PUBLIC_NAV.filter((i) => i.mobile).map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] font-semibold text-sidebar-foreground/80 transition-colors",
                  active && "bg-sidebar-accent font-bold text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
