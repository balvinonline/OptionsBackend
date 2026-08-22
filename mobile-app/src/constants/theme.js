export const DARK_THEME = {
  colors: {
    bgDark: "#121212", // Deep charcoal
    bgCard: "#1E1E1E", // Slightly lighter charcoal for cards
    bgCardSolid: "#1E1E1E",
    bgCardElevated: "#2A2A2A",
    border: "#333333", // Thin border
    borderLight: "#222222",
    
    // Accents
    primary: "#0066FF",      // Subtle brand accent blue
    primaryLight: "#3385FF",
    primaryGlow: "rgba(0, 102, 255, 0.1)",
    
    // Trading Indicators
    bullish: "#00C853",      // Standard positive green
    bullishBg: "rgba(0, 200, 83, 0.1)",
    bullishBorder: "rgba(0, 200, 83, 0.2)",
    
    bearish: "#FF3B30",      // Standard negative red
    bearishBg: "rgba(255, 59, 48, 0.1)",
    bearishBorder: "rgba(255, 59, 48, 0.2)",
    
    warning: "#FF9500",      // Neutral orange
    warningBg: "rgba(255, 149, 0, 0.1)",
    
    // Typography
    textPrimary: "#F5F5F5",
    textSecondary: "#A0A0A0", // Neutral gray
    textMuted: "#666666",
    
    // No gradients
    gradBg: ["#121212", "#121212"],
    gradCard: ["#1E1E1E", "#1E1E1E"],
  },
  
  shadows: {
    // Completely removed shadows per design spec (Thin borders instead)
    sm: { elevation: 0 },
    md: { elevation: 0 }
  },
  
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    pill: 999,
  },
  
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    screenPadding: 16
  }
};

export const LIGHT_THEME = {
  colors: {
    bgDark: "#FFFFFF", // Pure white
    bgCard: "#F8F9FA", // Very subtle off-white for cards
    bgCardSolid: "#F8F9FA",
    bgCardElevated: "#FFFFFF",
    border: "#E0E0E0", // Thin border
    borderLight: "#F0F0F0",
    
    // Accents
    primary: "#0066FF",
    primaryLight: "#3385FF",
    primaryGlow: "rgba(0, 102, 255, 0.1)",
    
    // Trading Indicators
    bullish: "#00A843",
    bullishBg: "rgba(0, 168, 67, 0.1)",
    bullishBorder: "rgba(0, 168, 67, 0.2)",
    
    bearish: "#E53935",
    bearishBg: "rgba(229, 57, 53, 0.1)",
    bearishBorder: "rgba(229, 57, 53, 0.2)",
    
    warning: "#F57C00",
    warningBg: "rgba(245, 124, 0, 0.1)",
    
    // Typography
    textPrimary: "#111111",
    textSecondary: "#757575",
    textMuted: "#9E9E9E",
    
    // No gradients
    gradBg: ["#FFFFFF", "#FFFFFF"],
    gradCard: ["#F8F9FA", "#F8F9FA"],
  },
  
  shadows: {
    sm: { elevation: 0 },
    md: { elevation: 0 }
  },
  borderRadius: DARK_THEME.borderRadius,
  spacing: DARK_THEME.spacing
};

// Fallback for non-refactored components
export const THEME = DARK_THEME;
