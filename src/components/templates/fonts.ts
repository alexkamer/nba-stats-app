import {
  Archivo,
  Barlow,
  Barlow_Semi_Condensed,
  Geist,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Inter_Tight,
  Newsreader,
} from "next/font/google";

// Fonts for the five template drafts (see design D8). next/font only emits
// the @font-face rules, so a face is downloaded only once a layout's CSS
// actually uses it; the baseline pays nothing for these.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });
const barlow = Barlow({ variable: "--font-barlow", weight: ["400", "500", "600"], subsets: ["latin"] });
const barlowSemiCondensed = Barlow_Semi_Condensed({
  variable: "--font-barlow-sc",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
});
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", weight: ["400", "500", "600"], subsets: ["latin"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", weight: ["400", "500"], subsets: ["latin"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"] });
const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"] });

export const templateFontClassName = [
  archivo,
  barlow,
  barlowSemiCondensed,
  geistSans,
  plexSans,
  plexMono,
  newsreader,
  interTight,
]
  .map((f) => f.variable)
  .join(" ");
