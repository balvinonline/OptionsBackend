import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useMarket } from '../context/MarketContext';
import { IndexHeader } from '../components/IndexHeader';
import { OptionChainRow } from '../components/OptionChainRow';
import { OiBarChart } from '../components/OiBarChart';
import { KpiCard } from '../components/KpiCard';
import { ServerSettingsModal } from '../components/ServerSettingsModal';
import { OrderExecutionModal } from '../components/OrderExecutionModal';
import { useTheme } from '../context/ThemeContext';

export const OptionChainScreen = () => {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const { marketData, atm, strikeCount, setStrikeCount, isRefreshing, refresh, isLoading } = useMarket();
  const [showSettings, setShowSettings] = useState(false);
  const [filterMode, setFilterMode] = useState('ALL'); // ALL, CALLS, PUTS
  const [selectedOption, setSelectedOption] = useState(null);

  let rawChain = marketData?.chain || [];
  let chain = [...rawChain];
  
  if (chain.length > 0 && atm > 0) {
    let closestIdx = 0;
    let minDiff = Infinity;
    chain.forEach((row, idx) => {
      const diff = Math.abs(Number(row.strike) - atm);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });
    
    // Trim to exactly strikeCount items centered on atm
    const half = Math.floor(strikeCount / 2);
    const startIdx = Math.max(0, closestIdx - half);
    const endIdx = Math.min(chain.length, closestIdx + half + 1);
    chain = chain.slice(startIdx, endIdx);
  }

  const topSupport = marketData?.support || [];
  const topRes = marketData?.resistance || [];

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
          {[10, 20, 30].map((c) => (
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
          <Text style={[styles.headerCell, { color: theme.colors.bearish }]}>CE OI</Text>
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
          <Text style={[styles.headerCell, { color: theme.colors.bullish }]}>PE OI</Text>
        </View>
      </View>

      {/* List of Strikes */}
      {isLoading && !chain.length ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Fetching Option Chain...</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <FlashList
            data={chain}
            estimatedItemSize={45}
            keyExtractor={(item) => String(item.strike)}
            renderItem={({ item }) => {
              const isATM = atm !== null && Number(item.strike) === Number(atm);
              return <OptionChainRow row={item} isATM={isATM} maxOi={maxOi} onOptionPress={setSelectedOption} />;
            }}
            refreshing={isRefreshing}
            onRefresh={refresh}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View style={{ marginBottom: 12 }}>
                <KpiCard data={marketData} atm={atm} />
                
                <OiBarChart chain={chain} atm={atm} />

                <View style={styles.srGrid}>
                  {/* Support (PE OI) */}
                  <View style={[styles.srBox, styles.supportBox]}>
                    <View style={styles.srHeader}>
                      <Ionicons name="arrow-up-circle" size={16} color={theme.colors.bullish} />
                      <Text style={[styles.srTitle, { color: theme.colors.bullish }]}>TOP SUPPORT (PE OI)</Text>
                    </View>
                    {topSupport.slice(0, 3).map((item, idx) => (
                      <View key={idx} style={styles.srRow}>
                        <Text style={styles.srStrike}>₹{Number(item.strike).toLocaleString('en-IN')}</Text>
                        <Text style={styles.srOi}>{(Number(item.oi || 0) / 100000).toFixed(1)}L</Text>
                        <Text style={styles.srLtp}>₹{Number(item.ltp || 0).toFixed(1)}</Text>
                      </View>
                    ))}
                    {!topSupport.length && <Text style={styles.emptyText}>No support data</Text>}
                  </View>

                  {/* Resistance (CE OI) */}
                  <View style={[styles.srBox, styles.resistanceBox]}>
                    <View style={styles.srHeader}>
                      <Ionicons name="arrow-down-circle" size={16} color={theme.colors.bearish} />
                      <Text style={[styles.srTitle, { color: theme.colors.bearish }]}>TOP RESISTANCE (CE OI)</Text>
                    </View>
                    {topRes.slice(0, 3).map((item, idx) => (
                      <View key={idx} style={styles.srRow}>
                        <Text style={styles.srStrike}>₹{Number(item.strike).toLocaleString('en-IN')}</Text>
                        <Text style={styles.srOi}>{(Number(item.oi || 0) / 100000).toFixed(1)}L</Text>
                        <Text style={styles.srLtp}>₹{Number(item.ltp || 0).toFixed(1)}</Text>
                      </View>
                    ))}
                    {!topRes.length && <Text style={styles.emptyText}>No resistance data</Text>}
                  </View>
                </View>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="layers-outline" size={32} color={theme.colors.textMuted} />
                <Text style={styles.emptyTitle}>No Option Chain Data Available</Text>
                <Text style={styles.emptySubtitle}>Check backend connection or market hours.</Text>
              </View>
            }
          />
        </View>
      )}

      <ServerSettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />
      <OrderExecutionModal 
        visible={!!selectedOption} 
        optionData={selectedOption} 
        onClose={() => setSelectedOption(null)} 
      />
    </View>
  );
};

const getStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgDark,
  },
  controlBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.colors.bgCardSolid,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  countSelector: {
    flexDirection: 'row',
    gap: 6,
  },
  countBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: theme.colors.bgCard,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  countBtnActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  countText: {
    color: theme.colors.textSecondary,
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
    backgroundColor: theme.colors.bgCard,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.primaryGlow,
  },
  atmLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  atmValue: {
    color: theme.colors.primaryLight,
    fontSize: 11,
    fontWeight: '900',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#0c2436',
    height: 36,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 8,
  },
  headerCell: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
  },
  headerStrike: {
    width: 76,
    height: '100%',
    backgroundColor: theme.colors.bgCardElevated,
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: theme.colors.border,
  },
  headerStrikeText: {
    color: theme.colors.primaryLight,
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
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  emptyContainer: {
    paddingVertical: 50,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  emptySubtitle: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  srGrid: {
    flexDirection: 'row',
    marginHorizontal: 14,
    marginTop: 12,
    gap: 10,
  },
  srBox: {
    flex: 1,
    backgroundColor: theme.colors.bgCardSolid,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    ...theme.shadows.card,
  },
  supportBox: {
    borderColor: theme.colors.bullishBorder,
  },
  resistanceBox: {
    borderColor: theme.colors.bearishBorder,
  },
  srHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  srTitle: {
    fontSize: 10,
    fontWeight: '900',
  },
  srRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  srStrike: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  srOi: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  srLtp: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
});
