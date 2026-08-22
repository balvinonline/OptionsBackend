import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SUPPORTED_INDEXES, useMarket } from '../context/MarketContext';
import { MarketTape } from './MarketTape';
import { useTheme } from '../context/ThemeContext';
import { APP_BUILD_LABEL } from '../services/buildInfo';

const INDEX_ICONS = {
  'NIFTY': require('../../assets/nifty50.png'),
  'BANKNIFTY': require('../../assets/bank nifty.png'),
  'SENSEX': require('../../assets/sensex.png'),
  'FINNIFTY': require('../../assets/finnifty.png'),
  'MIDCPNIFTY': require('../../assets/nifty midcap.png'),
};

export const IndexHeader = ({ onOpenSettings, onNavigate }) => {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const { selectedIndex, setSelectedIndex, isConnected, lastUpdated, refresh, isRefreshing } = useMarket();

  return (
    <View style={styles.container}>
      {/* Market Tape Spot Tickers */}
      <MarketTape />

      {/* Option Chain Section Header */}
      <View style={styles.optionChainHeader}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }} onPress={() => onNavigate && onNavigate('Chain')}>
          <Text style={[styles.headerTitle, { color: theme.colors.primary, fontSize: 16 }]}>Option chain ↗</Text>
        </TouchableOpacity>
        <View style={styles.liveIndicatorRow}>
          <TouchableOpacity onPress={() => onOpenSettings && onOpenSettings()} style={{ marginRight: 12, padding: 4 }}>
            <Ionicons name="settings" size={16} color={theme.colors.textMuted} />
          </TouchableOpacity>
          <View style={styles.greenDot} />
          <Text style={styles.liveIndicatorText}>Live</Text>
        </View>
      </View>

      {/* Circular Index Badges */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgesContainer}>
        {SUPPORTED_INDEXES.map((idx) => {
          const isActive = selectedIndex === idx;
          return (
            <TouchableOpacity
              key={idx}
              style={styles.badgeWrapper}
              onPress={() => {
                requestAnimationFrame(() => {
                  setTimeout(() => {
                    setSelectedIndex(idx);
                  }, 0);
                });
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.circleBadge, isActive && styles.circleBadgeActive, { padding: 0, overflow: 'hidden' }]}>
                {INDEX_ICONS[idx] ? (
                  <Image source={INDEX_ICONS[idx]} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                ) : (
                  <Text style={[styles.circleBadgeIconText, isActive && styles.circleBadgeIconTextActive]}>
                    {idx.substring(0, 1)}
                  </Text>
                )}
              </View>
              <Text style={[styles.badgeLabel, isActive && styles.badgeLabelActive]}>{idx}</Text>
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
    paddingTop: 8,
    paddingBottom: 16,
  },
  optionChainHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginTop: 12,
    marginBottom: 10,
  },
  headerTitle: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  liveIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.bullish,
    marginRight: 4,
  },
  liveIndicatorText: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: '600',
  },
  subFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    marginBottom: 16,
    gap: 8,
  },
  subFilterActive: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  subFilterActiveText: {
    color: theme.colors.bgDark,
    fontSize: 11,
    fontWeight: '700',
  },
  subFilter: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  subFilterText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  badgesContainer: {
    paddingHorizontal: 14,
    gap: 16,
  },
  badgeWrapper: {
    alignItems: 'center',
    width: 60,
  },
  circleBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.bgCardElevated || theme.colors.bgCardSolid,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  circleBadgeActive: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
  },
  circleBadgeIconText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  circleBadgeIconTextActive: {
    color: theme.colors.primary,
  },
  badgeLabel: {
    color: theme.colors.textSecondary,
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
  },
  badgeLabelActive: {
    color: theme.colors.textPrimary,
  },
});
