import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMarket } from '../context/MarketContext';
import { IndexHeader } from '../components/IndexHeader';
import { THEME } from '../constants/theme';

export const PcrAnalyticsScreen = ({ onNavigate }) => {
  const {
    selectedIndex,
    marketData,
    pcrBuckets5m,
    pcrBuckets15m,
    pcrInterval,
    setPcrInterval,
    isLoading,
  } = useMarket();

  const [filterMode, setFilterMode] = useState('ALL'); // ALL, BULLISH, BEARISH

  const buckets = pcrInterval === 5 ? pcrBuckets5m : pcrBuckets15m;
  const pcr = Number(marketData?.pcr_oi || 1.0);
  const callOi = Number(marketData?.call_oi_total || 0);
  const putOi = Number(marketData?.put_oi_total || 0);
  const maxPain = marketData?.max_pain || marketData?.analytics?.max_pain || '-';
  const totalOi = callOi + putOi || 1;
  const putPercent = Math.round((putOi / totalOi) * 100);
  const callPercent = 100 - putPercent;

  const isBullish = pcr >= 1.05;
  const isBearish = pcr <= 0.95;

  const filteredBuckets = buckets.filter((b) => {
    if (filterMode === 'BULLISH') return b.optionSignal === 'BULLISH';
    if (filterMode === 'BEARISH') return b.optionSignal === 'BEARISH';
    return true;
  });

  return (
    <View style={styles.container}>
      <IndexHeader onOpenSettings={() => onNavigate && onNavigate('Settings')} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header Title Banner */}
        <View style={styles.titleBanner}>
          <View style={styles.titleRow}>
            <Ionicons name="bar-chart" size={20} color={THEME.colors.primary} />
            <Text style={styles.pageTitle}>{selectedIndex} PCR & OI ANALYTICS</Text>
          </View>
          <Text style={styles.pageSubtitle}>Real-time 5m & 15m Time-Series & Sentiment Tracking</Text>
        </View>

        {/* PCR Sentiment Gauge Cards */}
        <View style={styles.gaugeContainer}>
          <View style={[styles.gaugeCard, isBullish ? styles.bullishBorder : isBearish ? styles.bearishBorder : null]}>
            <Text style={styles.gaugeLabel}>LIVE PCR (OI RATIO)</Text>
            <Text style={[styles.gaugeValue, { color: isBullish ? THEME.colors.bullish : isBearish ? THEME.colors.bearish : THEME.colors.warning }]}>
              {pcr.toFixed(2)}
            </Text>
            <View style={[styles.badge, { backgroundColor: isBullish ? 'rgba(34, 197, 94, 0.15)' : isBearish ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)' }]}>
              <Text style={[styles.badgeText, { color: isBullish ? THEME.colors.bullish : isBearish ? THEME.colors.bearish : THEME.colors.warning }]}>
                {isBullish ? '🟢 BULLISH BIAS' : isBearish ? '🔴 BEARISH BIAS' : '🟡 NEUTRAL / RANGE'}
              </Text>
            </View>
          </View>

          <View style={styles.gaugeCard}>
            <Text style={styles.gaugeLabel}>MAX PAIN STRIKE</Text>
            <Text style={styles.maxPainValue}>{maxPain}</Text>
            <Text style={styles.subDetail}>Expiry Magnet Level</Text>
          </View>
        </View>

        {/* Call vs Put OI Tug-of-War Bar */}
        <View style={styles.oiBarCard}>
          <View style={styles.oiBarHeader}>
            <View style={styles.oiSide}>
              <Text style={styles.oiSideLabel}>CALL OI (Resistance)</Text>
              <Text style={styles.ceOiVal}>{(callOi / 100000).toFixed(1)}L ({callPercent}%)</Text>
            </View>
            <View style={[styles.oiSide, { alignItems: 'flex-end' }]}>
              <Text style={styles.oiSideLabel}>PUT OI (Support)</Text>
              <Text style={styles.peOiVal}>{(putOi / 100000).toFixed(1)}L ({putPercent}%)</Text>
            </View>
          </View>

          <View style={styles.progressBarBg}>
            <View style={[styles.ceProgress, { width: `${callPercent}%` }]} />
            <View style={[styles.peProgress, { width: `${putPercent}%` }]} />
          </View>
        </View>

        {/* Interval Selector & Filters */}
        <View style={styles.controlsRow}>
          <View style={styles.intervalGroup}>
            <TouchableOpacity
              style={[styles.intervalBtn, pcrInterval === 5 && styles.intervalBtnActive]}
              onPress={() => setPcrInterval(5)}
            >
              <Text style={[styles.intervalBtnText, pcrInterval === 5 && styles.intervalBtnTextActive]}>5 Min</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.intervalBtn, pcrInterval === 15 && styles.intervalBtnActive]}
              onPress={() => setPcrInterval(15)}
            >
              <Text style={[styles.intervalBtnText, pcrInterval === 15 && styles.intervalBtnTextActive]}>15 Min</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.filterGroup}>
            {['ALL', 'BULLISH', 'BEARISH'].map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterBtn, filterMode === f && styles.filterBtnActive]}
                onPress={() => setFilterMode(f)}
              >
                <Text style={[styles.filterBtnText, filterMode === f && styles.filterBtnTextActive]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* PCR Time Series Table */}
        <View style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { flex: 1.2 }]}>Time</Text>
            <Text style={[styles.th, { flex: 1.4, textAlign: 'right' }]}>Spot</Text>
            <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>PCR</Text>
            <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>Trend</Text>
            <Text style={[styles.th, { flex: 1.6, textAlign: 'right' }]}>Signal</Text>
          </View>

          {filteredBuckets.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="time-outline" size={28} color={THEME.colors.textMuted} />
              <Text style={styles.emptyText}>Collecting {pcrInterval}m PCR ticks...</Text>
            </View>
          ) : (
            filteredBuckets.map((row, idx) => {
              const rowBull = row.pcr >= 1.05;
              const rowBear = row.pcr <= 0.95;
              return (
                <View key={idx} style={[styles.tableRow, idx % 2 === 0 && styles.rowAlt]}>
                  <Text style={[styles.tdTime, { flex: 1.2 }]}>{row.timeLabel}</Text>
                  <Text style={[styles.tdSpot, { flex: 1.4 }]}>{Number(row.spot || 0).toLocaleString('en-IN')}</Text>
                  <Text style={[styles.tdPcr, { flex: 1.2, color: rowBull ? THEME.colors.bullish : rowBear ? THEME.colors.bearish : THEME.colors.textSecondary }]}>
                    {Number(row.pcr || 0).toFixed(2)}
                  </Text>
                  <View style={[styles.trendCell, { flex: 1 }]}>
                    <Ionicons
                      name={row.pcrTrend === 'UP' ? 'caret-up' : row.pcrTrend === 'DOWN' ? 'caret-down' : 'remove'}
                      size={14}
                      color={row.pcrTrend === 'UP' ? THEME.colors.bullish : row.pcrTrend === 'DOWN' ? THEME.colors.bearish : THEME.colors.textMuted}
                    />
                  </View>
                  <View style={[styles.signalCell, { flex: 1.6 }]}>
                    <Text style={[styles.signalText, { color: row.optionSignal === 'BULLISH' ? THEME.colors.bullish : row.optionSignal === 'BEARISH' ? THEME.colors.bearish : THEME.colors.textMuted }]}>
                      {row.optionSignal}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.bgDark,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 40,
  },
  titleBanner: {
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pageTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  pageSubtitle: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  gaugeContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  gaugeCard: {
    flex: 1,
    backgroundColor: THEME.colors.bgCard,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
    alignItems: 'center',
  },
  bullishBorder: {
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  bearishBorder: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  gaugeLabel: {
    color: THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  gaugeValue: {
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 6,
  },
  maxPainValue: {
    fontSize: 22,
    fontWeight: '900',
    color: THEME.colors.primary,
    marginBottom: 4,
  },
  subDetail: {
    color: THEME.colors.textMuted,
    fontSize: 10,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
  },
  oiBarCard: {
    backgroundColor: THEME.colors.bgCard,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
    marginBottom: 14,
  },
  oiBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  oiSide: {},
  oiSideLabel: {
    color: THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  ceOiVal: {
    color: THEME.colors.bearish,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  peOiVal: {
    color: THEME.colors.bullish,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  progressBarBg: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0f2738',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  ceProgress: {
    backgroundColor: THEME.colors.bearish,
    height: '100%',
  },
  peProgress: {
    backgroundColor: THEME.colors.bullish,
    height: '100%',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  intervalGroup: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.bgCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
    padding: 2,
  },
  intervalBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  intervalBtnActive: {
    backgroundColor: THEME.colors.primary,
  },
  intervalBtnText: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  intervalBtnTextActive: {
    color: '#071a26',
    fontWeight: '900',
  },
  filterGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  filterBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: THEME.colors.bgCard,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
  },
  filterBtnActive: {
    borderColor: THEME.colors.primary,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  filterBtnText: {
    color: THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  filterBtnTextActive: {
    color: THEME.colors.primary,
    fontWeight: '900',
  },
  tableCard: {
    backgroundColor: THEME.colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderLight,
  },
  th: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  rowAlt: {
    backgroundColor: 'rgba(255, 255, 255, 0.015)',
  },
  tdTime: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  tdSpot: {
    color: THEME.colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  tdPcr: {
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  trendCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  signalCell: {
    alignItems: 'flex-end',
  },
  signalText: {
    fontSize: 10,
    fontWeight: '800',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    gap: 8,
  },
  emptyText: {
    color: THEME.colors.textMuted,
    fontSize: 12,
  },
});
