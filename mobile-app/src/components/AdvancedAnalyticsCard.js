import React from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export const AdvancedAnalyticsCard = ({ analytics }) => {
  const { theme } = useTheme();
  const styles = getStyles(theme);

  if (!analytics) return null;

  const smartOIFlow = analytics.smartOIFlow || {};
  const gamma = analytics.gammaExposure || {};
  const regime = analytics.marketRegime || {};

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
