import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMarket } from '../context/MarketContext';
import { IndexHeader } from '../components/IndexHeader';
import { OptionChainRow } from '../components/OptionChainRow';
import { ServerSettingsModal } from '../components/ServerSettingsModal';
import { THEME } from '../constants/theme';

export const OptionChainScreen = () => {
  const { marketData, atm, strikeCount, setStrikeCount, isRefreshing, refresh, isLoading } = useMarket();
  const [showSettings, setShowSettings] = useState(false);
  const [filterMode, setFilterMode] = useState('ALL'); // ALL, CALLS, PUTS

  const chain = marketData?.chain || [];

  // Compute maximum OI across all strikes for proportional bar rendering
  const maxOi = useMemo(() => {
    let max = 0;
    chain.forEach((r) => {
      if (Number(r.oi_CE || 0) > max) max = Number(r.oi_CE);
      if (Number(r.oi_PE || 0) > max) max = Number(r.oi_PE);
    });
    return max || 1;
  }, [chain]);

  return (
    <View style={styles.container}>
      <IndexHeader onOpenSettings={() => setShowSettings(true)} />

      {/* Control Bar: Strike Counts & Views */}
      <View style={styles.controlBar}>
        {/* Strike Count Selector */}
        <View style={styles.countSelector}>
          {[15, 25, 40].map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.countBtn, strikeCount === c && styles.countBtnActive]}
              onPress={() => setStrikeCount(c)}
            >
              <Text style={[styles.countText, strikeCount === c && styles.countTextActive]}>
                {c} Strikes
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Spot & ATM summary pill */}
        <View style={styles.atmBadge}>
          <Text style={styles.atmLabel}>ATM: </Text>
          <Text style={styles.atmValue}>{atm ? Number(atm).toLocaleString('en-IN') : '-'}</Text>
        </View>
      </View>

      {/* Table Column Headers */}
      <View style={styles.tableHeader}>
        {/* CALL HEADER */}
        <View style={styles.headerSide}>
          <Text style={[styles.headerCell, { color: THEME.colors.bearish }]}>CE OI</Text>
          <Text style={styles.headerCell}>Chg</Text>
          <Text style={styles.headerCell}>LTP</Text>
        </View>

        {/* STRIKE HEADER */}
        <View style={styles.headerStrike}>
          <Text style={styles.headerStrikeText}>STRIKE</Text>
        </View>

        {/* PUT HEADER */}
        <View style={[styles.headerSide, { justifyContent: 'flex-end' }]}>
          <Text style={styles.headerCell}>LTP</Text>
          <Text style={styles.headerCell}>Chg</Text>
          <Text style={[styles.headerCell, { color: THEME.colors.bullish }]}>PE OI</Text>
        </View>
      </View>

      {/* List of Strikes */}
      {isLoading && !chain.length ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={THEME.colors.primary} />
          <Text style={styles.loadingText}>Fetching Option Chain...</Text>
        </View>
      ) : (
        <FlatList
          data={chain}
          keyExtractor={(item) => String(item.strike)}
          renderItem={({ item }) => {
            const isATM = atm !== null && Number(item.strike) === Number(atm);
            return <OptionChainRow row={item} isATM={isATM} maxOi={maxOi} />;
          }}
          refreshing={isRefreshing}
          onRefresh={refresh}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="layers-outline" size={32} color={THEME.colors.textMuted} />
              <Text style={styles.emptyTitle}>No Option Chain Data Available</Text>
              <Text style={styles.emptySubtitle}>Check backend connection or market hours.</Text>
            </View>
          }
        />
      )}

      <ServerSettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.bgDark,
  },
  controlBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: THEME.colors.bgCardSolid,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderLight,
  },
  countSelector: {
    flexDirection: 'row',
    gap: 6,
  },
  countBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: THEME.colors.bgCard,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
  },
  countBtnActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary,
  },
  countText: {
    color: THEME.colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  countTextActive: {
    color: '#071a26',
    fontWeight: '900',
  },
  atmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.bgCard,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: THEME.colors.primaryGlow,
  },
  atmLabel: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  atmValue: {
    color: THEME.colors.primaryLight,
    fontSize: 11,
    fontWeight: '900',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#0c2436',
    height: 36,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  headerSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 8,
  },
  headerCell: {
    color: THEME.colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
  },
  headerStrike: {
    width: 76,
    height: '100%',
    backgroundColor: THEME.colors.bgCardElevated,
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: THEME.colors.border,
  },
  headerStrikeText: {
    color: THEME.colors.primaryLight,
    fontSize: 10,
    fontWeight: '900',
  },
  listContent: {
    paddingBottom: 30,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: THEME.colors.textSecondary,
    fontSize: 13,
  },
  emptyContainer: {
    paddingVertical: 50,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  emptySubtitle: {
    color: THEME.colors.textMuted,
    fontSize: 12,
  },
});
