import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMarket } from '../context/MarketContext';
import { THEME } from '../constants/theme';

export const MarketTape = () => {
  const { marketStrip, selectedIndex, setSelectedIndex } = useMarket();

  // Fallback default strip symbols if market is closed or loading
  const defaultItems = [
    { label: 'NIFTY 50', symbol: 'NIFTY', ltp: 24571.20, change: -65.35, change_pct: -0.27 },
    { label: 'NIFTY BANK', symbol: 'BANKNIFTY', ltp: 57746.10, change: -317.20, change_pct: -0.55 },
    { label: 'SENSEX', symbol: 'SENSEX', ltp: 78499.00, change: -455.59, change_pct: -0.58 },
    { label: 'NIFTY SMALLCAP 100', symbol: 'NIFTY', ltp: 19868.45, change: -10.45, change_pct: -0.05 },
    { label: 'NIFTY FIN SERVICE', symbol: 'FINNIFTY', ltp: 26466.80, change: -397.50, change_pct: -1.48 },
    { label: 'NIFTY MIDCAP 100', symbol: 'MIDCPNIFTY', ltp: 63464.30, change: 136.75, change_pct: 0.22 },
  ];

  // Merge live items with fallback labels
  const displayItems = (marketStrip && marketStrip.length > 0)
    ? marketStrip.map((item, idx) => {
        const fallback = defaultItems[idx] || {};
        const ltp = item.ltp !== null && item.ltp !== undefined ? Number(item.ltp) : fallback.ltp;
        const change = item.change !== null && item.change !== undefined ? Number(item.change) : fallback.change;
        const change_pct = item.change_pct !== null && item.change_pct !== undefined ? Number(item.change_pct) : fallback.change_pct;

        return {
          label: item.label || fallback.label,
          symbol: item.symbol || fallback.symbol,
          ltp,
          change,
          change_pct,
        };
      })
    : defaultItems;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Ionicons name="pulse" size={14} color={THEME.colors.primary} />
        <Text style={styles.headerTitle}>Market Tape</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContainer}
      >
        {displayItems.map((item, idx) => {
          const isPos = (item.change ?? 0) >= 0;
          const isSelected = selectedIndex && (
            item.label?.includes(selectedIndex) ||
            item.symbol?.includes(selectedIndex)
          );

          return (
            <TouchableOpacity
              key={idx}
              style={[
                styles.card,
                isSelected && styles.cardSelected,
                isPos ? styles.cardBullish : styles.cardBearish,
              ]}
              onPress={() => {
                if (item.label?.includes('BANK')) setSelectedIndex('BANKNIFTY');
                else if (item.label?.includes('FIN')) setSelectedIndex('FINNIFTY');
                else if (item.label?.includes('MID')) setSelectedIndex('MIDCPNIFTY');
                else if (item.label?.includes('SENSEX')) setSelectedIndex('SENSEX');
                else if (item.label?.includes('NIFTY 50')) setSelectedIndex('NIFTY');
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.cardLabel} numberOfLines={1}>
                {item.label}
              </Text>

              <View style={styles.valueRow}>
                <Text style={[styles.cardPrice, { color: isPos ? THEME.colors.bullish : THEME.colors.bearish }]}>
                  {item.ltp ? Number(item.ltp).toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '--'}
                </Text>

                <View style={styles.changeBadge}>
                  <Ionicons
                    name={isPos ? 'arrow-up' : 'arrow-down'}
                    size={11}
                    color={isPos ? THEME.colors.bullish : THEME.colors.bearish}
                  />
                  <Text style={[styles.cardChange, { color: isPos ? THEME.colors.bullish : THEME.colors.bearish }]}>
                    {item.change !== undefined && item.change !== null
                      ? `${item.change > 0 ? '+' : ''}${item.change.toFixed(1)} (${item.change_pct !== undefined ? item.change_pct.toFixed(2) : '0.00'}%)`
                      : '0.00%'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  headerTitle: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  scrollContainer: {
    paddingHorizontal: 12,
    gap: 8,
  },
  card: {
    backgroundColor: '#0c2333',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 140,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.15)',
    elevation: 2,
  },
  cardSelected: {
    borderColor: THEME.colors.primary,
    backgroundColor: '#0f3248',
  },
  cardBullish: {
    borderLeftWidth: 3,
    borderLeftColor: THEME.colors.bullish,
  },
  cardBearish: {
    borderLeftWidth: 3,
    borderLeftColor: THEME.colors.bearish,
  },
  cardLabel: {
    color: THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  valueRow: {
    flexDirection: 'column',
  },
  cardPrice: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 2,
  },
  cardChange: {
    fontSize: 10,
    fontWeight: '700',
  },
});
