"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Building2,
  Check,
  ChevronsUpDown,
  FileText,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Link2,
  LogOut,
  MapPin,
  Menu,
  Search,
  Settings,
  SlidersHorizontal,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { logoutAction } from "@/lib/auth/actions";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";
import { Logo } from "@/components/ui/logo";

export type ShellClient = { id: string; name: string; domain: string; isDemo: boolean };
export type ShellUser = { name: string; email: string; role: "admin" | "staff" | "client" };

const CLIENT_SECTIONS = [
  { slug: "", label: "Overview", icon: LayoutDashboard },
  { slug: "rankings", label: "Rankings", icon: TrendingUp },
  { slug: "search-console", label: "Search Console", icon: Search },
  { slug: "analytics", label: "Analytics", icon: BarChart3 },
  { slug: "business-profile", label: "Business Profile", icon: MapPin },
  { slug: "links", label: "Links", icon: Link2 },
  { slug: "reports", label: "Reports", icon: FileText },
] as const;

function NavItem({
  href,
  active,
  icon: Icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: typeof Gauge;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-brand-800 font-medium text-white"
          : "text-brand-300 hover:bg-white/5 hover:text-white",
      )}
    >
      {active ? (
        <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-lime" />
      ) : null}
      <Icon
        className={cn("h-4 w-4 shrink-0", active ? "text-lime" : "text-brand-300 group-hover:text-white")}
        aria-hidden="true"
      />
      {children}
    </Link>
  );
}

function ClientSwitcher({
  clients,
  current,
  section,
  suffix,
}: {
  clients: ShellClient[];
  current: ShellClient | null;
  section: string;
  suffix: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) => c.name.toLowerCase().includes(q) || c.domain.toLowerCase().includes(q),
    );
  }, [clients, query]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left transition-colors hover:bg-white/10"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-700 text-xs font-semibold text-white">
          {current ? initials(current.name) : <Building2 className="h-4 w-4" aria-hidden="true" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-white">
            {current ? current.name : "Choose a client"}
          </span>
          <span className="block truncate text-xs text-brand-300">
            {current ? current.domain : `${clients.length} available`}
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-brand-300" aria-hidden="true" />
      </button>

      {open ? (
        <div className="absolute top-full right-0 left-0 z-40 mt-1.5 overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
          {clients.length > 6 ? (
            <div className="border-b border-line p-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search clients"
                aria-label="Search clients"
                className="h-8 w-full rounded-md border border-line-strong px-2 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none"
              />
            </div>
          ) : null}
          <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted">No clients match.</li>
            ) : (
              filtered.map((c) => (
                <li key={c.id} role="option" aria-selected={c.id === current?.id}>
                  <Link
                    href={`/c/${c.id}${section ? `/${section}` : ""}${suffix}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-brand-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="block truncate text-xs text-muted">{c.domain}</span>
                    </span>
                    {c.isDemo ? (
                      <span className="rounded bg-warn-bg px-1.5 py-0.5 text-[10px] font-medium text-warn">
                        Demo
                      </span>
                    ) : null}
                    {c.id === current?.id ? (
                      <Check className="h-4 w-4 text-brand-600" aria-hidden="true" />
                    ) : null}
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function Sidebar({ user, clients }: { user: ShellUser; clients: ShellClient[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The drawer remembers which page it was opened on, so navigating closes it.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const mobileOpen = openedOn === pathname;
  const setMobileOpen = (open: boolean) => setOpenedOn(open ? pathname : null);
  const isStaff = user.role !== "client";

  // Keep the chosen date range when moving between a client's sections.
  const carried = new URLSearchParams();
  for (const key of ["range", "from", "to", "compare"]) {
    const value = searchParams.get(key);
    if (value) carried.set(key, value);
  }
  const rangeSuffix = carried.size > 0 ? `?${carried.toString()}` : "";

  // /c/<clientId>/<section>/...
  const match = pathname.match(/^\/c\/([^/]+)(?:\/([^/]+))?/);
  const clientId = match?.[1] ?? null;
  const section = match?.[2] ?? "";
  const current = clients.find((c) => c.id === clientId) ?? null;
  // Keep the section when switching client, except for staff-only settings pages.
  const carrySection = CLIENT_SECTIONS.some((s) => s.slug === section) ? section : "";

  const showSwitcher = isStaff || clients.length > 1;

  const body = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center justify-between px-5">
        <Link href="/" aria-label="omniReports home">
          <Logo />
        </Link>
        <button
          type="button"
          className="rounded-md p-1.5 text-brand-300 hover:bg-white/10 hover:text-white lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {showSwitcher ? (
          <ClientSwitcher
            clients={clients}
            current={current}
            section={carrySection}
            suffix={rangeSuffix}
          />
        ) : null}

        {current ? (
          <nav aria-label="Client reports" className="space-y-0.5">
            {!showSwitcher ? (
              <p className="px-3 pb-2 text-sm font-medium text-white">{current.name}</p>
            ) : null}
            {CLIENT_SECTIONS.map((s) => (
              <NavItem
                key={s.slug}
                href={`/c/${current.id}${s.slug ? `/${s.slug}` : ""}${rangeSuffix}`}
                active={section === s.slug}
                icon={s.icon}
              >
                {s.label}
              </NavItem>
            ))}
            {isStaff ? (
              <NavItem
                href={`/c/${current.id}/settings`}
                active={section === "settings"}
                icon={SlidersHorizontal}
              >
                Client settings
              </NavItem>
            ) : null}
          </nav>
        ) : null}

        {isStaff ? (
          <nav aria-label="omniSEO admin" className="space-y-0.5">
            <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-brand-500 uppercase">
              omniSEO
            </p>
            <NavItem href="/clients" active={pathname === "/clients"} icon={Building2}>
              All clients
            </NavItem>
            <NavItem
              href="/admin/google"
              active={pathname.startsWith("/admin/google")}
              icon={KeyRound}
            >
              Google accounts
            </NavItem>
            <NavItem href="/admin/team" active={pathname.startsWith("/admin/team")} icon={Users}>
              Team
            </NavItem>
            <NavItem
              href="/admin/settings"
              active={pathname.startsWith("/admin/settings")}
              icon={Settings}
            >
              Settings
            </NavItem>
          </nav>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white">
            {initials(user.name)}
          </span>
          <Link href="/account" className="min-w-0 flex-1 hover:opacity-80">
            <span className="block truncate text-sm font-medium text-white">{user.name}</span>
            <span className="block truncate text-xs text-brand-300">{user.email}</span>
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md p-1.5 text-brand-300 hover:bg-white/10 hover:text-white"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="no-print sticky top-0 z-30 flex h-14 items-center justify-between bg-deep px-4 lg:hidden">
        <Link href="/" aria-label="omniReports home">
          <Logo />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-2 text-white hover:bg-white/10"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 bg-deep lg:block">
        {body}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-deep">{body}</aside>
        </div>
      ) : null}
    </>
  );
}
