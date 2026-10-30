"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface TabOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Tab state lives in the URL (`?tab=`) rather than useState, so switching
 * tabs pushes a history entry — the browser's back/forward buttons page
 * between tabs the same way they page between any other navigation.
 */
export function useTabQueryParam<T extends string>(defaultTab: T, paramName = "tab"): [T, (tab: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get(paramName) as T | null) ?? defaultTab;

  const setActiveTab = (tab: T) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === defaultTab) {
      params.delete(paramName);
    } else {
      params.set(paramName, tab);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return [activeTab, setActiveTab];
}

export function TabPager<T extends string>({
  tabs,
  activeTab,
  onChange,
  accentColor,
}: {
  tabs: TabOption<T>[];
  activeTab: T;
  onChange: (value: T) => void;
  accentColor: string;
}) {
  return (
    <div className="mx-auto max-w-6xl flex border-t border-border px-6 text-sm">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={`flex-1 px-3 py-2 text-center whitespace-nowrap ${
            activeTab === tab.value
              ? "text-foreground font-semibold border-b-2"
              : "text-foreground/60 hover:text-foreground/80 border-b-2 border-transparent"
          }`}
          style={activeTab === tab.value ? { borderColor: accentColor } : undefined}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
