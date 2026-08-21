import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SUPPORTED_INDEXES, useMarket } from '../context/MarketContext';
import { MarketTape } from './MarketTape';
import { useTheme } from '../context/ThemeContext';
import { APP_BUILD_LABEL } from '../services/buildInfo';

export const IndexHeader = ({ onOpenSettings }) => {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const { selectedIndex, setSelectedIndex, isConnected, lastUpdated, refresh, isRefreshing } = useMarket();

  return (
    <View style={styles.container}>
      {/* Market Tape Spot Tickers */}
      <MarketTape />

      {/* Option Chain Section Header */}
      <View style={styles.optionChainHeader}>
        <Text style={styles.headerTitle}>Option chain</Text>
        <View style={styles.liveIndicatorRow}>
          <View style={styles.greenDot} />
          <Text style={styles.liveIndicatorText}>Live</Text>
        </View>
      </View>

      <View style={styles.subFilterRow}>
        <View style={styles.subFilterActive}>
          <Text style={styles.subFilterActiveText}>Equity</Text>
        </View>
        <View style={styles.subFilter}>
          <Text style={styles.subFilterText}>Commodities</Text>
        </View>
        <View style={styles.subFilter}>
          <Text style={styles.subFilterText}>Expiry soon</Text>
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
              <View style={[styles.circleBadge, isActive && styles.circleBadgeActive]}>
                <Text style={[styles.circleBadgeIconText, isActive && styles.circleBadgeIconTextActive]}>
                  {idx.substring(0, 1)}
                </Text>
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
