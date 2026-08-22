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
import { VitalSignsHUD } from '../components/VitalSignsHUD';
import { KpiCard } from '../components/KpiCard';
import { SignalCard } from '../components/SignalCard';
import { MarketGateCard } from '../components/MarketGateCard';
import { AdvancedAnalyticsCard } from '../components/AdvancedAnalyticsCard';
import { OiBarChart } from '../components/OiBarChart';
import { ServerSettingsModal } from '../components/ServerSettingsModal';
import { useTheme } from '../context/ThemeContext';

export const DashboardScreen = ({ onNavigate }) => {
  const [activeDashTab, setActiveDashTab] = useState('F&O');
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const { selectedIndex, marketData, advanceDecline, sectorStocks, signalAnalysis, tradeGateAnalysis, moveConfirmation, atm, isRefreshing, refresh, error } = useMarket();
  const [showSettings, setShowSettings] = useState(false);
  const [showZonePopup, setShowZonePopup] = useState(false);
  const [sectorModalVisible, setSectorModalVisible] = useState(false);
  const [selectedSectorDetails, setSelectedSectorDetails] = useState(null);
  const [loadingSector, setLoadingSector] = useState(false);

  const fetchSectorDetails = async (sectorName) => {
    setSectorModalVisible(true);
    setLoadingSector(true);
    try {
      // Lazy import api if needed, or import at top
      const { api } = require('../services/api');
      const res = await api.getSectorStocks(sectorName);
      setSelectedSectorDetails(res);
    } catch (err) {
      console.log('Error fetching sector details', err);
    } finally {
      setLoadingSector(false);
    }
  };

  const adStats = advanceDecline?.[selectedIndex] || { advances: 0, declines: 0 };
  const hasAdData = adStats.advances > 0 || adStats.declines > 0;

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

  const sectorStats = React.useMemo(() => {
    if (!sectorStocks) return { up: 0, down: 0, netMove: 0 };
    let up = 0, down = 0, netMove = 0;
    sectorStocks.forEach(s => {
      if ((s.change_pct || 0) > 0) up++;
      else if ((s.change_pct || 0) < 0) down++;
      netMove += (s.change_pct || 0);
    });
    return { up, down, netMove: netMove / (sectorStocks.length || 1) };
  }, [sectorStocks]);

  const renderSmartActionCard = () => {
    if (!signalAnalysis || !tradeGateAnalysis) return null;
    const { bearishDivergence, bullishDivergence } = signalAnalysis;
    const { zoneTone } = tradeGateAnalysis;
    const tradeZone = marketData?.analytics?.tradeZone;

    if (bearishDivergence) return <View style={[styles.smartActionCard, { backgroundColor: theme.colors.bearishBg, borderColor: theme.colors.bearishBorder }]}><Ionicons name="warning" size={20} color={theme.colors.bearish} /><View style={styles.smartActionTextContainer}><Text style={[styles.smartActionTitle, { color: theme.colors.bearish }]}>BEARISH DIVERGENCE</Text><Text style={styles.smartActionDesc}>Spot price rising but Call OI is dominating. Reversal likely.</Text></View></View>;
    if (bullishDivergence) return <View style={[styles.smartActionCard, { backgroundColor: theme.colors.bullishBg, borderColor: theme.colors.bullishBorder }]}><Ionicons name="warning" size={20} color={theme.colors.bullish} /><View style={styles.smartActionTextContainer}><Text style={[styles.smartActionTitle, { color: theme.colors.bullish }]}>BULLISH DIVERGENCE</Text><Text style={styles.smartActionDesc}>Spot price falling but Put OI is dominating. Reversal likely.</Text></View></View>;
    if (zoneTone === "trap" && tradeZone?.zone === 'Trap Zone') return <View style={[styles.smartActionCard, { backgroundColor: theme.colors.warning + "20", borderColor: theme.colors.warning }]}><Ionicons name="alert-circle" size={20} color={theme.colors.warning} /><View style={styles.smartActionTextContainer}><Text style={[styles.smartActionTitle, { color: theme.colors.warning }]}>TRAP ZONE DETECTED</Text><Text style={styles.smartActionDesc}>Do not trade. Wait for clean volume breakout.</Text></View></View>;
    return null;
  };

  return (
    <View style={styles.container}>
      {/* Smart Top Segmented Tabs (Kotak Style) */}
      <View style={styles.segmentedTabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {['Market Stats', 'F&O', 'Stocks', 'Sector Performance'].map((tab) => (
            <TouchableOpacity 
              key={tab}
              style={[styles.segmentedTab, activeDashTab === tab && styles.segmentedTabActive]}
              onPress={() => setActiveDashTab(tab)}
            >
              <Text style={[styles.segmentedTabText, activeDashTab === tab && styles.segmentedTabTextActive]}>{tab}</Text>
              {activeDashTab === tab && <View style={styles.segmentedTabActiveIndicator} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

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
        {/* --- TAB: MARKET STATS --- */}
        {activeDashTab === 'Market Stats' && (
          <View style={{ paddingTop: 10 }}>
            <IndexHeader onOpenSettings={() => setShowSettings(true)} onNavigate={onNavigate} />
            <VitalSignsHUD marketData={marketData} />
          </View>
        )}

        {/* --- TAB: STOCKS --- */}
        {activeDashTab === 'Stocks' && (
          <View>
            {renderSmartActionCard()}
            {hasAdData && (
          <View style={styles.moodCard}>
            <Text style={styles.moodTitle}>Market Mood ({selectedIndex})</Text>
            <View style={styles.moodBarContainer}>
              <View style={[styles.moodBarBullish, { flex: adStats.advances || 1 }]} />
              <View style={[styles.moodBarBearish, { flex: adStats.declines || 1 }]} />
            </View>
            <View style={styles.moodLabels}>
              <Text style={styles.moodAdvances}>{adStats.advances || 0} Advances</Text>
              <Text style={styles.moodDeclines}>{adStats.declines || 0} Declines</Text>
            </View>
          </View>
        )}
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

            <View style={[styles.menuListContainer, { marginTop: 16 }]}>
              <TouchableOpacity style={styles.menuListItem} onPress={() => onNavigate && onNavigate('Scanner')}>
                <View style={styles.menuListLeft}>
                  <Ionicons name="pie-chart" size={20} color={theme.colors.primary} />
                  <View>
                    <Text style={styles.menuListTitle}>Sector Performance</Text>
                    <Text style={styles.menuListSub}>Market breadth & heatmaps</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

          </View>
        )}

        {/* --- TAB 2: F&O (Options Data & Signals) --- */}
        {activeDashTab === 'F&O' && (
          <View>
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
            <View style={styles.menuListContainer}>
              <Text style={styles.sectionTitle}>Detailed Analytics</Text>

              <TouchableOpacity style={styles.menuListItem} onPress={() => onNavigate && onNavigate('PCR')}>
                <View style={styles.menuListLeft}>
                  <Ionicons name="bar-chart" size={20} color={theme.colors.primary} />
                  <View>
                    <Text style={styles.menuListTitle}>PCR & Volatility</Text>
                    <Text style={styles.menuListSub}>PCR: {Number(marketData?.pcr_oi || 1).toFixed(2)}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuListItem} onPress={() => onNavigate && onNavigate('Chain')}>
                <View style={styles.menuListLeft}>
                  <Ionicons name="swap-vertical" size={20} color={theme.colors.bullish} />
                  <View>
                    <Text style={styles.menuListTitle}>Support & Resistance</Text>
                    <Text style={styles.menuListSub}>
                      S: ₹{topSupport[0]?.strike || '-'} | R: ₹{topRes[0]?.strike || '-'}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuListItem} onPress={() => onNavigate && onNavigate('Chain')}>
                <View style={styles.menuListLeft}>
                  <Ionicons name="layers" size={20} color="#a855f7" />
                  <View>
                    <Text style={styles.menuListTitle}>Full Option Chain</Text>
                    <Text style={styles.menuListSub}>OI Bar Charts & Greeks</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.menuListItem} onPress={() => onNavigate && onNavigate('OptionBuyer')}>
                <View style={styles.menuListLeft}>
                  <Ionicons name="rocket" size={20} color={theme.colors.warning} />
                  <View>
                    <Text style={styles.menuListTitle}>Advanced Analytics</Text>
                    <Text style={styles.menuListSub}>Divergence & Institutional Flow</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
          
          </View>
        )}

        {/* --- TAB: SECTOR PERFORMANCE --- */}
        {activeDashTab === 'Sector Performance' && (
          <View style={{ paddingTop: 10 }}>
            {sectorStocks && sectorStocks.length > 0 ? (
              <View style={[styles.menuListContainer, { marginHorizontal: 12, backgroundColor: 'transparent', borderWidth: 0 }]}>
                <View style={styles.sectorStatsCard}>
                  <View style={styles.sectorStatBox}>
                    <Text style={styles.sectorStatLabel}>Sectors Up</Text>
                    <Text style={[styles.sectorStatValue, { color: theme.colors.bullish }]}>{sectorStats.up}</Text>
                  </View>
                  <View style={styles.sectorStatBox}>
                    <Text style={styles.sectorStatLabel}>Sectors Down</Text>
                    <Text style={[styles.sectorStatValue, { color: theme.colors.bearish }]}>{sectorStats.down}</Text>
                  </View>
                  <View style={[styles.sectorStatBox, { borderRightWidth: 0 }]}>
                    <Text style={styles.sectorStatLabel}>Net Move</Text>
                    <Text style={[styles.sectorStatValue, { color: theme.colors.textPrimary }]}>
                      {sectorStats.netMove > 0 ? '+' : ''}{sectorStats.netMove.toFixed(2)}%
                    </Text>
                  </View>
                </View>
                
                {sectorStocks.map((sector, idx) => (
                  <TouchableOpacity key={idx} style={styles.sectorRow} onPress={() => fetchSectorDetails(sector.symbol)}>
                    <Text style={styles.sectorName}>{sector.symbol.replace('NIFTY ', '')}</Text>
                    <View style={styles.sectorBarWrapper}>
                      <View style={[
                        styles.sectorBar, 
                        { 
                          width: `${Math.min(Math.abs(sector.change_pct) * 10, 100)}%`,
                          backgroundColor: sector.change_pct >= 0 ? theme.colors.bullish : theme.colors.bearish
                        }
                      ]} />
                    </View>
                    <Text style={[styles.sectorChange, { color: sector.change_pct >= 0 ? theme.colors.bullish : theme.colors.bearish }]}>
                      {sector.change_pct >= 0 ? '+' : ''}{sector.change_pct}%
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: theme.colors.textMuted }}>No sector data available</Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* Zone Popup Modal */}
      <Modal visible={showZonePopup} transparent animationType="fade">
        <View style={styles.zoneModalOverlay}>
          <View style={[styles.zoneModalContent, { borderColor: tradeZone?.zone === 'Trap Zone' ? theme.colors.warning : theme.colors.bullish }]}>
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
                <Text style={[styles.zoneDetailValue, { color: theme.colors.textPrimary }]}>{tradeZone?.side || 'WAIT'}</Text>
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

      

      <ServerSettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />
    </View>
  );
};

const getStyles = (theme) => StyleSheet.create({
  segmentedTabsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    paddingTop: 8,
    marginBottom: 8,
  },
  segmentedTab: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    position: 'relative',
  },
  segmentedTabText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  segmentedTabTextActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  segmentedTabActiveIndicator: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: theme.colors.primary,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  smartActionCard: { flexDirection: 'row', alignItems: 'center', padding: 12, marginHorizontal: 14, marginTop: 12, borderRadius: 8, borderWidth: 1 },
  smartActionTextContainer: { marginLeft: 10, flex: 1 },
  smartActionTitle: { fontSize: 13, fontWeight: '900' },
  smartActionDesc: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
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
  confirmCard: {
    marginHorizontal: 14,
    marginTop: 10,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 11,
  },
  confirmTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  confirmLabel: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  confirmScore: {
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.bgDark,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: '900',
  },
  confirmReason: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 5,
  },
  confirmGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 9,
  },
  confirmChip: {
    width: '48%',
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderWidth: 1,
  },
  confirmChipBull: {
    backgroundColor: theme.colors.bullishBg,
    borderColor: theme.colors.bullishBorder,
  },
  confirmChipBear: {
    backgroundColor: theme.colors.bearishBg,
    borderColor: theme.colors.bearishBorder,
  },
  confirmChipWait: {
    backgroundColor: theme.colors.bgCard,
    borderColor: theme.colors.borderLight,
  },
  confirmChipLabel: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '900',
  },
  confirmChipValue: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
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
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 10,
  },
  menuListContainer: {
    paddingHorizontal: 14,
    marginTop: 16,
    gap: 12,
  },
  menuListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.bgCardSolid || '#191E28',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  menuListLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuListTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  menuListSub: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
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
  moodCard: {
    backgroundColor: theme.colors.bgCardSolid,
    marginHorizontal: 12,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  moodTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.textMuted,
    marginBottom: 8,
  },
  moodBarContainer: {
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  moodBarBullish: {
    backgroundColor: theme.colors.bullish,
  },
  moodBarBearish: {
    backgroundColor: theme.colors.bearish,
  },
  moodLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  moodAdvances: {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.colors.bullish,
  },
  moodDeclines: {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.colors.bearish,
  },
  sectorCard: {
    backgroundColor: theme.colors.bgCardSolid,
    marginHorizontal: 12,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  sectorCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginBottom: 12,
  },
  sectorSummaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectorSummaryBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginHorizontal: 4,
    backgroundColor: theme.colors.bgDark,
  },
  sectorSummaryLabel: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  sectorSummaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  sectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectorName: {
    width: 80,
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textAlign: 'right',
    marginRight: 8,
  },
  divergingTrack: {
    flex: 1,
    flexDirection: 'row',
    height: 12,
    alignItems: 'center',
  },
  divergingSideLeft: {
    flex: 1,
    alignItems: 'flex-end',
  },
  divergingSideRight: {
    flex: 1,
    alignItems: 'flex-start',
  },
  divergingBar: {
    height: 8,
    borderRadius: 2,
  },
  centerLine: {
    width: 1,
    height: 16,
    backgroundColor: theme.colors.borderLight,
    marginHorizontal: 2,
  },
  sectorPct: {
    width: 50,
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'right',
    marginLeft: 8,
  },
});
