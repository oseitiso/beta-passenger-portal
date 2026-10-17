"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bus, Map, Ticket, MessageSquare } from "lucide-react";

const TABS = [
  { href: "/live-buses",          label: "Buses",      icon: Bus },
  { href: "/map",                 label: "Map",        icon: Map },
  { href: "/my-booking",          label: "Booking",    icon: Ticket },
  { href: "/help/my-complaints",  label: "Complaints", icon: MessageSquare },
] as const;

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="mobile-nav"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 5000,
        background: "#0a0a0a",
        borderTop: "1px solid #262626",
        paddingBottom: "env(safe-area-inset-bottom)",
        display: "none",
      }}
      aria-label="Primary"
    >
      <div
        style={{
          display: "flex",
          height: 60,
        }}
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active =
            pathname === tab.href ||
            (tab.href !== "/map" && pathname.startsWith(tab.href + "/")) ||
            (tab.href === "/map" && pathname.startsWith("/map/"));
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                color: active ? "#f97316" : "#737373",
                textDecoration: "none",
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: ".04em",
                transition: "color .15s",
              }}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}