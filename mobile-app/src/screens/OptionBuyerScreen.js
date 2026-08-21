import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useMarket } from '../context/MarketContext';
import { Ionicons } from '@expo/vector-icons';
import { IndexHeader } from '../components/IndexHeader';
import { OrderExecutionModal } from '../components/OrderExecutionModal';

export const OptionBuyerScreen = ({ onNavigate }) => {
  const { theme } = useTheme();
  const { marketData, liveGreeks, whaleAlerts, bearishDivergence, bullishDivergence } = useMarket();
  const styles = getStyles(theme);
  const [selectedOption, setSelectedOption] = useState(null);

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
    if (priceChange < 0 && oiChange > 0) return { text: `${side} Writing`, color: theme.colors.bearish };
    if (priceChange > 0 && oiChange < 0) return { text: `${side} Unwinding`, color: theme.colors.primary };
    if (priceChange > 0 && oiChange > 0) return { text: `${side} Long`, color: theme.colors.bullish };
    if (priceChange < 0 && oiChange < 0) return { text: `${side} Long Unwind`, color: theme.colors.warning };
    return null;
  };

  return (
    <View style={styles.container}>
      <IndexHeader />
      <ScrollView style={styles.scrollArea}>
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
        <View style={[
          styles.warningBanner, 
          { 
            backgroundColor: bearishDivergence ? theme.colors.bearishBg || 'rgba(239,83,80,0.1)' : theme.colors.bullishBg || 'rgba(38,166,154,0.1)', 
            borderColor: bearishDivergence ? theme.colors.bearish : theme.colors.bullish 
          }
        ]}>
          <Ionicons name="warning" size={20} color={bearishDivergence ? theme.colors.bearish : theme.colors.bullish} style={{ marginRight: 8 }} />
          <Text style={[styles.warningText, { color: bearishDivergence ? theme.colors.bearish : theme.colors.bullish }]}>
            {bearishDivergence ? 'BEARISH PCR DIVERGENCE: Trap Risk' : 'BULLISH PCR DIVERGENCE: Trap Risk'}
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
          
          let isAtm = false;
          if (marketData?.spot?.ltp) {
            let closestIdx = 0;
            let minDiff = Infinity;
            chain.forEach((r, idx) => {
              const diff = Math.abs(r.strike - marketData.spot.ltp);
              if (diff < minDiff) {
                minDiff = diff;
                closestIdx = idx;
              }
            });
            isAtm = row.strike === chain[closestIdx]?.strike;
          }

          const isCeHighVolume = row.ce_volume > (row.ce_oi * 2) && row.ce_volume > 50000;
          const isPeHighVolume = row.pe_volume > (row.pe_oi * 2) && row.pe_volume > 50000;
          
          return (
            <View key={row.strike} style={[styles.chainRow, isMaxPain && styles.maxPainRow, isAtm && styles.atmRow]}>
              <TouchableOpacity 
                style={styles.chainColSignal}
                onPress={() => setSelectedOption({ symbol: row.ce_symbol || row.symbol_CE, ltp: row.ce_ltp, side: 'CE' })}
              >
                <Text style={[styles.chainCol, { color: theme.colors.bullish }]}>{row.ce_ltp?.toFixed(2) || '-'} {isCeHighVolume ? '⚡' : ''}</Text>
                <Text style={styles.greekText}>Δ: {ceGreek.delta.toFixed(2)} | Θ: {ceGreek.theta.toFixed(2)} {ceGreek.gamma >= 0.005 ? '🔥' : ''}</Text>
                {ceSignal && <Text style={[styles.signalBadge, { backgroundColor: ceSignal.color }]}>{ceSignal.text}</Text>}
              </TouchableOpacity>
              
              <View style={styles.chainColStrikeContainer}>
                <Text style={[styles.chainColStrike, isAtm && styles.atmStrikeText]}>{row.strike}</Text>
                {isAtm && <Text style={styles.atmBadge}>ATM</Text>}
              </View>
              
              <TouchableOpacity 
                style={styles.chainColSignal}
                onPress={() => setSelectedOption({ symbol: row.pe_symbol || row.symbol_PE, ltp: row.pe_ltp, side: 'PE' })}
              >
                <Text style={[styles.chainCol, { color: theme.colors.bearish }]}>{row.pe_ltp?.toFixed(2) || '-'} {isPeHighVolume ? '⚡' : ''}</Text>
                <Text style={styles.greekText}>Δ: {peGreek.delta.toFixed(2)} | Θ: {peGreek.theta.toFixed(2)} {peGreek.gamma >= 0.005 ? '🔥' : ''}</Text>
                {peSignal && <Text style={[styles.signalBadge, { backgroundColor: peSignal.color }]}>{peSignal.text}</Text>}
              </TouchableOpacity>
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
    <OrderExecutionModal 
      visible={!!selectedOption} 
      optionData={selectedOption} 
      onClose={() => setSelectedOption(null)} 
    />
  </View>
  );
};

const getStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgDark,
  },
  scrollArea: {
    flex: 1,
    padding: 14,
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
    backgroundColor: theme.colors.bgCardSolid,
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
    backgroundColor: theme.colors.bgCardSolid,
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
    backgroundColor: theme.colors.bgCardSolid,
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
  atmRow: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  chainColStrikeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  atmStrikeText: {
    color: theme.colors.primary,
  },
  atmBadge: {
    fontSize: 8,
    color: theme.colors.primary,
    fontWeight: 'bold',
    marginTop: 2,
  },
  warningBanner: { flexDirection: 'row',
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
