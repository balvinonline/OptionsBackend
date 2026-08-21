import sys
filepath = "mobile-app/src/screens/DashboardScreen.js"
with open(filepath, "r") as f:
    text = f.read()

replacement1 = """const { bearishDivergence, bullishDivergence } = useMarket();
  const adStats = advanceDecline?.stats || {};
  const renderSmartActionCard = () => {
    const tradeZone = tradeGateAnalysis?.zone || {};
    if (bearishDivergence) return <View style={[styles.smartActionCard, { backgroundColor: theme.colors.bearishBg, borderColor: theme.colors.bearishBorder }]}><Ionicons name="warning" size={20} color={theme.colors.bearish} /><View style={styles.smartActionTextContainer}><Text style={[styles.smartActionTitle, { color: theme.colors.bearish }]}>BEARISH DIVERGENCE</Text><Text style={styles.smartActionDesc}>Spot price rising but Call OI is dominating. High Trap Risk.</Text></View></View>;
    if (bullishDivergence) return <View style={[styles.smartActionCard, { backgroundColor: theme.colors.bullishBg, borderColor: theme.colors.bullishBorder }]}><Ionicons name="warning" size={20} color={theme.colors.bullish} /><View style={styles.smartActionTextContainer}><Text style={[styles.smartActionTitle, { color: theme.colors.bullish }]}>BULLISH DIVERGENCE</Text><Text style={styles.smartActionDesc}>Spot price falling but Put OI is dominating. Reversal likely.</Text></View></View>;
    if (tradeZone.zone === "Trap Zone") return <View style={[styles.smartActionCard, { backgroundColor: theme.colors.warning + "20", borderColor: theme.colors.warning }]}><Ionicons name="alert-circle" size={20} color={theme.colors.warning} /><View style={styles.smartActionTextContainer}><Text style={[styles.smartActionTitle, { color: theme.colors.warning }]}>TRAP ZONE DETECTED</Text><Text style={styles.smartActionDesc}>Do not trade. Wait for clean volume breakout.</Text></View></View>;
    return null;
  };"""

replacement2 = """<VitalSignsHUD marketData={marketData} />
        {renderSmartActionCard()}"""

text = text.replace("const adStats = advanceDecline?.stats || {};", replacement1)
text = text.replace("<VitalSignsHUD marketData={marketData} />", replacement2)

with open(filepath, "w") as f:
    f.write(text)
