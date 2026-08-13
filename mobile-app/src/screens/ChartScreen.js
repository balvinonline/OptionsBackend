import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMarket } from '../context/MarketContext';
import { IndexHeader } from '../components/IndexHeader';
import { CandlestickChart } from '../components/CandlestickChart';
import { ServerSettingsModal } from '../components/ServerSettingsModal';
import { useTheme } from '../context/ThemeContext';

export const ChartScreen = () => {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const { selectedIndex, marketData } = useMarket();
  const [timeframe, setTimeframe] = useState('5m');
  const [showVwap, setShowVwap] = useState(true);
  const [showEma, setShowEma] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const spot = Number(marketData?.spot || 24350);
  const change = Number(marketData?.change || 0);
  const isPositive = change >= 0;

  return (
    <View style={styles.container}>
      <IndexHeader onOpenSettings={() => setShowSettings(true)} />

      {/* Spot OHLC Strip */}
      <View style={styles.spotStrip}>
        <View>
          <Text style={styles.indexTitle}>{selectedIndex} INTRADAY</Text>
          <Text style={styles.spotValue}>₹{spot.toLocaleString('en-IN')}</Text>
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.changeText, { color: isPositive ? theme.colors.bullish : theme.colors.bearish }]}>
            {change > 0 ? `+${change.toFixed(2)}` : change.toFixed(2)} ({Number(marketData?.pChange || 0).toFixed(2)}%)
          </Text>
          <Text style={styles.vixText}>India VIX: {Number(marketData?.vix || 14.2).toFixed(2)}</Text>
        </View>
      </View>

      {/* Timeframe & Overlay Selector */}
      <View style={styles.toolbar}>
        {/* Timeframes */}
        <View style={styles.tfGroup}>
          {['1m', '3m', '5m', '15m'].map((tf) => (
            <TouchableOpacity
              key={tf}
              style={[styles.tfBtn, timeframe === tf && styles.tfBtnActive]}
              onPress={() => setTimeframe(tf)}
            >
              <Text style={[styles.tfText, timeframe === tf && styles.tfTextActive]}>{tf}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Indicator Toggles */}
        <View style={styles.indicatorsGroup}>
          <TouchableOpacity
            style={[styles.indBtn, showVwap && styles.indBtnActive]}
            onPress={() => setShowVwap(!showVwap)}
          >
            <Text style={[styles.indText, showVwap && styles.indTextActive]}>VWAP</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.indBtn, showEma && styles.indBtnActive]}
            onPress={() => setShowEma(!showEma)}
          >
            <Text style={[styles.indText, showEma && styles.indTextActive]}>EMA 9</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Chart Canvas */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <CandlestickChart symbol={selectedIndex} height={340} />

        {/* Technical Pivot Points Summary */}
        <View style={styles.pivotsCard}>
          <Text style={styles.pivotsTitle}>KEY INTRADAY TECHNICAL LEVELS</Text>
          <View style={styles.pivotGrid}>
            <View style={styles.pivotTile}>
              <Text style={styles.pivotLabel}>R2 Resistance</Text>
              <Text style={[styles.pivotVal, { color: theme.colors.bearish }]}>
                ₹{(spot + 150).toFixed(0)}
              </Text>
            </View>
            <View style={styles.pivotTile}>
              <Text style={styles.pivotLabel}>R1 Resistance</Text>
              <Text style={[styles.pivotVal, { color: theme.colors.bearish }]}>
                ₹{(spot + 75).toFixed(0)}
              </Text>
            </View>
            <View style={styles.pivotTile}>
              <Text style={styles.pivotLabel}>Pivot Point</Text>
              <Text style={[styles.pivotVal, { color: theme.colors.primaryLight }]}>
                ₹{spot.toFixed(0)}
              </Text>
            </View>
            <View style={styles.pivotTile}>
              <Text style={styles.pivotLabel}>S1 Support</Text>
              <Text style={[styles.pivotVal, { color: theme.colors.bullish }]}>
                ₹{(spot - 75).toFixed(0)}
              </Text>
            </View>
            <View style={styles.pivotTile}>
              <Text style={styles.pivotLabel}>S2 Support</Text>
              <Text style={[styles.pivotVal, { color: theme.colors.bullish }]}>
                ₹{(spot - 150).toFixed(0)}
              </Text>
            </View>
            <View style={styles.pivotTile}>
              <Text style={styles.pivotLabel}>VWAP Level</Text>
              <Text style={[styles.pivotVal, { color: theme.colors.primary }]}>
                ₹{(spot + 12).toFixed(0)}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <ServerSettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />
    </View>
  );
};

const getStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgDark,
  },
  scrollContent: {
    paddingBottom: 30,
  },
  spotStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.colors.bgCardSolid,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  indexTitle: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  spotValue: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '900',
  },
  changeText: {
    fontSize: 14,
    fontWeight: '900',
  },
  vixText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.colors.bgDark,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  tfGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  tfBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: theme.colors.bgCard,
  },
  tfBtnActive: {
    backgroundColor: theme.colors.primary,
  },
  tfText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  tfTextActive: {
    color: '#071a26',
    fontWeight: '900',
  },
  indicatorsGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  indBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: theme.colors.bgCard,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  indBtnActive: {
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  indText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  indTextActive: {
    color: theme.colors.primary,
    fontWeight: '800',
  },
  pivotsCard: {
    backgroundColor: theme.colors.bgCardSolid,
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pivotsTitle: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  pivotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  pivotTile: {
    width: '31%',
    backgroundColor: theme.colors.bgCard,
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  pivotLabel: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  pivotVal: {
    fontSize: 12,
    fontWeight: '900',
    marginTop: 2,
  },
});
