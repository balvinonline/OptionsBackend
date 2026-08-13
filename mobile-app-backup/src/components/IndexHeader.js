import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SUPPORTED_INDEXES, useMarket } from '../context/MarketContext';
import { MarketTape } from './MarketTape';
import { THEME } from '../constants/theme';

export const IndexHeader = ({ onOpenSettings }) => {
  const { selectedIndex, setSelectedIndex, isConnected, lastUpdated, refresh, isRefreshing } = useMarket();

  return (
    <View style={styles.container}>
      {/* Top status bar row */}
      <View style={styles.topRow}>
        <View style={styles.branding}>
          <Ionicons name="stats-chart" size={18} color={THEME.colors.primary} />
          <Text style={styles.brandTitle}>OPTIONS DESK</Text>
        </View>

        <View style={styles.statusGroup}>
          <View style={styles.connectionBadge}>
            <View style={[styles.dot, { backgroundColor: isConnected ? THEME.colors.bullish : THEME.colors.bearish }]} />
            <Text style={styles.statusText}>{isConnected ? 'LIVE' : 'OFFLINE'}</Text>
          </View>

          {lastUpdated ? (
            <Text style={styles.timeText}>{lastUpdated}</Text>
          ) : null}

          <TouchableOpacity onPress={refresh} style={styles.iconBtn} disabled={isRefreshing}>
            <Ionicons name="refresh" size={16} color={isRefreshing ? THEME.colors.primary : THEME.colors.textSecondary} />
          </TouchableOpacity>

          {onOpenSettings ? (
            <TouchableOpacity onPress={onOpenSettings} style={styles.iconBtn}>
              <Ionicons name="settings-outline" size={16} color={THEME.colors.textSecondary} />
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
              onPress={() => setSelectedIndex(idx)}
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: THEME.colors.bgDark,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderLight,
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
    color: THEME.colors.textPrimary,
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
    backgroundColor: THEME.colors.bgCard,
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
    color: THEME.colors.textPrimary,
    fontSize: 10,
    fontWeight: '800',
  },
  timeText: {
    color: THEME.colors.textMuted,
    fontSize: 11,
  },
  iconBtn: {
    padding: 5,
    backgroundColor: THEME.colors.bgCard,
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
    backgroundColor: THEME.colors.bgCard,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
  },
  pillActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary,
  },
  pillText: {
    color: THEME.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  pillTextActive: {
    color: '#071a26',
    fontWeight: '900',
  },
});
