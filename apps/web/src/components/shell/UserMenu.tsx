"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MANAGE_NAV } from "./nav-items";

/** Phone only: holds Plan, Advisor, Inbox and log out, with a dot when Inbox has news */
export function UserMenu({
  email,
  unread,
  onLogout,
}: {
  email?: string;
  unread: number;
  onLogout: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Account menu, ${unread} unread` : "Account menu"}
          className="relative flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-ring md:hidden"
        >
          {(email ?? "?").charAt(0).toUpperCase()}
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-destructive" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[13rem]">
        {email && (
          <div className="truncate px-2 py-1.5 text-xs text-subtle" title={email}>
            {email}
          </div>
        )}
        {MANAGE_NAV.map((n) => {
          const Icon = n.icon;
          return (
            <DropdownMenuItem key={n.href} asChild>
              <Link href={n.href} className="gap-2 text-foreground">
                <Icon className="h-4 w-4" aria-hidden />
                {n.label}
                {n.href === "/inbox" && unread > 0 && <span className="badge ml-auto">{unread}</span>}
              </Link>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuItem onSelect={onLogout} className="gap-2 text-destructive">
          <LogOut className="h-4 w-4" aria-hidden />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
