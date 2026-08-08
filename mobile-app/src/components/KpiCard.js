import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/theme';

export const KpiCard = ({ data, atm }) => {
  const spot = Number(data?.spot || 0);
  const change = Number(data?.change || 0);
  const pctChange = Number(data?.pChange || data?.pct_change || 0);
  const isPositive = change >= 0;

  const pcr = Number(data?.pcr_oi || 0);
  const vix = Number(data?.vix || 0);
  const callOi = Number(data?.call_oi_total || 0);
  const putOi = Number(data?.put_oi_total || 0);

  const formatNumber = (val) => {
    if (!val || isNaN(val)) return '-';
    return Number(val).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  };

  const formatOi = (val) => {
    if (!val || isNaN(val)) return '-';
    if (val >= 10000000) return (val / 10000000).toFixed(2) + ' Cr';
    if (val >= 100000) return (val / 100000).toFixed(2) + ' L';
    return Number(val).toLocaleString('en-IN');
  };

  return (
    <View style={styles.container}>
      {/* Spot Price Big Header */}
      <View style={styles.spotRow}>
        <View>
          <Text style={styles.spotLabel}>{data?.symbol || 'INDEX'} SPOT</Text>
          <Text style={styles.spotValue}>{spot > 0 ? formatNumber(spot) : 'Loading...'}</Text>
        </View>

        <View style={[styles.badge, isPositive ? styles.badgeBullish : styles.badgeBearish]}>
          <Ionicons
            name={isPositive ? 'arrow-up' : 'arrow-down'}
            size={14}
            color={isPositive ? THEME.colors.bullish : THEME.colors.bearish}
          />
          <Text style={[styles.badgeText, { color: isPositive ? THEME.colors.bullish : THEME.colors.bearish }]}>
            {change > 0 ? `+${formatNumber(change)}` : formatNumber(change)} ({pctChange.toFixed(2)}%)
          </Text>
        </View>
      </View>

      {/* Grid of Key Metrics */}
      <View style={styles.grid}>
        <MetricTile
          label="PCR (OI)"
          value={pcr > 0 ? pcr.toFixed(2) : '-'}
          color={pcr >= 1.05 ? THEME.colors.bullish : pcr <= 0.95 ? THEME.colors.bearish : THEME.colors.warning}
          subtitle={pcr >= 1.05 ? 'Bullish' : pcr <= 0.95 ? 'Bearish' : 'Neutral'}
        />

        <MetricTile
          label="India VIX"
          value={vix > 0 ? vix.toFixed(2) : '-'}
          color={vix > 16 ? THEME.colors.bearish : THEME.colors.primary}
          subtitle={vix > 16 ? 'High Volatility' : 'Normal'}
        />

        <MetricTile
          label="ATM Strike"
          value={atm ? formatNumber(atm) : '-'}
          color={THEME.colors.primaryLight}
        />

        <MetricTile
          label="Total PE OI"
          value={formatOi(putOi)}
          color={THEME.colors.bullish}
          subtitle="Support OI"
        />

        <MetricTile
          label="Total CE OI"
          value={formatOi(callOi)}
          color={THEME.colors.bearish}
          subtitle="Resistance OI"
        />

        <MetricTile
          label="OI Diff (PE - CE)"
          value={formatOi(putOi - callOi)}
          color={putOi >= callOi ? THEME.colors.bullish : THEME.colors.bearish}
        />
      </View>
    </View>
  );
};

const MetricTile = ({ label, value, color, subtitle }) => (
  <View style={styles.tile}>
    <Text style={styles.tileLabel}>{label}</Text>
    <Text style={[styles.tileValue, { color: color || THEME.colors.textPrimary }]}>{value}</Text>
    {subtitle ? <Text style={styles.tileSubtitle}>{subtitle}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: THEME.colors.bgCardSolid,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    ...THEME.shadows.card,
  },
  spotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderLight,
  },
  spotLabel: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  spotValue: {
    color: THEME.colors.textPrimary,
    fontSize: 26,
    fontWeight: '900',
    marginTop: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 4,
  },
  badgeBullish: {
    backgroundColor: THEME.colors.bullishBg,
    borderWidth: 1,
    borderColor: THEME.colors.bullishBorder,
  },
  badgeBearish: {
    backgroundColor: THEME.colors.bearishBg,
    borderWidth: 1,
    borderColor: THEME.colors.bearishBorder,
  },
  badgeText: {
    fontWeight: '800',
    fontSize: 13,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  tile: {
    width: '31%',
    backgroundColor: THEME.colors.bgCard,
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
  },
  tileLabel: {
    color: THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  tileValue: {
    fontSize: 14,
    fontWeight: '900',
    marginTop: 3,
  },
  tileSubtitle: {
    color: THEME.colors.textMuted,
    fontSize: 9,
    marginTop: 2,
  },
});
