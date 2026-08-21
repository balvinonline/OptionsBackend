import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { getApiBaseUrl } from '../services/api';
import { OptionChainRow } from '../components/OptionChainRow';
import { AdvancedAnalyticsCard } from '../components/AdvancedAnalyticsCard';
import { CandlestickChart } from '../components/CandlestickChart';
import { OiBarChart } from '../components/OiBarChart';

export const StockDeskScreen = ({ symbol, onBack }) => {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDetail = useCallback(async (isBackground = false) => {
    if (!symbol) return;
    if (!isBackground) setLoading(true);
    setError(null);
    try {
      const serverUrl = getApiBaseUrl();
      const res = await fetch(`${serverUrl}/api/stock-options?symbol=${symbol}`);
      const data = await res.json();
      
      if (data && data.symbol) {
        setDetail(data);
      } else if (data.error) {
        setError(data.error);
      } else {
        setError('Failed to load detail');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchDetail(false);
    const intervalId = setInterval(() => {
      fetchDetail(true);
    }, 5000);
    return () => clearInterval(intervalId);
  }, [fetchDetail]);

  const atmLtp = detail?.spot?.ltp ? Number(detail.spot.ltp) : 0;
  
  // Trim chainRows to ATM +/- 5 strikes
  let chainRows = detail?.optionChain || [];
  let atmStrike = 0;
  if (chainRows.length > 0 && atmLtp > 0) {
    let closestIdx = 0;
    let minDiff = Infinity;
    chainRows.forEach((row, idx) => {
      const diff = Math.abs(row.strike - atmLtp);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
        atmStrike = row.strike;
      }
    });
    const startIdx = Math.max(0, closestIdx - 5);
    const endIdx = Math.min(chainRows.length, closestIdx + 6);
    chainRows = chainRows.slice(startIdx, endIdx);
  }

  const levels = detail?.levels || {};
  const signal = detail?.signal || {};

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{symbol} OPTION DESK</Text>
        <View style={{ width: 24 }} />
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="warning" size={16} color={theme.colors.bearish} />
          <Text style={styles.errorBannerText}>{error}</Text>
          <TouchableOpacity onPress={fetchDetail}>
            <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '700' }}>RETRY</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {loading && !detail ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.loadingText}>Loading Desk...</Text>
          </View>
        ) : detail ? (
          <>
            {/* Spot & Future Pricing */}
            <View style={styles.priceCard}>
              <View style={styles.priceCol}>
                <Text style={styles.priceLabel}>SPOT (EQ)</Text>
                <Text style={styles.priceVal}>₹{detail.spot?.ltp ? Number(detail.spot.ltp).toFixed(2) : 'N/A'}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.priceCol}>
                <Text style={styles.priceLabel}>FUTURES</Text>
                <Text style={styles.priceVal}>₹{detail.future?.ltp ? Number(detail.future.ltp).toFixed(2) : 'N/A'}</Text>
              </View>
            </View>

            {/* Signal Ticket */}
            {signal.breakout_type && (
              <View style={[styles.signalCard, signal.breakout_type.includes('Bullish') ? styles.bullCard : styles.bearCard]}>
                <Text style={[styles.signalTitle, signal.breakout_type.includes('Bullish') ? styles.bullText : styles.bearText]}>
                  {signal.breakout_type.toUpperCase()}
                </Text>
                <Text style={styles.signalDesc}>{signal.message}</Text>
              </View>
            )}

            {/* Support / Resistance Levels */}
            {levels.resistance && levels.support && (
              <View style={styles.levelsCard}>
                <View style={styles.levelRow}>
                  <Text style={styles.levelLabel}>Call Resistance:</Text>
                  <Text style={[styles.levelVal, { color: theme.colors.bearish }]}>₹{levels.resistance}</Text>
                </View>
                <View style={styles.levelRow}>
                  <Text style={styles.levelLabel}>Put Support:</Text>
                  <Text style={[styles.levelVal, { color: theme.colors.bullish }]}>₹{levels.support}</Text>
                </View>
                <View style={styles.levelRow}>
                  <Text style={styles.levelLabel}>PCR OI:</Text>
                  <Text style={styles.levelVal}>{Number(detail.optionChain?.pcr_oi || 0).toFixed(2)}</Text>
                </View>
              </View>
            )}

            <CandlestickChart symbol={`NSE:${symbol}-EQ`} height={260} />
            
            {detail?.optionChain && detail.optionChain.length > 0 && (
              <OiBarChart chain={detail.optionChain} atm={atmStrike} />
            )}

            <View style={[styles.chainHeader, { marginTop: 12 }]}>
              <Text style={styles.sectionTitle}>Buyer's Chain ({chainRows.length} Strikes)</Text>
            </View>

            <View style={styles.chainContainer}>
              <View style={styles.chainRowHeader}>
                <Text style={styles.chainCol}>Call LTP</Text>
                <Text style={styles.chainColStrike}>Strike</Text>
                <Text style={styles.chainCol}>Put LTP</Text>
              </View>
              {chainRows.map((row) => {
                const getSignal = (priceChange, oiChange, side) => {
                  if (priceChange == null || oiChange == null) return null;
                  if (priceChange < 0 && oiChange > 0) return { text: `${side} Writing`, color: '#D50000' };
                  if (priceChange > 0 && oiChange < 0) return { text: `${side} Unwinding`, color: '#2962FF' };
                  if (priceChange > 0 && oiChange > 0) return { text: `${side} Long`, color: '#00C853' };
                  if (priceChange < 0 && oiChange < 0) return { text: `${side} Long Unwind`, color: '#FF6D00' };
                  return null;
                };

                const ceSignal = getSignal(row.ce_ch, row.ce_oich, 'Call');
                const peSignal = getSignal(row.pe_ch, row.pe_oich, 'Put');
                
                // For stocks, greeks are attached to the row directly by the backend
                const ceGreek = { delta: row.ce_delta || 0, theta: row.ce_theta || 0, gamma: row.ce_gamma || 0 };
                const peGreek = { delta: row.pe_delta || 0, theta: row.pe_theta || 0, gamma: row.pe_gamma || 0 };
                
                const maxPainValue = detail?.analytics?.maxPain || detail?.max_pain;
                const isMaxPain = row.strike === maxPainValue;
                const isAtm = row.strike === atmStrike;
                const isCeHighVolume = row.ce_volume > (row.ce_oi * 1.5) && row.ce_volume > 500;
                const isPeHighVolume = row.pe_volume > (row.pe_oi * 1.5) && row.pe_volume > 500;
                
                return (
                  <View key={row.strike} style={[styles.chainRow, isMaxPain && styles.maxPainRow, isAtm && styles.atmRow]}>
                    <View style={styles.chainColSignal}>
                      <Text style={[styles.chainCol, { color: theme.colors.bullish }]}>{row.ce_ltp?.toFixed(2) || '-'} {isCeHighVolume ? '⚡' : ''}</Text>
                      <Text style={styles.greekText}>Δ: {ceGreek.delta.toFixed(2)} | Θ: {ceGreek.theta.toFixed(2)} {ceGreek.gamma >= 0.005 ? '🔥' : ''}</Text>
                      {ceSignal && <Text style={[styles.signalBadge, { backgroundColor: ceSignal.color }]}>{ceSignal.text}</Text>}
                    </View>
                    
                    <View style={styles.chainColStrikeContainer}>
                      <Text style={[styles.chainColStrike, isAtm && styles.atmStrikeText]}>{row.strike}</Text>
                      {isAtm && <Text style={styles.atmBadge}>ATM</Text>}
                    </View>
                    
                    <View style={styles.chainColSignal}>
                      <Text style={[styles.chainCol, { color: theme.colors.bearish }]}>{row.pe_ltp?.toFixed(2) || '-'} {isPeHighVolume ? '⚡' : ''}</Text>
                      <Text style={styles.greekText}>Δ: {peGreek.delta.toFixed(2)} | Θ: {peGreek.theta.toFixed(2)} {peGreek.gamma >= 0.005 ? '🔥' : ''}</Text>
                      {peSignal && <Text style={[styles.signalBadge, { backgroundColor: peSignal.color }]}>{peSignal.text}</Text>}
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.bgDark,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    letterSpacing: 0.5,
  },
  backBtn: {
    padding: 4,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bearishBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.bearishBorder,
  },
  errorBannerText: {
    color: theme.colors.bearish,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  centerBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  priceCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.bgCardSolid,
    margin: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 16,
    justifyContent: 'space-between',
  },
  priceCol: {
    alignItems: 'center',
    flex: 1,
  },
  divider: {
    width: 1,
    backgroundColor: theme.colors.borderLight,
  },
  priceLabel: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginBottom: 4,
    fontWeight: '700',
  },
  priceVal: {
    fontSize: 18,
    color: theme.colors.textPrimary,
    fontWeight: '800',
  },
  signalCard: {
    marginHorizontal: 14,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
  },
  bullCard: {
    backgroundColor: theme.colors.bullishBg,
    borderColor: theme.colors.bullishBorder,
  },
  bearCard: {
    backgroundColor: theme.colors.bearishBg,
    borderColor: theme.colors.bearishBorder,
  },
  bullText: { color: theme.colors.bullish },
  bearText: { color: theme.colors.bearish },
  signalTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  signalDesc: {
    fontSize: 12,
    color: theme.colors.textPrimary,
  },
  levelsCard: {
    backgroundColor: theme.colors.bgCardSolid,
    marginHorizontal: 14,
    marginBottom: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 16,
    gap: 8,
  },
  levelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  levelLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  levelVal: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  chainHeader: {
    paddingHorizontal: 14,
    marginTop: 20,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textMuted,
    letterSpacing: 0.5,
  },
  chainContainer: {
    backgroundColor: theme.colors.bgCardSolid,
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    marginHorizontal: 14,
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
  chainLabels: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.colors.bgCardSolid,
    borderBottomWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  chainLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.colors.textMuted,
  },
  chainContainer: {
    paddingHorizontal: 14,
  }
});
