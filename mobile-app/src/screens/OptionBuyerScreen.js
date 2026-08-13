import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useMarket } from '../context/MarketContext';

export const OptionBuyerScreen = ({ onNavigate }) => {
  const { theme } = useTheme();
  const { marketData, liveGreeks, whaleAlerts, bearishDivergence, bullishDivergence } = useMarket();
  const styles = getStyles(theme);

  const chain = marketData?.chain || [];
  const spot = marketData?.spot || 0;
  
  // Find ATM strike index
  let atmIndex = -1;
  let minDiff = Infinity;
  chain.forEach((row, idx) => {
    const diff = Math.abs(row.strike - spot);
    if (diff < minDiff) {
      minDiff = diff;
      atmIndex = idx;
    }
  });

  // Top 5 ITM/OTM calls and puts around ATM
  const startIdx = Math.max(0, atmIndex - 5);
  const endIdx = Math.min(chain.length, atmIndex + 6);
  const displayChain = chain.slice(startIdx, endIdx);

  const getSignal = (priceChange, oiChange, side) => {
    if (priceChange == null || oiChange == null) return null;
    if (priceChange < 0 && oiChange > 0) return { text: `${side} Writing`, color: '#D50000' };
    if (priceChange > 0 && oiChange < 0) return { text: `${side} Unwinding`, color: '#2962FF' };
    if (priceChange > 0 && oiChange > 0) return { text: `${side} Long`, color: '#00C853' };
    if (priceChange < 0 && oiChange < 0) return { text: `${side} Long Unwind`, color: '#FF6D00' };
    return null;
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Option Buyer Hub</Text>
      
      {/* Momentum & IV Header */}
      <View style={styles.headerCards}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Momentum Meter</Text>
          <Text style={styles.cardValue}>Velocity: High</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>IV Status</Text>
          <Text style={styles.cardValue}>Spiking</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Intraday IV Rank</Text>
          <Text style={styles.cardValue}>{marketData?.analytics?.ivRank != null ? `${marketData.analytics.ivRank}%` : '-'}</Text>
        </View>
      </View>

      {/* Divergence Warning Banner */}
      {(bearishDivergence || bullishDivergence) && (
        <View style={[styles.warningBanner, { backgroundColor: bearishDivergence ? '#FFEBEE' : '#E8F5E9', borderColor: bearishDivergence ? '#D50000' : '#00C853' }]}>
          <Text style={[styles.warningText, { color: bearishDivergence ? '#D50000' : '#00C853' }]}>
            {bearishDivergence ? '⚠️ BEARISH PCR DIVERGENCE: Trap Risk' : '⚠️ BULLISH PCR DIVERGENCE: Trap Risk'}
          </Text>
        </View>
      )}

      {/* Buyer's Chain */}
      <Text style={styles.sectionTitle}>Buyer's Chain</Text>
      <View style={styles.chainContainer}>
        <View style={styles.chainRowHeader}>
          <Text style={styles.chainCol}>Call LTP</Text>
          <Text style={styles.chainColStrike}>Strike</Text>
          <Text style={styles.chainCol}>Put LTP</Text>
        </View>
        {displayChain.map((row) => {
          const ceSignal = getSignal(row.ce_ch, row.ce_oich, 'Call');
          const peSignal = getSignal(row.pe_ch, row.pe_oich, 'Put');
          const ceGreek = liveGreeks[row.ce_symbol] || { delta: 0, theta: 0, gamma: 0 };
          const peGreek = liveGreeks[row.pe_symbol] || { delta: 0, theta: 0, gamma: 0 };
          const maxPainValue = marketData?.analytics?.maxPain || marketData?.max_pain;
          const isMaxPain = row.strike === maxPainValue;
          const isCeHighVolume = row.ce_volume > (row.ce_oi * 2) && row.ce_volume > 0;
          const isPeHighVolume = row.pe_volume > (row.pe_oi * 2) && row.pe_volume > 0;
          
          return (
            <View key={row.strike} style={[styles.chainRow, isMaxPain && styles.maxPainRow]}>
              <View style={[styles.chainColSignal, isCeHighVolume && styles.highVolumeBg]}>
                <Text style={[styles.chainCol, { color: theme.colors.bullish }]}>{row.ce_ltp?.toFixed(2) || '-'}</Text>
                <Text style={styles.greekText}>Δ: {ceGreek.delta.toFixed(2)} | Θ: {ceGreek.theta.toFixed(2)} {ceGreek.gamma >= 0.005 ? '🔥' : ''}</Text>
                {ceSignal && <Text style={[styles.signalBadge, { backgroundColor: ceSignal.color }]}>{ceSignal.text}</Text>}
              </View>
              
              <Text style={styles.chainColStrike}>{row.strike}</Text>
              
              <View style={[styles.chainColSignal, isPeHighVolume && styles.highVolumeBg]}>
                <Text style={[styles.chainCol, { color: theme.colors.bearish }]}>{row.pe_ltp?.toFixed(2) || '-'}</Text>
                <Text style={styles.greekText}>Δ: {peGreek.delta.toFixed(2)} | Θ: {peGreek.theta.toFixed(2)} {peGreek.gamma >= 0.005 ? '🔥' : ''}</Text>
                {peSignal && <Text style={[styles.signalBadge, { backgroundColor: peSignal.color }]}>{peSignal.text}</Text>}
              </View>
            </View>
          );
        })}
      </View>

      {/* Whale Tracker Feed */}
      <Text style={styles.sectionTitle}>Whale Tracker Feed</Text>
      <View style={styles.whaleContainer}>
        {whaleAlerts && whaleAlerts.length > 0 ? (
          whaleAlerts.map((alert, index) => (
            <View key={index} style={styles.alertRow}>
              <Text style={styles.alertText}>{JSON.stringify(alert)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.noAlertsText}>No whale alerts yet.</Text>
        )}
      </View>
    </ScrollView>
  );
};

const getStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgDark,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 20,
  },
  headerCards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  card: {
    flex: 1,
    backgroundColor: theme.colors.surfaceLight,
    padding: 16,
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  cardTitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  cardValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginTop: 10,
    marginBottom: 10,
  },
  chainContainer: {
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  chainRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    paddingBottom: 8,
    marginBottom: 8,
  },
  chainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  chainCol: {
    textAlign: 'center',
    color: theme.colors.textPrimary,
  },
  chainColSignal: {
    flex: 1,
    alignItems: 'center',
  },
  signalBadge: {
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 10,
    color: 'white',
    fontWeight: 'bold',
    overflow: 'hidden',
  },
  greekText: {
    fontSize: 9,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  chainColStrike: {
    flex: 1,
    textAlign: 'center',
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  whaleContainer: {
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    marginBottom: 40,
  },
  alertRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  alertText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
  },
  noAlertsText: {
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 10,
  },
  maxPainRow: {
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#FFD700',
    backgroundColor: 'rgba(255, 215, 0, 0.05)',
  },
  highVolumeBg: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderRadius: 4,
  },
  warningBanner: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    alignItems: 'center',
  },
  warningText: {
    fontWeight: 'bold',
    fontSize: 14,
  }
});
