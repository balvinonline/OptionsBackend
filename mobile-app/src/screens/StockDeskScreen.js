import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { getApiBaseUrl } from '../services/api';
import { OptionChainRow } from '../components/OptionChainRow';
import { AdvancedAnalyticsCard } from '../components/AdvancedAnalyticsCard';
import { CandlestickChart } from '../components/CandlestickChart';

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

  const atm = detail?.spot ? detail.spot : 0;
  
  // Trim chainRows to ATM +/- 5 strikes
  let chainRows = detail?.optionChain || [];
  let maxOi = 0;
  if (chainRows.length > 0 && atm > 0) {
    let closestIdx = 0;
    let minDiff = Infinity;
    chainRows.forEach((row, idx) => {
      const diff = Math.abs(row.strike - atm);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
      
      const cOi = Number(row.ce_oi || row.oi_CE || 0);
      const pOi = Number(row.pe_oi || row.oi_PE || 0);
      if (cOi > maxOi) maxOi = cOi;
      if (pOi > maxOi) maxOi = pOi;
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

            <View style={styles.chainHeader}>
              <Text style={styles.sectionTitle}>OPTION CHAIN ({chainRows.length} Strikes)</Text>
            </View>

            <View style={styles.chainLabels}>
              <Text style={[styles.chainLabel, { flex: 1 }]}>CALL OI/CHG</Text>
              <Text style={[styles.chainLabel, { width: 60, textAlign: 'center' }]}>STRIKE</Text>
              <Text style={[styles.chainLabel, { flex: 1, textAlign: 'right' }]}>PUT OI/CHG</Text>
            </View>

            <View style={styles.chainContainer}>
              {chainRows.map((row, idx) => (
                <OptionChainRow key={idx} row={row} isATM={row.strike === atm} maxOi={maxOi} />
              ))}
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
