import sys
import re
filepath = "mobile-app/src/screens/DashboardScreen.js"
with open(filepath, "r") as f:
    text = f.read()

# Replace the specific ScrollView block
old_scroll_view = """      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
      >"""

new_scroll_view = """      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <VitalSignsHUD marketData={marketData} />
        {renderSmartActionCard()}
"""
text = text.replace(old_scroll_view, new_scroll_view)

func_text = """
  const { bearishDivergence, bullishDivergence } = useMarket();
  const renderSmartActionCard = () => {
    if (bearishDivergence) return <View style={[styles.smartActionCard, { backgroundColor: theme.colors.bearishBg, borderColor: theme.colors.bearishBorder }]}><Ionicons name="warning" size={20} color={theme.colors.bearish} /><View style={styles.smartActionTextContainer}><Text style={[styles.smartActionTitle, { color: theme.colors.bearish }]}>BEARISH DIVERGENCE</Text><Text style={styles.smartActionDesc}>Spot price rising but Call OI is dominating. High Trap Risk.</Text></View></View>;
    if (bullishDivergence) return <View style={[styles.smartActionCard, { backgroundColor: theme.colors.bullishBg, borderColor: theme.colors.bullishBorder }]}><Ionicons name="warning" size={20} color={theme.colors.bullish} /><View style={styles.smartActionTextContainer}><Text style={[styles.smartActionTitle, { color: theme.colors.bullish }]}>BULLISH DIVERGENCE</Text><Text style={styles.smartActionDesc}>Spot price falling but Put OI is dominating. Reversal likely.</Text></View></View>;
    if (zoneTone === "trap") return <View style={[styles.smartActionCard, { backgroundColor: theme.colors.warning + "20", borderColor: theme.colors.warning }]}><Ionicons name="alert-circle" size={20} color={theme.colors.warning} /><View style={styles.smartActionTextContainer}><Text style={[styles.smartActionTitle, { color: theme.colors.warning }]}>TRAP ZONE DETECTED</Text><Text style={styles.smartActionDesc}>Do not trade. Wait for clean volume breakout.</Text></View></View>;
    return null;
  };

  return (
"""
text = text.replace("  return (\n", func_text)

with open(filepath, "w") as f:
    f.write(text)
