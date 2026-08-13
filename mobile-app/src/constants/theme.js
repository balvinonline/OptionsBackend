// Dark Theme (Original)
export const DARK_THEME = {
  colors: {
    bgDark: "#071a26",
    bgCard: "rgba(255, 255, 255, 0.05)",
    bgCardSolid: "#0c2436",
    bgCardElevated: "#123149",
    border: "rgba(255, 255, 255, 0.12)",
    borderLight: "rgba(255, 255, 255, 0.06)",
    
    // Accents
    primary: "#38bdf8",      // Sky blue
    primaryLight: "#7dd3fc",
    primaryGlow: "rgba(56, 189, 248, 0.2)",
    
    // Trading Indicators
    bullish: "#10b981",      // Emerald Green
    bullishBg: "rgba(16, 185, 129, 0.15)",
    bullishBorder: "rgba(16, 185, 129, 0.3)",
    
    bearish: "#ef4444",      // Red
    bearishBg: "rgba(239, 68, 68, 0.15)",
    bearishBorder: "rgba(239, 68, 68, 0.3)",
    
    warning: "#f59e0b",      // Amber
    warningBg: "rgba(245, 158, 11, 0.15)",
    
    // Typography
    textPrimary: "#f8fafc",
    textSecondary: "#cbd5e1",
    textMuted: "#64748b",
    
    // Gradients
    gradBg: ["#071a26", "#040e14"],
    gradCard: ["rgba(15, 39, 58, 0.9)", "rgba(9, 24, 38, 0.9)"],
  },
  
  shadows: {
    sm: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 3,
      elevation: 3,
    },
    md: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 6,
      elevation: 6,
    }
  },
  
  borderRadius: {
    sm: 6,
    md: 10,
    lg: 16,
    xl: 24,
    pill: 999,
  }
};

// Light Theme
export const LIGHT_THEME = {
  colors: {
    bgDark: "#f0f4f8",
    bgCard: "rgba(255, 255, 255, 0.95)",
    bgCardSolid: "#ffffff",
    bgCardElevated: "#ffffff",
    border: "rgba(0, 0, 0, 0.12)",
    borderLight: "rgba(0, 0, 0, 0.06)",
    
    // Accents
    primary: "#0284c7",      // Sky blue darker
    primaryLight: "#38bdf8",
    primaryGlow: "rgba(2, 132, 199, 0.2)",
    
    // Trading Indicators
    bullish: "#059669",      // Emerald Green Darker
    bullishBg: "rgba(16, 185, 129, 0.15)",
    bullishBorder: "rgba(16, 185, 129, 0.3)",
    
    bearish: "#dc2626",      // Red Darker
    bearishBg: "rgba(239, 68, 68, 0.15)",
    bearishBorder: "rgba(239, 68, 68, 0.3)",
    
    warning: "#d97706",      // Amber Darker
    warningBg: "rgba(245, 158, 11, 0.15)",
    
    // Typography
    textPrimary: "#0f172a",
    textSecondary: "#334155",
    textMuted: "#64748b",
    
    // Gradients
    gradBg: ["#f8fafc", "#e2e8f0"],
    gradCard: ["#ffffff", "#f8fafc"],
  },
  
  shadows: DARK_THEME.shadows, // Re-use shadows
  borderRadius: DARK_THEME.borderRadius
};

// Fallback for non-refactored components (points to DARK by default)
export const THEME = DARK_THEME;
