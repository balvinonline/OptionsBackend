import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SUPPORTED_INDEXES, useMarket } from '../context/MarketContext';
import { MarketTape } from './MarketTape';
import { useTheme } from '../context/ThemeContext';

export const IndexHeader = ({ onOpenSettings }) => {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const { selectedIndex, setSelectedIndex, isConnected, lastUpdated, refresh, isRefreshing } = useMarket();

  return (
    <View style={styles.container}>
      {/* Top status bar row */}
      <View style={styles.topRow}>
        <View style={styles.branding}>
          <Ionicons name="stats-chart" size={18} color={theme.colors.primary} />
          <Text style={styles.brandTitle}>OPTIONS DESK</Text>
        </View>

        <View style={styles.statusGroup}>
          <View style={styles.connectionBadge}>
            <View style={[styles.dot, { backgroundColor: isConnected ? theme.colors.bullish : theme.colors.bearish }]} />
            <Text style={styles.statusText}>{isConnected ? 'LIVE' : 'OFFLINE'}</Text>
          </View>

          {lastUpdated ? (
            <Text style={styles.timeText}>{lastUpdated}</Text>
          ) : null}

          <TouchableOpacity onPress={refresh} style={styles.iconBtn} disabled={isRefreshing}>
            <Ionicons name="refresh" size={16} color={isRefreshing ? theme.colors.primary : theme.colors.textSecondary} />
          </TouchableOpacity>

          {onOpenSettings ? (
            <TouchableOpacity onPress={onOpenSettings} style={styles.iconBtn}>
              <Ionicons name="settings-outline" size={16} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Market Tape Spot Tickers (NIFTY 50, NIFTY BANK, SENSEX, SMALLCAP, FIN SERVICE, MIDCAP) */}
      <MarketTape />

      {/* Index Selector Pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsContainer}>
        {SUPPORTED_INDEXES.map((idx) => {
          const isActive = selectedIndex === idx;
          return (
            <TouchableOpacity
              key={idx}
              style={[styles.pill, isActive && styles.pillActive]}
              onPress={() => {
                // In a heavy app, deferring the global state update prevents button press lag
                requestAnimationFrame(() => {
                  setTimeout(() => {
                    setSelectedIndex(idx);
                  }, 0);
                });
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{idx}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const getStyles = (theme) => StyleSheet.create({
  container: {
    backgroundColor: theme.colors.bgDark,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    paddingTop: 8,
    paddingBottom: 10,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 14,
  },
  branding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandTitle: {
    color: theme.colors.textPrimary,
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.8,
  },
  statusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgCard,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    color: theme.colors.textPrimary,
    fontSize: 10,
    fontWeight: '800',
  },
  timeText: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  iconBtn: {
    padding: 5,
    backgroundColor: theme.colors.bgCard,
    borderRadius: 8,
  },
  pillsContainer: {
    gap: 8,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: theme.colors.bgCard,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  pillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  pillText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  pillTextActive: {
    color: '#071a26',
    fontWeight: '900',
  },
});
