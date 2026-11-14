"use client";

import { useLayout, VARIANTS, type LayoutId } from "@/components/templates/layout-context";

/** Floating pill for flipping between the baseline and the five drafts
 * without editing the URL. Draft-only; not meant to ship. */
export function LayoutSwitcher() {
  const { layout, ready, setLayout } = useLayout();
  if (!ready) return null;

  const options: { id: LayoutId; label: string; title: string }[] = [
    { id: "base", label: "Current", title: "Current design" },
    ...VARIANTS.map((v) => ({ id: v.id, label: v.id.toUpperCase(), title: v.name })),
  ];

  return (
    <div
      role="group"
      aria-label="Layout draft"
      className="fixed bottom-4 right-4 z-[100] flex items-center gap-1 rounded-full bg-foreground p-1 text-xs font-bold text-background shadow-lg"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          title={o.title}
          aria-pressed={layout === o.id}
          onClick={() => setLayout(o.id)}
          className={`rounded-full px-3 py-1.5 ${
            layout === o.id ? "bg-accent text-accent-foreground" : "opacity-70 hover:opacity-100"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
