import type { Metadata } from "next";
import { Inter, Barlow_Condensed, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@/components/templates/templates.css";
import { templateFontClassName } from "@/components/templates/fonts";
import { Providers } from "./providers";
import { BreadcrumbProvider } from "@/components/Breadcrumb";
import { LayoutProvider } from "@/components/templates/layout-context";
import { TemplateShell } from "@/components/templates/TemplateShell";
import { LayoutSwitcher } from "@/components/templates/LayoutSwitcher";

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
      className={`${inter.variable} ${barlowCondensed.variable} ${geistMono.variable} ${templateFontClassName} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground" suppressHydrationWarning>
        <Providers>
          <LayoutProvider>
            <BreadcrumbProvider>
              <TemplateShell>{children}</TemplateShell>
            </BreadcrumbProvider>
            <LayoutSwitcher />
          </LayoutProvider>
        </Providers>
      </body>
    </html>
  );
}
