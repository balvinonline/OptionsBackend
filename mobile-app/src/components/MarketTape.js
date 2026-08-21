import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMarket } from '../context/MarketContext';
import { useTheme } from '../context/ThemeContext';

export const MarketTape = () => {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const { marketStrip, selectedIndex, setSelectedIndex } = useMarket();

  // Fallback default strip symbols if market is closed or loading
  const defaultItems = [
    { label: 'NIFTY', symbol: 'NIFTY', ltp: 24571.20, change: -65.35, change_pct: -0.27 },
    { label: 'BANKNIFTY', symbol: 'BANKNIFTY', ltp: 57746.10, change: -317.20, change_pct: -0.55 },
    { label: 'SENSEX', symbol: 'SENSEX', ltp: 78499.00, change: -455.59, change_pct: -0.58 },
    { label: 'FINNIFTY', symbol: 'FINNIFTY', ltp: 26466.80, change: -397.50, change_pct: -1.48 },
    { label: 'MIDCPNIFTY', symbol: 'MIDCPNIFTY', ltp: 63464.30, change: 136.75, change_pct: 0.22 },
  ];

  // Merge live items with fallback labels
  const displayItems = (marketStrip && marketStrip.length > 0)
    ? marketStrip.map((item, idx) => {
        const fallback = defaultItems[idx] || {};
        const ltp = item.ltp !== null && item.ltp !== undefined ? Number(item.ltp) : fallback.ltp;
        const change = item.change !== null && item.change !== undefined ? Number(item.change) : fallback.change;
        const change_pct = item.change_pct !== null && item.change_pct !== undefined ? Number(item.change_pct) : fallback.change_pct;

        let label = item.label || fallback.label;
        if (label === 'NIFTY 50') label = 'NIFTY';
        if (label === 'NIFTY BANK') label = 'BANKNIFTY';
        if (label === 'NIFTY FIN SERVICE') label = 'FINNIFTY';
        if (label === 'NIFTY MIDCAP 100') label = 'MIDCPNIFTY';

        return {
          label,
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
        <Text style={styles.headerTitle}>Market indices</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContainer}
      >
        {displayItems.map((item, idx) => {
          const isPos = (item.change ?? 0) >= 0;
          const isSelected = selectedIndex && (
            item.label === selectedIndex ||
            item.symbol === selectedIndex
          );

          return (
            <TouchableOpacity
              key={idx}
              style={[
                styles.card,
                isSelected && styles.cardSelected,
              ]}
              onPress={() => {
                if (item.label?.includes('BANK')) setSelectedIndex('BANKNIFTY');
                else if (item.label?.includes('FIN')) setSelectedIndex('FINNIFTY');
                else if (item.label?.includes('MID')) setSelectedIndex('MIDCPNIFTY');
                else if (item.label?.includes('SENSEX')) setSelectedIndex('SENSEX');
                else if (item.label?.includes('NIFTY')) setSelectedIndex('NIFTY');
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.cardLabel} numberOfLines={1}>
                {item.label}
              </Text>

              <View style={styles.valueRow}>
                <Text style={styles.cardPrice}>
                  {item.ltp ? Number(item.ltp).toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '--'}
                </Text>

                <View style={styles.changeBadge}>
                  <Text style={[styles.cardChange, { color: isPos ? theme.colors.bullish : theme.colors.bearish }]}>
                    {item.change !== undefined && item.change !== null
                      ? `${item.change > 0 ? '+' : ''}${item.change.toFixed(2)} (${item.change > 0 ? '+' : ''}${item.change_pct !== undefined ? item.change_pct.toFixed(2) : '0.00'}%)`
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

const getStyles = (theme) => StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  headerTitle: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewAllText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '700',
    marginRight: 2,
  },
  scrollContainer: {
    paddingHorizontal: 12,
    gap: 8,
  },
  card: {
    backgroundColor: theme.colors.bgCardSolid,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 130,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardSelected: {
    borderColor: theme.colors.primary,
  },
  cardLabel: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  valueRow: {
    flexDirection: 'column',
  },
  cardPrice: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.colors.textPrimary,
    letterSpacing: 0.2,
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  cardChange: {
    fontSize: 11,
    fontWeight: '700',
  },
});
