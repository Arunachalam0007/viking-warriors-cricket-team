import {
  BarChart3,
  CalendarDays,
  Coins,
  FileSpreadsheet,
  HandCoins,
  LayoutDashboard,
  Receipt,
  RefreshCcw,
  Settings,
  Shield,
  Trophy,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; mobile?: boolean };

export const PUBLIC_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { href: "/players", label: "Players", icon: Users, mobile: true },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy, mobile: true },
  { href: "/matches", label: "Matches", icon: CalendarDays, mobile: true },
  { href: "/finance", label: "Finance", icon: Wallet, mobile: true },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Revenue overview", icon: Shield },
  { href: "/admin/fees", label: "Match fees", icon: Coins },
  { href: "/admin/payments", label: "Payments", icon: HandCoins },
  { href: "/admin/collections", label: "Collections", icon: FileSpreadsheet },
  { href: "/admin/expenses", label: "Expenses & income", icon: Receipt },
  { href: "/admin/players", label: "Manage players", icon: Users },
  { href: "/admin/sync", label: "Sync & logs", icon: RefreshCcw },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function isActive(pathname: string, href: string) {
  if (href === "/" || href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
