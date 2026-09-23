"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui";

const LINKS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: "/new", label: "新增會議", icon: "plus", match: (p) => p === "/new" },
  { href: "/meetings", label: "歷史紀錄", icon: "history", match: (p) => p.startsWith("/meetings") },
];

export default function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {LINKS.map((link) => {
        const active = link.match(pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm transition-colors ${
              active ? "bg-surface-2 font-medium text-ink" : "text-muted hover:text-ink"
            }`}
          >
            <Icon name={link.icon} className="size-4" />
            <span>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
