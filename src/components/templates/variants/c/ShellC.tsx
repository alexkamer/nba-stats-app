"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { CircularBadge } from "@/components/CircularBadge";
import { SECTIONS } from "@/components/Sidebar";
import { ThemeIconButton } from "@/components/templates/variants/shared";
import { activeHref } from "@/components/templates/variants/a/ShellA";
import { Wordmark } from "@/components/templates/Wordmark";

interface TeamItem {
  id: number;
  displayName: string;
  abbreviation: string;
  logoUrl: string | null;
}

interface Command {
  id: string;
  label: string;
  hint: string;
  href: string;
  logo?: string | null;
  icon?: (typeof SECTIONS)[number]["icon"];
}

/** Cmd/Ctrl+K palette for jumping to a section or a team. Arrow keys move,
 * Enter opens, Escape closes; focus returns to the opener on close. */
function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: teams } = useQuery({
    queryKey: ["teams", "palette"],
    queryFn: async (): Promise<TeamItem[]> => (await (await fetch("/api/teams")).json()).teams,
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const items = useMemo<Command[]>(() => {
    const q = query.trim().toLowerCase();
    const all: Command[] = [
      ...SECTIONS.map((s) => ({ id: s.href, label: s.label, hint: "Section", href: s.href, icon: s.icon })),
      ...(teams ?? []).map((t) => ({ id: `t${t.id}`, label: t.displayName, hint: t.abbreviation, href: `/teams/${t.id}`, logo: t.logoUrl })),
    ];
    return (q ? all.filter((c) => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q)) : all.slice(0, SECTIONS.length + 5)).slice(0, 9);
  }, [query, teams]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  function go(c: Command) {
    onClose();
    setQuery("");
    router.push(c.href);
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-foreground/30 px-4 pt-[14vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex((i) => Math.min(i + 1, items.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((i) => Math.max(i - 1, 0));
          }
          if (e.key === "Enter" && items[index]) go(items[index]);
        }}
        className="w-full max-w-xl overflow-hidden rounded-[14px] bg-surface shadow-2xl ring-1 ring-border"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 text-foreground/50" strokeWidth={1.75} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            placeholder="Jump to a section or team"
            aria-label="Jump to a section or team"
            className="h-14 flex-1 bg-transparent text-[17px] outline-none placeholder:text-foreground/40"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-foreground/50">esc</kbd>
        </div>
        <ul role="listbox" className="max-h-[24rem] overflow-y-auto p-2">
          {items.length === 0 && <li className="px-3 py-6 text-center text-foreground/60">Nothing matches &ldquo;{query}&rdquo;. Try a team name or a section like Standings.</li>}
          {items.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === index}>
              <button
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(c)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${i === index ? "bg-accent text-accent-foreground" : ""}`}
              >
                {c.logo !== undefined ? (
                  <CircularBadge src={c.logo} alt="" size="sm" />
                ) : c.icon ? (
                  <c.icon className="h-5 w-5" strokeWidth={1.75} />
                ) : null}
                <span className="flex-1 font-medium">{c.label}</span>
                <span className={`text-sm ${i === index ? "opacity-80" : "text-foreground/50"}`}>{c.hint}</span>
                {i === index && <CornerDownLeft className="h-4 w-4 opacity-80" strokeWidth={1.75} />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Rail({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = usePathname();
  const active = pathname ? activeHref(pathname) : null;
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col items-center gap-2 border-r border-border bg-surface py-4 lg:flex">
      <div className="mb-3 text-[9px]">
        <Link href="/" aria-label="Baseline home" className="grid h-10 w-10 place-items-center rounded-[10px] bg-foreground text-background">
          <span className="font-display text-xl font-bold leading-none">b</span>
        </Link>
      </div>
      <button
        type="button"
        onClick={onOpenPalette}
        aria-label="Open command palette"
        title="Search (Ctrl or Cmd + K)"
        className="grid h-10 w-10 place-items-center rounded-[10px] text-foreground/70 outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Search className="h-[19px] w-[19px]" strokeWidth={1.75} />
      </button>
      <nav aria-label="Sections" className="mt-2 flex flex-col items-center gap-1">
        {SECTIONS.map((s) => {
          const on = s.href === active;
          return (
            <Link
              key={s.href}
              href={s.href}
              title={s.label}
              aria-label={s.label}
              aria-current={on ? "page" : undefined}
              className={`grid h-10 w-10 place-items-center rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                on ? "bg-accent text-accent-foreground" : "text-foreground/60 hover:bg-surface-muted hover:text-foreground"
              }`}
            >
              <s.icon className="h-[19px] w-[19px]" strokeWidth={1.75} />
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto">
        <ThemeIconButton />
      </div>
    </aside>
  );
}

function MobileBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = usePathname();
  const active = pathname ? activeHref(pathname) : null;
  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-surface/95 px-5 py-3 backdrop-blur lg:hidden">
        <div className="text-[13px]">
          <Wordmark />
        </div>
        <button
          type="button"
          onClick={onOpenPalette}
          className="ml-auto flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-2 text-sm text-foreground/60"
          aria-label="Open command palette"
        >
          <Search className="h-4 w-4" strokeWidth={1.75} />
          Search
        </button>
        <ThemeIconButton />
      </header>
      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border bg-surface/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {SECTIONS.slice(0, 5).map((s) => (
          <Link
            key={s.href}
            href={s.href}
            aria-current={s.href === active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${s.href === active ? "text-accent" : "text-foreground/60"}`}
          >
            <s.icon className="h-5 w-5" strokeWidth={1.75} />
            {s.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

function CrumbUnlessHome() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <div className="mb-6">
      <Breadcrumb />
    </div>
  );
}

/** Variant C shell: a 72px icon rail and a Cmd+K palette. Navigation is
 * deliberately quiet so the numbers on the page carry the design. */
export function ShellC({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mac, setMac] = useState(false);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-full pb-20 lg:pb-0 lg:pl-[72px] lg:[--sidebar-w:72px] lg:[--sidebar-w-half:36px]">
      <Suspense fallback={null}>
        <Rail onOpenPalette={() => setOpen(true)} />
        <MobileBar onOpenPalette={() => setOpen(true)} />
      </Suspense>
      <main className="px-5 py-8 lg:px-12 lg:py-12">
        <div className="mx-auto w-full max-w-[1100px]">
          <div className="mb-8 hidden justify-end lg:flex">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex w-72 items-center gap-2.5 rounded-[10px] bg-surface px-3.5 py-2 text-sm text-foreground/50 outline-none ring-1 ring-border hover:ring-foreground/30 focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Search className="h-4 w-4" strokeWidth={1.75} />
              Search players, teams, pages
              <kbd className="ml-auto rounded border border-border px-1.5 py-0.5 font-mono text-[11px]">{mac ? "⌘K" : "Ctrl K"}</kbd>
            </button>
          </div>
          <Suspense fallback={<div className="mb-6 h-5" aria-hidden="true" />}>
            <CrumbUnlessHome />
          </Suspense>
          {children}
        </div>
      </main>
      <Palette open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
