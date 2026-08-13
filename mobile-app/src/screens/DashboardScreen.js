import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMarket } from '../context/MarketContext';
import { IndexHeader } from '../components/IndexHeader';
import { KpiCard } from '../components/KpiCard';
import { SignalCard } from '../components/SignalCard';
import { MarketGateCard } from '../components/MarketGateCard';
import { AdvancedAnalyticsCard } from '../components/AdvancedAnalyticsCard';
import { OiBarChart } from '../components/OiBarChart';
import { ServerSettingsModal } from '../components/ServerSettingsModal';
import { useTheme } from '../context/ThemeContext';

export const DashboardScreen = ({ onNavigate }) => {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const { selectedIndex, marketData, signalAnalysis, tradeGateAnalysis, atm, isRefreshing, refresh, error } = useMarket();
  const [showSettings, setShowSettings] = useState(false);

  const topSupport = marketData?.support || [];
  const topRes = marketData?.resistance || [];

  return (
    <View style={styles.container}>
      <IndexHeader onOpenSettings={() => setShowSettings(true)} />

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="cloud-offline" size={16} color={theme.colors.bearish} />
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* KPI Spotlight */}
        <KpiCard data={marketData} atm={atm} />

        {/* Quick Feature Action Badges */}
        <View style={styles.quickActionsRow}>
          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => onNavigate && onNavigate('PCR')}
          >
            <Ionicons name="bar-chart" size={18} color={theme.colors.primary} />
            <Text style={styles.quickActionTitle}>PCR 5m/15m</Text>
            <Text style={styles.quickActionSub}>
              {Number(marketData?.pcr_oi || 1).toFixed(2)} Ratio
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => onNavigate && onNavigate('Journal')}
          >
            <Ionicons name="journal" size={18} color={theme.colors.warning} />
            <Text style={styles.quickActionTitle}>Journal</Text>
            <Text style={styles.quickActionSub}>Live Logs</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => onNavigate && onNavigate('Chain')}
          >
            <Ionicons name="layers" size={18} color="#a855f7" />
            <Text style={styles.quickActionTitle}>Chain</Text>
            <Text style={styles.quickActionSub}>Strikes</Text>
          </TouchableOpacity>
        </View>

        {/* Live Signal Recommendation */}
        <SignalCard signalAnalysis={signalAnalysis} indexSymbol={selectedIndex} />

        {/* Market Gate Criteria Checklist */}
        <MarketGateCard signalAnalysis={signalAnalysis} />

        {/* Support and Resistance Quick Grid */}
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

        {/* Advanced Analytics */}
        <AdvancedAnalyticsCard analytics={marketData?.analytics} />

        {/* Open Interest Chart (Fast Native View) */}
        <View style={styles.chartHeaderRow}>
          <Text style={styles.sectionTitle}>OPEN INTEREST & PCR (LIVE)</Text>
          <TouchableOpacity onPress={() => onNavigate && onNavigate('Chain')}>
            <Text style={styles.seeAllLink}>Full Chain →</Text>
          </TouchableOpacity>
        </View>
        <OiBarChart chain={marketData?.chain} atm={atm} />

        <View style={{ height: 30 }} />
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
    paddingBottom: 24,
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
  quickActionsRow: {
    flexDirection: 'row',
    marginHorizontal: 14,
    marginTop: 10,
    gap: 8,
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: theme.colors.bgCard,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  quickActionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 4,
  },
  quickActionSub: {
    color: theme.colors.textMuted,
    fontSize: 9,
    marginTop: 1,
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
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    paddingVertical: 6,
    textAlign: 'center',
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 2,
  },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  seeAllLink: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
});
