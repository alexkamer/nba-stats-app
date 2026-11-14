export type Theme = "light" | "dark";

export interface TeamAccent {
  accent: string;
  accentForeground: string;
}

const FALLBACK_ACCENT: Record<Theme, TeamAccent> = {
  light: { accent: "#ea580c", accentForeground: "#ffffff" },
  dark: { accent: "#fb923c", accentForeground: "#1c1917" },
};

// The surfaces accents are drawn on (see --surface in globals.css).
const BACKGROUND: Record<Theme, string> = {
  light: "#ffffff",
  dark: "#121b2d",
};

const MIN_CONTRAST_RATIO = 2.5;
// In dark theme a team color that is too dark is lightened toward white until
// it reads, rather than replaced, so the team keeps its identity.
const DARK_TARGET_RATIO = 3;

function normalizeHex(input: string): string | null {
  const hex = input.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return `#${hex.toLowerCase()}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [rl, gl, bl] = [toLinear(r), toLinear(g), toLinear(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexToRgb(hexA));
  const lumB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

function mixWithWhite(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex).map((c) => Math.round(c + (255 - c) * amount));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function lightenUntilReadable(hex: string, background: string, target: number): string {
  for (let step = 1; step <= 10; step++) {
    const candidate = mixWithWhite(hex, step * 0.08);
    if (contrastRatio(candidate, background) >= target) return candidate;
  }
  return mixWithWhite(hex, 0.8);
}

/**
 * Picks the accent color for a team-scoped page. Falls back to the
 * neutral brand accent when the team has no usable color or the color
 * is too close to the active theme's background to read as an accent.
 */
export function getTeamAccent(color: string | null | undefined, theme: Theme): TeamAccent {
  if (!color) return FALLBACK_ACCENT[theme];

  const hex = normalizeHex(color);
  if (!hex) return FALLBACK_ACCENT[theme];

  let accentHex = hex;
  if (theme === "dark" && contrastRatio(hex, BACKGROUND.dark) < DARK_TARGET_RATIO) {
    accentHex = lightenUntilReadable(hex, BACKGROUND.dark, DARK_TARGET_RATIO);
  }

  if (contrastRatio(accentHex, BACKGROUND[theme]) < MIN_CONTRAST_RATIO) {
    return FALLBACK_ACCENT[theme];
  }

  const accentForeground = relativeLuminance(hexToRgb(accentHex)) > 0.4 ? "#1c1917" : "#ffffff";
  return { accent: accentHex, accentForeground };
}
