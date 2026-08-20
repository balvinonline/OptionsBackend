import React from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export const AdvancedAnalyticsCard = ({ analytics, marketData }) => {
  const { theme } = useTheme();
  const styles = getStyles(theme);

  if (!analytics && !marketData) return null;

  const smartOIFlow = analytics?.smartOIFlow || {};
  const gamma = analytics?.gammaExposure || {};
  const regime = analytics?.marketRegime || {};
  
  // Calculate Support / Resistance from chain
  let resistanceStrike = '-';
  let supportStrike = '-';
  let maxPain = analytics?.maxPain || marketData?.max_pain || '-';
  
  if (marketData?.chain && marketData.chain.length > 0) {
    let maxCeOi = 0;
    let maxPeOi = 0;
    let resStrike = 0;
    let supStrike = 0;
    
    marketData.chain.forEach(row => {
      const ceOi = Number(row.ce_oi || row.oi_CE || 0);
      const peOi = Number(row.pe_oi || row.oi_PE || 0);
      if (ceOi > maxCeOi) { maxCeOi = ceOi; resStrike = row.strike; }
      if (peOi > maxPeOi) { maxPeOi = peOi; supStrike = row.strike; }
    });
    
    if (resStrike > 0) resistanceStrike = resStrike;
    if (supStrike > 0) supportStrike = supStrike;
  }

  const renderBadge = (label, colorStr) => {
    let color = theme.colors.textMuted;
    if (colorStr?.toLowerCase().includes('bull') || colorStr?.toLowerCase().includes('long')) {
      color = theme.colors.bullish;
    } else if (colorStr?.toLowerCase().includes('bear') || colorStr?.toLowerCase().includes('short')) {
      color = theme.colors.bearish;
    }
    
    return (
      <View style={[styles.badge, { borderColor: color }]}>
        <Text style={[styles.badgeText, { color }]}>{label || 'Neutral'}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>ADVANCED ANALYTICS</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Key Levels (Support / Resistance / Max Pain) */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="stats-chart" size={16} color={theme.colors.primary} />
            <Text style={styles.cardTitle}>OI Walls & Key Levels</Text>
          </View>
          <View style={styles.cardBody}>
            <View style={styles.row}>
              <Text style={styles.label}>Resistance (Call OI)</Text>
              <Text style={[styles.value, { color: theme.colors.bearish }]}>{resistanceStrike}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Support (Put OI)</Text>
              <Text style={[styles.value, { color: theme.colors.bullish }]}>{supportStrike}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Max Pain</Text>
              <Text style={[styles.value, { color: theme.colors.warning }]}>{maxPain}</Text>
            </View>
          </View>
        </View>

        {/* Multi-Timeframe Trend */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="time" size={16} color={theme.colors.primary} />
            <Text style={styles.cardTitle}>MTF Trend Matrix</Text>
          </View>
          <View style={styles.cardBody}>
            <View style={styles.row}>
              <Text style={styles.label}>5-Minute</Text>
              {renderBadge(marketData?.trend || 'Neutral', marketData?.trend)}
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>15-Minute</Text>
              {renderBadge(marketData?.technical_levels?.fifteenTrend || 'Neutral', marketData?.technical_levels?.fifteenTrend)}
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Daily (HTF)</Text>
              {renderBadge(marketData?.technical_levels?.dailyTrend || 'Neutral', marketData?.technical_levels?.dailyTrend)}
            </View>
          </View>
        </View>

        {/* Previous Day & Gap Analysis */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="alert-circle" size={16} color={theme.colors.primary} />
            <Text style={styles.cardTitle}>Gap & Prev Day Levels</Text>
          </View>
          <View style={styles.cardBody}>
            <View style={styles.row}>
              <Text style={styles.label}>Gap Status</Text>
              {(() => {
                const changePct = Number(marketData?.spot?.change_pct || 0);
                if (changePct > 0.5) return renderBadge(`+${changePct}% Gap Up (Fade Risk)`, 'bearish');
                if (changePct < -0.5) return renderBadge(`${changePct}% Gap Down (Bounce)`, 'bullish');
                return renderBadge('Flat Open', 'neutral');
              })()}
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Prev High</Text>
              <Text style={[styles.value, { color: theme.colors.warning }]}>
                {marketData?.analytics?.previousDayLevels?.high || '-'}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Prev Low</Text>
              <Text style={[styles.value, { color: theme.colors.warning }]}>
                {marketData?.analytics?.previousDayLevels?.low || '-'}
              </Text>
            </View>
          </View>
        </View>

        {/* Smart OI Flow */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="water" size={16} color={theme.colors.primary} />
            <Text style={styles.cardTitle}>Smart OI Flow</Text>
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.label}>Trend</Text>
            {renderBadge(smartOIFlow.flow_trend, smartOIFlow.flow_trend)}
            
            <View style={styles.row}>
              <Text style={styles.label}>Call Flow</Text>
              <Text style={styles.value}>{smartOIFlow.call_flow || '-'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Put Flow</Text>
              <Text style={styles.value}>{smartOIFlow.put_flow || '-'}</Text>
            </View>
          </View>
        </View>

        {/* Market Regime */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="compass" size={16} color={theme.colors.primary} />
            <Text style={styles.cardTitle}>Market Regime</Text>
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.label}>Current Regime</Text>
            {renderBadge(regime.regime, regime.regime)}
            
            <View style={styles.row}>
              <Text style={styles.label}>Volatility</Text>
              <Text style={styles.value}>{regime.volatility_context || '-'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Conviction</Text>
              <Text style={styles.value}>{regime.conviction || '-'}</Text>
            </View>
          </View>
        </View>

        {/* Gamma Exposure */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="magnet" size={16} color={theme.colors.primary} />
            <Text style={styles.cardTitle}>Gamma Exposure</Text>
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.label}>Profile</Text>
            {renderBadge(gamma.profile, gamma.profile)}
            
            <View style={styles.row}>
              <Text style={styles.label}>Total GEX</Text>
              <Text style={[styles.value, { color: Number(gamma.total_gex) > 0 ? theme.colors.bullish : theme.colors.bearish }]}>
                {gamma.total_gex ? Number(gamma.total_gex).toLocaleString() : '-'}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Flip Point</Text>
              <Text style={styles.value}>{gamma.flip_strike || '-'}</Text>
            </View>
          </View>
        </View>

      </ScrollView>
    </View>
  );
};

const getStyles = (theme) => StyleSheet.create({
  container: {
    marginTop: 18,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.textMuted,
    marginHorizontal: 14,
    marginBottom: 8,
  },
  scrollContent: {
    paddingHorizontal: 14,
    gap: 12,
  },
  card: {
    backgroundColor: theme.colors.bgCardSolid,
    borderRadius: 12,
    padding: 12,
    width: 200,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    paddingBottom: 8,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  cardBody: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 10,
    color: theme.colors.textSecondary,
  },
  value: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  badge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 4,
    backgroundColor: theme.colors.bgApp,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
});
