import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
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
  const [showZonePopup, setShowZonePopup] = useState(false);

  const topSupport = marketData?.support || [];
  const topRes = marketData?.resistance || [];
  const tradeZone = marketData?.analytics?.tradeZones;
  const zoneTone = tradeZone?.tone || 'trap';
  const zoneColor = zoneTone === 'buy' ? theme.colors.bullish : zoneTone === 'sell' ? theme.colors.bearish : theme.colors.warning;
  const zoneBg = zoneTone === 'buy' ? theme.colors.bullishBg : zoneTone === 'sell' ? theme.colors.bearishBg : theme.colors.warningBg;
  const zoneBorder = zoneTone === 'buy' ? theme.colors.bullishBorder : zoneTone === 'sell' ? theme.colors.bearishBorder : theme.colors.warning;

  const formatLevel = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-';
  };

  const formatVolume = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num === 0) return '-';
    if (Math.abs(num) >= 10000000) return `${(num / 10000000).toFixed(2)}Cr`;
    if (Math.abs(num) >= 100000) return `${(num / 100000).toFixed(2)}L`;
    if (Math.abs(num) >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return String(Math.round(num));
  };

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
        {/* Market Trend Banner */}
        {signalAnalysis?.gateStatus && (
          <View style={[styles.trendBanner, signalAnalysis.gateStatus === 'BULLISH' ? styles.trendBullish : signalAnalysis.gateStatus === 'BEARISH' ? styles.trendBearish : styles.trendNeutral]}>
            <Ionicons 
              name={signalAnalysis.gateStatus === 'BULLISH' ? 'trending-up' : signalAnalysis.gateStatus === 'BEARISH' ? 'trending-down' : 'swap-horizontal'} 
              size={24} 
              color="#fff" 
            />
            <Text style={styles.trendBannerText}>
              MARKET TREND: {signalAnalysis.gateStatus === 'BULLISH' ? 'BULLISH 🚀' : signalAnalysis.gateStatus === 'BEARISH' ? 'BEARISH 🩸' : 'SIDEWAYS ⚖️'}
            </Text>
          </View>
        )}

        {tradeZone ? (
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.zoneCard, { backgroundColor: zoneBg, borderColor: zoneBorder }]}
            onPress={() => setShowZonePopup(true)}
          >
            <View style={styles.zoneHeader}>
              <View>
                <Text style={styles.zoneLabel}>CURRENT ZONE</Text>
                <Text style={[styles.zoneTitle, { color: zoneColor }]}>{tradeZone.zone}</Text>
              </View>
              <View style={[styles.zoneSidePill, { backgroundColor: zoneColor }]}>
                <Text style={styles.zoneSideText}>{tradeZone.side || 'WAIT'}</Text>
              </View>
            </View>
            <Text style={styles.zoneReason}>{tradeZone.reason}</Text>
            <View style={styles.zoneMiniGrid}>
              <Text style={styles.zoneMiniText}>VWAP {formatLevel(tradeZone.vwap)}</Text>
              <Text style={styles.zoneMiniText}>S {formatLevel(tradeZone.support)}</Text>
              <Text style={styles.zoneMiniText}>R {formatLevel(tradeZone.resistance)}</Text>
              <Text style={styles.zoneMiniText}>Vol {tradeZone.volumeSide}</Text>
            </View>
          </TouchableOpacity>
        ) : null}

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

      <Modal visible={showZonePopup} transparent animationType="fade" onRequestClose={() => setShowZonePopup(false)}>
        <View style={styles.zoneModalOverlay}>
          <View style={styles.zoneModal}>
            <View style={styles.zoneModalHead}>
              <Text style={styles.zoneModalTitle}>{tradeZone?.zone || 'Trade Zone'}</Text>
              <TouchableOpacity style={styles.zoneCloseBtn} onPress={() => setShowZonePopup(false)}>
                <Text style={styles.zoneCloseText}>Close</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.zoneModalReason}>{tradeZone?.reason || 'Waiting for clean data.'}</Text>

            <View style={styles.zoneDetailGrid}>
              <View style={styles.zoneDetailBox}>
                <Text style={styles.zoneDetailLabel}>Side</Text>
                <Text style={[styles.zoneDetailValue, { color: zoneColor }]}>{tradeZone?.side || 'WAIT'}</Text>
              </View>
              <View style={styles.zoneDetailBox}>
                <Text style={styles.zoneDetailLabel}>Price</Text>
                <Text style={styles.zoneDetailValue}>{tradeZone?.priceSide || '-'}</Text>
              </View>
              <View style={styles.zoneDetailBox}>
                <Text style={styles.zoneDetailLabel}>OI</Text>
                <Text style={styles.zoneDetailValue}>{tradeZone?.oiSide || '-'}</Text>
              </View>
              <View style={styles.zoneDetailBox}>
                <Text style={styles.zoneDetailLabel}>Volume</Text>
                <Text style={styles.zoneDetailValue}>{tradeZone?.volumeSide || '-'}</Text>
              </View>
            </View>

            <View style={styles.zoneLevelGrid}>
              <Text style={styles.zoneLevelText}>Support: {formatLevel(tradeZone?.support)}</Text>
              <Text style={styles.zoneLevelText}>Resistance: {formatLevel(tradeZone?.resistance)}</Text>
              <Text style={styles.zoneLevelText}>VWAP: {formatLevel(tradeZone?.vwap)}</Text>
              <Text style={styles.zoneLevelText}>PCR: {formatLevel(tradeZone?.pcr)}</Text>
              <Text style={styles.zoneLevelText}>CE Vol: {formatVolume(tradeZone?.ceVolume)}</Text>
              <Text style={styles.zoneLevelText}>PE Vol: {formatVolume(tradeZone?.peVolume)}</Text>
            </View>

            {tradeZone?.blockers?.length ? (
              <View style={styles.zoneBlockers}>
                <Text style={styles.zoneBlockerTitle}>Wait Reason</Text>
                {tradeZone.blockers.map((item, idx) => (
                  <Text key={`${item}-${idx}`} style={styles.zoneBlockerText}>{item}</Text>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
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
  zoneCard: {
    marginHorizontal: 14,
    marginTop: 10,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  zoneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  zoneLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  zoneTitle: {
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  zoneSidePill: {
    minWidth: 58,
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  zoneSideText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  zoneReason: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  zoneMiniGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 9,
  },
  zoneMiniText: {
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '800',
  },
  zoneModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    padding: 18,
  },
  zoneModal: {
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    padding: 14,
  },
  zoneModalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  zoneModalTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
  },
  zoneCloseBtn: {
    backgroundColor: theme.colors.bgDark,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  zoneCloseText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  zoneModalReason: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  zoneDetailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  zoneDetailBox: {
    flexGrow: 1,
    flexBasis: '47%',
    backgroundColor: theme.colors.bgDark,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 10,
    padding: 10,
  },
  zoneDetailLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  zoneDetailValue: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 4,
  },
  zoneLevelGrid: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  zoneLevelText: {
    color: theme.colors.textSecondary,
    backgroundColor: theme.colors.bgCard,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '800',
  },
  zoneBlockers: {
    marginTop: 12,
    backgroundColor: theme.colors.warningBg,
    borderRadius: 10,
    padding: 10,
  },
  zoneBlockerTitle: {
    color: theme.colors.warning,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 4,
  },
  zoneBlockerText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
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
  fullChartText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  trendBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 14,
    marginTop: 14,
    marginBottom: 4,
    borderRadius: 8,
    gap: 8,
  },
  trendBullish: {
    backgroundColor: theme.colors.bullish,
  },
  trendBearish: {
    backgroundColor: theme.colors.bearish,
  },
  trendNeutral: {
    backgroundColor: theme.colors.warning,
  },
  trendBannerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
