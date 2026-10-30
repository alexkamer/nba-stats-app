export type Theme = "light" | "dark";

export interface TeamAccent {
  accent: string;
  accentForeground: string;
}

const FALLBACK_ACCENT: Record<Theme, TeamAccent> = {
  light: { accent: "#ea580c", accentForeground: "#ffffff" },
  dark: { accent: "#fb923c", accentForeground: "#1c1917" },
};

const BACKGROUND: Record<Theme, string> = {
  light: "#fafaf9",
  dark: "#0c0a09",
};

const MIN_CONTRAST_RATIO = 2.5;

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

/**
 * Picks the accent color for a team-scoped page. Falls back to the
 * neutral brand accent when the team has no usable color or the color
 * is too close to the active theme's background to read as an accent.
 */
export function getTeamAccent(color: string | null | undefined, theme: Theme): TeamAccent {
  if (!color) return FALLBACK_ACCENT[theme];

  const hex = normalizeHex(color);
  if (!hex) return FALLBACK_ACCENT[theme];

  if (contrastRatio(hex, BACKGROUND[theme]) < MIN_CONTRAST_RATIO) {
    return FALLBACK_ACCENT[theme];
  }

  const accentForeground = relativeLuminance(hexToRgb(hex)) > 0.4 ? "#1c1917" : "#ffffff";
  return { accent: hex, accentForeground };
}
