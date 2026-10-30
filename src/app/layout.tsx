import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";
import { ThemeToggle } from "@/components/ThemeToggle";

const geistSans = Geist({
  variable: "--font-geist-sans",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>
          <header className="border-b border-border px-6 py-4">
            <nav className="flex items-center gap-6 text-sm font-medium">
              <Link href="/" className="font-semibold text-base">
                NBA Stats
              </Link>
              <Link href="/standings" className="text-foreground/60 hover:text-foreground">
                Standings
              </Link>
              <Link href="/teams" className="text-foreground/60 hover:text-foreground">
                Teams
              </Link>
              <Link href="/players" className="text-foreground/60 hover:text-foreground">
                Players
              </Link>
              <Link href="/news" className="text-foreground/60 hover:text-foreground">
                News
              </Link>
              <span className="ml-auto">
                <ThemeToggle />
              </span>
            </nav>
          </header>
          <main className="flex-1 px-6 py-6 max-w-6xl w-full mx-auto">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
