// Kotak Neo Dark Theme (Phase 7 Redesign)
export const DARK_THEME = {
  colors: {
    bgDark: "#0A0D14", // Pure institutional black
    bgCard: "#191E28", // Flat grey-blue-black for cards
    bgCardSolid: "#191E28",
    bgCardElevated: "#232936",
    border: "#232936",
    borderLight: "#1D2330",
    
    // Accents
    primary: "#00B8FF",      // Bright cyan blue
    primaryLight: "#4DD1FF",
    primaryGlow: "rgba(0, 184, 255, 0.15)",
    
    // Trading Indicators
    bullish: "#05C076",      // Mint Green
    bullishBg: "rgba(5, 192, 118, 0.1)",
    bullishBorder: "rgba(5, 192, 118, 0.2)",
    
    bearish: "#FF3F4F",      // Bright Red
    bearishBg: "rgba(255, 63, 79, 0.1)",
    bearishBorder: "rgba(255, 63, 79, 0.2)",
    
    warning: "#FF9900",      // Alert Orange
    warningBg: "rgba(255, 153, 0, 0.1)",
    
    // Typography
    textPrimary: "#FFFFFF",
    textSecondary: "#8891A5",
    textMuted: "#5F6B84",
    
    // Gradients
    gradBg: ["#0A0D14", "#0A0D14"],
    gradCard: ["#191E28", "#191E28"],
  },
  
  shadows: {
    sm: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 3,
      elevation: 2,
    },
    md: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 5,
    }
  },
  
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    pill: 999,
  }
};

// Kotak Neo Light Theme (Phase 7 Redesign)
export const LIGHT_THEME = {
  colors: {
    bgDark: "#F2F4F7", // Very light grayish blue
    bgCard: "#FFFFFF",
    bgCardSolid: "#FFFFFF",
    bgCardElevated: "#FFFFFF",
    border: "#E4E7ED",
    borderLight: "#F0F2F5",
    
    // Accents
    primary: "#0050FF",      // Institutional Deep Blue
    primaryLight: "#3375FF",
    primaryGlow: "rgba(0, 80, 255, 0.1)",
    
    // Trading Indicators
    bullish: "#00A95A",      // Forest green
    bullishBg: "rgba(0, 169, 90, 0.1)",
    bullishBorder: "rgba(0, 169, 90, 0.2)",
    
    bearish: "#EB3F4C",      // Deep Red
    bearishBg: "rgba(235, 63, 76, 0.1)",
    bearishBorder: "rgba(235, 63, 76, 0.2)",
    
    warning: "#E67E22",      // Alert Orange
    warningBg: "rgba(230, 126, 34, 0.1)",
    
    // Typography
    textPrimary: "#141721",
    textSecondary: "#5F6B84",
    textMuted: "#8891A5",
    
    // Gradients
    gradBg: ["#F2F4F7", "#F2F4F7"],
    gradCard: ["#FFFFFF", "#FFFFFF"],
  },
  
  shadows: {
    sm: {
      shadowColor: "#141721",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    md: {
      shadowColor: "#141721",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.08,
      shadowRadius: 5,
      elevation: 3,
    }
  },
  borderRadius: DARK_THEME.borderRadius
};

// Fallback for non-refactored components
export const THEME = DARK_THEME;
