"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CalendarDays, Bookmark, Receipt, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/home",     icon: Home,          label: "home" },
  { href: "/calendar", icon: CalendarDays,  label: "calendar" },
  { href: "/vault",    icon: Bookmark,      label: "vault" },
  { href: "/ledger",   icon: Receipt,       label: "ledger" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50",
        "glass-oat shadow-nav",
        "pb-[env(safe-area-inset-bottom)]"
      )}
    >
      <div className="flex items-center justify-around px-2 h-16 max-w-lg mx-auto relative">
        {navItems.slice(0, 2).map(({ href, icon: Icon, label }) => (
          <NavLink key={href} href={href} icon={Icon} label={label} active={pathname === href} />
        ))}

        {/* FAB — centre */}
        <div className="flex flex-col items-center justify-center w-14">
          <button
            className={cn(
              "w-12 h-12 rounded-2xl bg-foreground text-background",
              "flex items-center justify-center",
              "shadow-[0_4px_20px_rgb(0,0,0,0.18)]",
              "active:scale-95 transition-transform"
            )}
            aria-label="add"
          >
            <Plus className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>

        {navItems.slice(2).map(({ href, icon: Icon, label }) => (
          <NavLink key={href} href={href} icon={Icon} label={label} active={pathname === href} />
        ))}
      </div>
    </nav>
  );
}

function NavLink({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 w-14 h-14",
        "transition-colors active:scale-95 transition-transform",
        active ? "text-foreground" : "text-muted-foreground"
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon
        className={cn("w-5 h-5 transition-all", active && "scale-110")}
        strokeWidth={active ? 2 : 1.5}
      />
      <span className={cn("text-[10px] font-medium tracking-wide", active ? "opacity-100" : "opacity-60")}>
        {label}
      </span>
    </Link>
  );
}
