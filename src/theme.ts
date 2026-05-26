// src/theme.ts — POS Design Tokens
// "Square POS meets a friendly school app"

export const POS = {
  // Primary: warm purple (brand preserved)
  primary: "#6C5CE7",
  primaryLight: "#A29BFE",
  primaryDark: "#5A4BD1",
  primaryGradient: "linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%)",

  // Backgrounds
  bgMain: "#F8F9FE",
  bgCard: "#FFFFFF",
  bgSurface: "#F0EEFF",
  bgHover: "#E8E5FF",

  // Semantic
  success: "#00C853",
  successLight: "#E8F5E9",
  warning: "#FFB300",
  warningLight: "#FFF8E1",
  danger: "#FF5252",
  dangerLight: "#FFEBEE",
  info: "#2196F3",
  infoLight: "#E3F2FD",

  // Semantic (extended)
  warningDark: "#B45309",
  warningAccent: "#D97706",
  successDark: "#15803D",

  // Text
  textPrimary: "#2D2D3F",
  textSecondary: "#6B7280",
  textTertiary: "#7C8DB0",
  textMuted: "#9CA3AF",
  textOnPrimary: "#FFFFFF",

  // Borders
  border: "#E5E7EB",
  borderLight: "#F3F4F6",
  borderPurple: "#E0DBFF",

  // Shadows (Deeper, softer for gummy look)
  shadowSm: "0 2px 8px rgba(108, 92, 231, 0.08)",
  shadowMd: "0 8px 24px rgba(108, 92, 231, 0.12)",
  shadowLg: "0 16px 32px rgba(108, 92, 231, 0.14)",
  shadowXl: "0 24px 48px rgba(108, 92, 231, 0.18)",

  // Touch targets (Massive for POS)
  touchMin: 56,
  touchComfortable: 64,
  touchLarge: 72,
  touchXl: 96,

  // Radius (Squircle / extremely round)
  radiusSm: "0.75rem",
  radiusMd: "1rem",
  radiusLg: "1.25rem",
  radiusXl: "1.75rem",
  radius2xl: "2rem",
  radius3xl: "2.5rem",
  radiusFull: "9999px",

  // Font sizes
  fontSize: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "2rem",
    "4xl": "2.5rem",
  },
} as const;

// Haptic feedback helper
export function haptic(type: "success" | "error" | "tap" = "tap") {
  if ("vibrate" in navigator) {
    switch (type) {
      case "success":
        navigator.vibrate(50);
        break;
      case "error":
        navigator.vibrate([50, 30, 50]);
        break;
      case "tap":
        navigator.vibrate(10);
        break;
    }
  }
}
