import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useMarket } from '../context/MarketContext';

export const PcrAnalyticsScreen = ({ onNavigate }) => {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const { pcrBuckets5m, pcrBuckets15m, selectedIndex, marketData } = useMarket();

  // Pick whichever bucket has data, fallback to empty array
  const buckets = pcrBuckets5m?.length > 0 ? pcrBuckets5m : (pcrBuckets15m || []);

  const getPcrColor = (pcr) => {
    if (pcr >= 1.1) return theme.colors.bullish;
    if (pcr <= 0.9) return theme.colors.bearish;
    return theme.colors.primary;
  };

  const getTrendIcon = (trend) => {
    if (trend === 'UP') return <Ionicons name="trending-up" size={16} color={theme.colors.bullish} />;
    if (trend === 'DOWN') return <Ionicons name="trending-down" size={16} color={theme.colors.bearish} />;
    return <Ionicons name="remove" size={16} color={theme.colors.textMuted} />;
  };

  const currentPcr = marketData?.pcr_oi ? Number(marketData.pcr_oi).toFixed(2) : '1.00';

  const getSignalMeta = (bucket = {}) => {
    const raw = String(bucket.optSignal || bucket.optionSignal || '').toUpperCase();
    if (raw.includes('BULL') || raw.includes('CE')) {
      return { tone: 'bullish', label: 'BUY CE' };
    }
    if (raw.includes('BEAR') || raw.includes('PE')) {
      return { tone: 'bearish', label: 'BUY PE' };
    }
    return { tone: 'neutral', label: 'WAIT' };
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => onNavigate('Dashboard')} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{selectedIndex} PCR ANALYTICS</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.livePcrText}>LIVE PCR:</Text>
          <Text style={[styles.livePcrValue, { color: getPcrColor(Number(currentPcr)) }]}>{currentPcr}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {buckets.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="bar-chart-outline" size={48} color={theme.colors.borderLight} />
            <Text style={styles.emptyText}>Gathering PCR Data...</Text>
            <Text style={styles.emptySubText}>Waiting for the first 5-minute bucket</Text>
          </View>
        ) : (
          <View style={styles.tableContainer}>
            {/* Table Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 1.2 }]}>TIME</Text>
              <Text style={[styles.th, { flex: 1.5, textAlign: 'center' }]}>SPOT</Text>
              <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>PCR</Text>
              <Text style={[styles.th, { flex: 1.2, textAlign: 'center' }]}>VWAP</Text>
              <Text style={[styles.th, { flex: 1.5, textAlign: 'right' }]}>SIGNAL</Text>
            </View>

            {/* Table Rows */}
            {buckets.map((b, idx) => {
              const signal = getSignalMeta(b);
              const timeStr = b.timeLabel || (b.bucketTs || b.ts ? new Date(b.bucketTs || b.ts).toLocaleTimeString("en-IN", { hour12: false, hour: '2-digit', minute: '2-digit' }) : '-');
              const spotVal = b.spot || b.price || 0;
              const pcrVal = b.pcr || b.value || 0;
              const vwapSig = b.vwapSignal || b.vwapBias || '-';
              let vwapShort = vwapSig;
              if (vwapSig.includes('ABOVE')) vwapShort = 'ABOVE';
              else if (vwapSig.includes('BELOW')) vwapShort = 'BELOW';
              const vwapColor = vwapShort === 'ABOVE' ? theme.colors.bullish : vwapShort === 'BELOW' ? theme.colors.bearish : theme.colors.textMuted;
              
              return (
                <View key={idx} style={styles.tableRow}>
                  <View style={[styles.td, { flex: 1.2, flexDirection: 'row', alignItems: 'center' }]}>
                    <Text style={styles.timeText}>{timeStr}</Text>
                  </View>

                  <View style={[styles.td, { flex: 1.5, alignItems: 'center' }]}>
                    <Text style={styles.spotText}>{Number(spotVal).toFixed(1)}</Text>
                  </View>

                  <View style={[styles.td, { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 }]}>
                    <Text style={[styles.pcrText, { color: getPcrColor(pcrVal) }]}>{Number(pcrVal).toFixed(2)}</Text>
                  </View>

                  <View style={[styles.td, { flex: 1.2, alignItems: 'center' }]}>
                    <Text style={{ color: vwapColor, fontSize: 11, fontWeight: '700' }}>{vwapShort}</Text>
                  </View>

                  <View style={[styles.td, { flex: 1.5, alignItems: 'flex-end', justifyContent: 'center' }]}>
                    <View style={[
                      styles.signalBadge,
                      signal.tone === 'bullish' ? styles.badgeBullish : signal.tone === 'bearish' ? styles.badgeBearish : styles.badgeNeutral
                    ]}>
                      <Text style={[
                        styles.signalText,
                        signal.tone === 'bullish' ? styles.signalTextBullish : signal.tone === 'bearish' ? styles.signalTextBearish : styles.signalTextNeutral
                      ]}>
                        {signal.label}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const getStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgDark,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.bgDark,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: theme.colors.textPrimary,
    letterSpacing: 0.5,
  },
  backBtn: {
    marginRight: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.bgCardSolid,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  livePcrText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  livePcrValue: {
    fontSize: 14,
    fontWeight: '900',
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 40,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  emptySubText: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  tableContainer: {
    backgroundColor: theme.colors.bgCardSolid,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#0c2436', // Slightly distinct header
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  th: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    alignItems: 'center',
  },
  td: {
    justifyContent: 'center',
  },
  timeText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  spotText: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  pcrText: {
    fontSize: 14,
    fontWeight: '900',
  },
  signalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeBullish: {
    backgroundColor: theme.colors.bullishBg,
    borderColor: theme.colors.bullishBorder,
  },
  badgeBearish: {
    backgroundColor: theme.colors.bearishBg,
    borderColor: theme.colors.bearishBorder,
  },
  badgeNeutral: {
    backgroundColor: theme.colors.bgDark,
    borderColor: theme.colors.borderLight,
  },
  signalText: {
    fontSize: 10,
    fontWeight: '800',
  },
  signalTextBullish: {
    color: theme.colors.bullish,
  },
  signalTextBearish: {
    color: theme.colors.bearish,
  },
  signalTextNeutral: {
    color: theme.colors.textSecondary,
  },
});
