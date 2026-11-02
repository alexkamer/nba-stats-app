import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, Barlow_Condensed, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SiteNav } from "@/components/SiteNav";
import { AppShell } from "@/components/AppShell";
import { Breadcrumb, BreadcrumbProvider } from "@/components/Breadcrumb";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  weight: ["600", "700", "800"],
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NBA Stats",
  description: "NBA teams, players, standings, and game stats",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${barlowCondensed.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground" suppressHydrationWarning>
        <Providers>
          <BreadcrumbProvider>
            <AppShell>
              <div className="flex-1 flex flex-col min-w-0">
                <header className="bg-surface px-6 py-4 lg:hidden">
                  <SiteNav />
                </header>
                <main className="flex-1 px-6 py-6">
                  <div className="max-w-6xl w-full mx-auto xl:max-w-7xl 2xl:max-w-[1600px]">
                    <Suspense fallback={<div className="h-5" aria-hidden="true" />}>
                      <Breadcrumb />
                    </Suspense>
                    <div className="mt-4">{children}</div>
                  </div>
                </main>
              </div>
            </AppShell>
          </BreadcrumbProvider>
        </Providers>
      </body>
    </html>
  );
}
