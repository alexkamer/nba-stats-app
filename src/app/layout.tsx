import type { Metadata } from "next";
import { Archivo, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { BreadcrumbProvider } from "@/components/Breadcrumb";
import { AppShell } from "@/components/shell/AppShell";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });
// The Briefing's own typeface (see [data-scope="briefing"] in globals.css).
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "NBA Stats",
  description: "NBA teams, players, standings, and game stats",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${archivo.variable} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground" suppressHydrationWarning>
        <Providers>
          <BreadcrumbProvider>
            <AppShell>{children}</AppShell>
          </BreadcrumbProvider>
        </Providers>
      </body>
    </html>
  );
}
