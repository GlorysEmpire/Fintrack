import {
  ArrowLeftRight,
  Inbox,
  Landmark,
  LayoutDashboard,
  Settings,
  Sparkles,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; short?: string; icon: LucideIcon };

/** The five everyday destinations: the mobile tab bar and the top of the sidebar */
export const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", short: "Home", icon: LayoutDashboard },
  { href: "/income", label: "Income", icon: Wallet },
  { href: "/expenses", label: "Expenses", icon: ArrowLeftRight },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/trends", label: "Trends", icon: TrendingUp },
];

/** Reached from the sidebar's second group, or the avatar menu on a phone */
export const MANAGE_NAV: NavItem[] = [
  { href: "/settings", label: "Plan", icon: Settings },
  { href: "/advisor", label: "Advisor", icon: Sparkles },
  { href: "/inbox", label: "Inbox", icon: Inbox },
];

export function isActive(path: string, href: string): boolean {
  return path === href || (href !== "/dashboard" && path.startsWith(href));
}

export function pageTitle(path: string): string {
  const all = [...MAIN_NAV, ...MANAGE_NAV];
  return all.find((n) => isActive(path, n.href))?.label ?? "FinTrack";
}

export function displayName(email?: string): string {
  const local = (email ?? "").split("@")[0].replace(/[._-]+/g, " ").trim();
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "";
}
