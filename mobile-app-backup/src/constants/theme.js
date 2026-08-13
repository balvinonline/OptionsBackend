export const THEME = {
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
    
    purple: "#a855f7",
    purpleBg: "rgba(168, 85, 247, 0.15)",
    
    // Text
    textPrimary: "#ffffff",
    textSecondary: "rgba(255, 255, 255, 0.75)",
    textMuted: "rgba(255, 255, 255, 0.45)",
    textDisabled: "rgba(255, 255, 255, 0.25)",
  },
  
  fonts: {
    regular: "System",
    medium: "System",
    bold: "System",
  },
  
  shadows: {
    card: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 4,
    },
    glow: {
      shadowColor: "#38bdf8",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 10,
      elevation: 6,
    }
  }
};
