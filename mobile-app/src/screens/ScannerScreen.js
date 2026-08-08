import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMarket } from '../context/MarketContext';
import { ServerSettingsModal } from '../components/ServerSettingsModal';
import { THEME } from '../constants/theme';

export const ScannerScreen = ({ onNavigate }) => {
  const { marketNews, marketStrip, sectorStocks, heavyweights } = useMarket();
  const [activeTab, setActiveTab] = useState('BUILDUP'); // BUILDUP, HEAVYWEIGHTS, SECTORS, NEWS
  const [buildupFilter, setBuildupFilter] = useState('LONG_BUILDUP');
  const [showSettings, setShowSettings] = useState(false);

  // High-probability F&O Stock Scans
  const defaultStocks = [
    { symbol: 'RELIANCE', ltp: '₹2,980.40', chg: '+1.85%', oiChg: '+14.2%', category: 'LONG_BUILDUP', isBullish: true },
    { symbol: 'HDFCBANK', ltp: '₹1,664.10', chg: '+0.95%', oiChg: '+8.6%', category: 'LONG_BUILDUP', isBullish: true },
    { symbol: 'INFY', ltp: '₹1,780.20', chg: '-1.40%', oiChg: '+11.5%', category: 'SHORT_BUILDUP', isBullish: false },
    { symbol: 'ICICIBANK', ltp: '₹1,240.00', chg: '+2.10%', oiChg: '-6.4%', category: 'SHORT_COVERING', isBullish: true },
    { symbol: 'TATAMOTORS', ltp: '₹985.50', chg: '-2.20%', oiChg: '-9.1%', category: 'LONG_UNWINDING', isBullish: false },
    { symbol: 'SBIN', ltp: '₹842.30', chg: '+1.15%', oiChg: '+5.8%', category: 'LONG_BUILDUP', isBullish: true },
    { symbol: 'TCS', ltp: '₹4,120.00', chg: '+0.45%', oiChg: '+3.2%', category: 'LONG_BUILDUP', isBullish: true },
    { symbol: 'AXISBANK', ltp: '₹1,180.50', chg: '+1.30%', oiChg: '-4.8%', category: 'SHORT_COVERING', isBullish: true },
    { symbol: 'KOTAKBANK', ltp: '₹1,745.00', chg: '-0.80%', oiChg: '+7.1%', category: 'SHORT_BUILDUP', isBullish: false },
  ];

  const stocks = Array.isArray(heavyweights) && heavyweights.length > 0 ? heavyweights : defaultStocks;
  const filteredStocks = stocks.filter((s) => (s.category || 'LONG_BUILDUP') === buildupFilter);

  // Sector list from strip or defaults
  const defaultSectors = [
    { name: 'NIFTY BANK', chg: '+0.85%', ltp: '51,450.20', isBull: true },
    { name: 'NIFTY IT', chg: '-0.65%', ltp: '39,120.80', isBull: false },
    { name: 'NIFTY AUTO', chg: '+1.40%', ltp: '24,680.15', isBull: true },
    { name: 'NIFTY METAL', chg: '+2.10%', ltp: '9,340.50', isBull: true },
    { name: 'NIFTY PHARMA', chg: '+0.25%', ltp: '21,890.00', isBull: true },
    { name: 'NIFTY ENERGY', chg: '+1.15%', ltp: '38,760.40', isBull: true },
    { name: 'NIFTY FMCG', chg: '-0.30%', ltp: '56,210.90', isBull: false },
  ];

  const sectors = Array.isArray(sectorStocks) && sectorStocks.length > 0 ? sectorStocks : defaultSectors;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Ionicons name="scan" size={20} color={THEME.colors.primary} />
          <Text style={styles.headerTitle}>SCANNERS & SECTORS</Text>
        </View>
        <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.settingsBtn}>
          <Ionicons name="settings-outline" size={18} color={THEME.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Main Mode Tabs */}
      <View style={styles.mainTabs}>
        <TouchableOpacity
          style={[styles.mainTab, activeTab === 'BUILDUP' && styles.mainTabActive]}
          onPress={() => setActiveTab('BUILDUP')}
        >
          <Text style={[styles.mainTabText, activeTab === 'BUILDUP' && styles.mainTabTextActive]}>
            OI Buildups
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.mainTab, activeTab === 'HEAVYWEIGHTS' && styles.mainTabActive]}
          onPress={() => setActiveTab('HEAVYWEIGHTS')}
        >
          <Text style={[styles.mainTabText, activeTab === 'HEAVYWEIGHTS' && styles.mainTabTextActive]}>
            Heavyweights
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.mainTab, activeTab === 'SECTORS' && styles.mainTabActive]}
          onPress={() => setActiveTab('SECTORS')}
        >
          <Text style={[styles.mainTabText, activeTab === 'SECTORS' && styles.mainTabTextActive]}>
            Sectors
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.mainTab, activeTab === 'NEWS' && styles.mainTabActive]}
          onPress={() => setActiveTab('NEWS')}
        >
          <Text style={[styles.mainTabText, activeTab === 'NEWS' && styles.mainTabTextActive]}>
            Live News
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {activeTab === 'BUILDUP' ? (
          <>
            {/* Buildup Category Filter Pills */}
            <View style={styles.subPills}>
              {[
                { id: 'LONG_BUILDUP', label: 'Long Buildup', color: THEME.colors.bullish },
                { id: 'SHORT_BUILDUP', label: 'Short Buildup', color: THEME.colors.bearish },
                { id: 'SHORT_COVERING', label: 'Short Covering', color: THEME.colors.primary },
                { id: 'LONG_UNWINDING', label: 'Long Unwinding', color: THEME.colors.warning },
              ].map((pill) => {
                const isActive = buildupFilter === pill.id;
                return (
                  <TouchableOpacity
                    key={pill.id}
                    style={[styles.subPill, isActive && { backgroundColor: pill.color, borderColor: pill.color }]}
                    onPress={() => setBuildupFilter(pill.id)}
                  >
                    <Text style={[styles.subPillText, isActive && { color: '#071a26', fontWeight: '900' }]}>
                      {pill.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Stocks List */}
            <View style={styles.cardList}>
              {filteredStocks.map((s, idx) => (
                <View key={idx} style={styles.stockCard}>
                  <View style={styles.stockLeft}>
                    <Text style={styles.stockSymbol}>{s.symbol}</Text>
                    <Text style={styles.stockSub}>OI Chg: <Text style={{ color: THEME.colors.primary, fontWeight: '700' }}>{s.oiChg}</Text></Text>
                  </View>
                  <View style={styles.stockRight}>
                    <Text style={styles.stockLtp}>{s.ltp}</Text>
                    <Text style={[styles.stockChg, { color: String(s.chg).startsWith('+') ? THEME.colors.bullish : THEME.colors.bearish }]}>
                      {s.chg}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : activeTab === 'HEAVYWEIGHTS' ? (
          <View style={styles.cardList}>
            {stocks.map((stock, idx) => (
              <View key={idx} style={styles.heavyweightCard}>
                <View style={styles.hwLeft}>
                  <Text style={styles.hwSymbol}>{stock.symbol}</Text>
                  <View style={styles.hwCategoryBadge}>
                    <Text style={styles.hwCategoryText}>{stock.category?.replace('_', ' ')}</Text>
                  </View>
                </View>
                <View style={styles.hwRight}>
                  <Text style={styles.hwLtp}>{stock.ltp}</Text>
                  <Text style={[styles.hwChg, { color: String(stock.chg).startsWith('+') ? THEME.colors.bullish : THEME.colors.bearish }]}>
                    {stock.chg}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : activeTab === 'SECTORS' ? (
          <View style={styles.sectorGrid}>
            {sectors.map((sec, idx) => (
              <View key={idx} style={styles.sectorCard}>
                <View style={styles.sectorTop}>
                  <Text style={styles.sectorName}>{sec.name || sec.symbol}</Text>
                  <Text style={[styles.sectorChg, { color: sec.isBull !== false ? THEME.colors.bullish : THEME.colors.bearish }]}>
                    {sec.chg || '+0.0%'}
                  </Text>
                </View>
                <Text style={styles.sectorLtp}>{sec.ltp || '-'}</Text>
              </View>
            ))}
          </View>
        ) : (
          /* Live News Tab */
          <View style={styles.cardList}>
            {marketNews && marketNews.length > 0 ? (
              marketNews.map((news, idx) => (
                <View key={idx} style={styles.newsCard}>
                  <View style={styles.newsTopRow}>
                    <Text style={styles.newsSource}>{news.source || 'Market Feed'}</Text>
                    <Text style={styles.newsTime}>{news.time || 'Live'}</Text>
                  </View>
                  <Text style={styles.newsTitle}>{news.title || news.headline}</Text>
                  {news.summary ? <Text style={styles.newsSummary}>{news.summary}</Text> : null}
                </View>
              ))
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="newspaper-outline" size={32} color={THEME.colors.textMuted} />
                <Text style={styles.emptyText}>Fetching live market headlines...</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <ServerSettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.bgDark,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: THEME.colors.bgDark,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderLight,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  settingsBtn: {
    padding: 6,
    backgroundColor: THEME.colors.bgCard,
    borderRadius: 8,
  },
  mainTabs: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.bgCard,
    padding: 4,
    marginHorizontal: 14,
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
  },
  mainTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  mainTabActive: {
    backgroundColor: THEME.colors.primary,
  },
  mainTabText: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  mainTabTextActive: {
    color: '#071a26',
    fontWeight: '900',
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 40,
  },
  subPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  subPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: THEME.colors.bgCard,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
  },
  subPillText: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  cardList: {
    gap: 8,
  },
  stockCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: THEME.colors.bgCard,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
  },
  stockLeft: {},
  stockSymbol: {
    color: THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: '900',
  },
  stockSub: {
    color: THEME.colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  stockRight: {
    alignItems: 'flex-end',
  },
  stockLtp: {
    color: THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  stockChg: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  heavyweightCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: THEME.colors.bgCard,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
  },
  hwLeft: {
    gap: 4,
  },
  hwSymbol: {
    color: THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: '900',
  },
  hwCategoryBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  hwCategoryText: {
    color: THEME.colors.primary,
    fontSize: 9,
    fontWeight: '800',
  },
  hwRight: {
    alignItems: 'flex-end',
  },
  hwLtp: {
    color: THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  hwChg: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  sectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  sectorCard: {
    width: '48%',
    backgroundColor: THEME.colors.bgCard,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
  },
  sectorTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectorName: {
    color: THEME.colors.textPrimary,
    fontSize: 11,
    fontWeight: '800',
    flex: 1,
  },
  sectorChg: {
    fontSize: 11,
    fontWeight: '800',
  },
  sectorLtp: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  newsCard: {
    backgroundColor: THEME.colors.bgCard,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
  },
  newsTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  newsSource: {
    color: THEME.colors.primary,
    fontSize: 10,
    fontWeight: '800',
  },
  newsTime: {
    color: THEME.colors.textMuted,
    fontSize: 10,
  },
  newsTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  newsSummary: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    marginTop: 4,
    lineHeight: 15,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    gap: 8,
  },
  emptyText: {
    color: THEME.colors.textMuted,
    fontSize: 12,
  },
});
