"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ROLES } from "@/lib/auth/roles";

interface MobileMenuLink {
  href: string;
  label: string;
}

// Mobile-only navigation: the header hides the role links below `sm`, so this
// hamburger keeps every destination reachable on phones.
export function MobileMenu({
  sessionRole,
}: {
  sessionRole: string | null;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const links: MobileMenuLink[] = [];

  if (sessionRole === null) {
    links.push({ href: "/login", label: "Log in" });
    links.push({ href: "/register", label: "Create account" });
  } else {
    links.push({ href: "/requests/new", label: "Make a request" });
    links.push({ href: "/requests", label: "My requests" });
    if (sessionRole === ROLES.OPERATIONS || sessionRole === ROLES.ADMIN) {
      links.push({ href: "/operations", label: "Operations" });
    }
    if (sessionRole === ROLES.ADMIN) {
      links.push({ href: "/admin/suppliers", label: "Supplier reviews" });
      links.push({ href: "/admin/trust", label: "Trust center" });
      links.push({ href: "/admin/analytics", label: "Analytics" });
    }
    if (sessionRole === ROLES.SUPPLIER) {
      links.push({ href: "/suppliers", label: "Supplier home" });
    }
    links.push({ href: "/account", label: "Account" });
  }

  return (
    <div ref={rootRef} className="relative flex shrink-0 items-center sm:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-700 transition-colors hover:bg-black/5 dark:text-zinc-200 dark:hover:bg-white/5"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-5 w-5"
          aria-hidden="true"
        >
          {open ? (
            <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          )}
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-30 flex w-56 flex-col gap-1 rounded-2xl border border-black/10 bg-surface p-2 shadow-lg dark:border-white/10">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-black/5 dark:text-zinc-200 dark:hover:bg-white/5"
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}