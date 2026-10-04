"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui";
import { NOTE_TYPES, NOTE_TYPE_LABELS } from "@/lib/upload-config";

// shortLabel：手機寬度放不下完整文字時顯示
const LINKS: { href: string; label: string; shortLabel?: string; icon: IconName; match: (p: string) => boolean }[] = [
  {
    href: "/new",
    label: `新增${NOTE_TYPES.map((t) => NOTE_TYPE_LABELS[t]).join("／")}`,
    shortLabel: "新增",
    icon: "plus",
    match: (p) => p === "/new",
  },
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
            {link.shortLabel ? (
              <>
                <span className="hidden md:inline">{link.label}</span>
                <span className="md:hidden">{link.shortLabel}</span>
              </>
            ) : (
              <span>{link.label}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
