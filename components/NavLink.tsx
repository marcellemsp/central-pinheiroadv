"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const ativo = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={ativo ? "page" : undefined}
      className={`px-3 py-2 rounded-sm text-sm no-underline transition-colors ${
        ativo ? "bg-surface-200/10 text-on-brand font-semibold" : "text-on-brand-muted hover:text-on-brand"
      }`}
    >
      {children}
    </Link>
  );
}
