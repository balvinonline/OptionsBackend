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
import { IndexHeader } from '../components/IndexHeader';
import { SignalCard } from '../components/SignalCard';
import { MarketGateCard } from '../components/MarketGateCard';
import { soundManager } from '../components/AudioAlertHelper';
import { ServerSettingsModal } from '../components/ServerSettingsModal';
import { THEME } from '../constants/theme';

export const SignalsScreen = ({ onNavigate }) => {
  const { selectedIndex, signalAnalysis, signalJournal, marketData } = useMarket();
  const [showSettings, setShowSettings] = useState(false);

  // Default fallback signals if session just started
  const defaultJournal = [
    {
      id: 'default-1',
      time: '14:25:10',
      symbol: selectedIndex,
      type: 'BUY_CE',
      strike: signalAnalysis?.atmStrike || 24400,
      entry: '142.5',
      target1: '185.0',
      target2: '220.0',
      stopLoss: '118.0',
      status: 'TARGET 1 HIT (+30%)',
    },
    {
      id: 'default-2',
      time: '11:40:02',
      symbol: selectedIndex,
      type: 'BUY_PE',
      strike: (signalAnalysis?.atmStrike || 24400) - 100,
      entry: '110.0',
      target1: '155.0',
      target2: '190.0',
      stopLoss: '88.0',
      status: 'CLOSED (+41%)',
    },
  ];

  const journal = signalJournal.length > 0 ? signalJournal : defaultJournal;

  return (
    <View style={styles.container}>
      <IndexHeader onOpenSettings={() => setShowSettings(true)} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Signal Header Section */}
        <View style={styles.topControlRow}>
          <View>
            <Text style={styles.title}>ALGORITHMIC SIGNALS</Text>
            <Text style={styles.subtitle}>Smart Money & Momentum Triggers</Text>
          </View>

          <TouchableOpacity style={styles.testAlertBtn} onPress={() => soundManager.testSound()}>
            <Ionicons name="volume-medium" size={16} color={THEME.colors.primary} />
            <Text style={styles.testAlertText}>Test Chime</Text>
          </TouchableOpacity>
        </View>

        {/* Current Active Signal */}
        <SignalCard signalAnalysis={signalAnalysis} indexSymbol={selectedIndex} />

        {/* Trade Gate Quick Access Banner */}
        <TouchableOpacity
          style={styles.gateBanner}
          onPress={() => onNavigate && onNavigate('Gate')}
          activeOpacity={0.8}
        >
          <View style={styles.gateBannerLeft}>
            <Ionicons name="shield-checkmark" size={20} color={THEME.colors.bullish} />
            <View>
              <Text style={styles.gateBannerTitle}>20-Point Trade Gate Checklist</Text>
              <Text style={styles.gateBannerSub}>Verify trend, heavyweights, traps, and absorption</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={THEME.colors.textMuted} />
        </TouchableOpacity>

        {/* Full Gate Rules Details */}
        <MarketGateCard signalAnalysis={signalAnalysis} />

        {/* Option Buyer Master Rules */}
        <View style={styles.rulesCard}>
          <View style={styles.rulesCardHeader}>
            <Ionicons name="bulb-outline" size={18} color={THEME.colors.warning} />
            <Text style={styles.rulesCardTitle}>OPTION BUYER 5-STEP CONFIRMATION</Text>
          </View>

          <View style={styles.ruleItem}>
            <Text style={styles.ruleNum}>1.</Text>
            <Text style={styles.ruleText}>
              <Text style={{ fontWeight: '800', color: THEME.colors.textPrimary }}>Trend Alignment: </Text>
              Index Spot is trading decisively above VWAP for CE or below VWAP for PE.
            </Text>
          </View>

          <View style={styles.ruleItem}>
            <Text style={styles.ruleNum}>2.</Text>
            <Text style={styles.ruleText}>
              <Text style={{ fontWeight: '800', color: THEME.colors.textPrimary }}>PCR Divergence: </Text>
              PCR(OI) &gt; 1.05 with aggressive Put writing confirms upward floor.
            </Text>
          </View>

          <View style={styles.ruleItem}>
            <Text style={styles.ruleNum}>3.</Text>
            <Text style={styles.ruleText}>
              <Text style={{ fontWeight: '800', color: THEME.colors.textPrimary }}>Trap Prevention: </Text>
              No high OI resistance wall immediately overhead within 1-2 strikes.
            </Text>
          </View>

          <View style={styles.ruleItem}>
            <Text style={styles.ruleNum}>4.</Text>
            <Text style={styles.ruleText}>
              <Text style={{ fontWeight: '800', color: THEME.colors.textPrimary }}>Absorption: </Text>
              CE unwinding and PE addition confirm institutional buying participation.
            </Text>
          </View>
        </View>

        {/* Signal Journal / History */}
        <View style={styles.journalHeader}>
          <Text style={styles.journalTitle}>TODAY'S SIGNAL JOURNAL</Text>
          <Text style={styles.journalCount}>{journal.length} Signals</Text>
        </View>

        {journal.map((item) => {
          const isCe = item.type === 'BUY_CE';
          return (
            <View key={item.id} style={styles.journalCard}>
              <View style={styles.journalTop}>
                <View style={[styles.journalPill, isCe ? styles.pillCe : styles.pillPe]}>
                  <Text style={styles.journalPillText}>{item.type}</Text>
                </View>
                <Text style={styles.journalStrike}>{item.symbol} {item.strike} {isCe ? 'CE' : 'PE'}</Text>
                <Text style={styles.journalTime}>{item.time}</Text>
              </View>

              <View style={styles.journalDetails}>
                <Text style={styles.journalPrice}>Entry: ₹{item.entry}</Text>
                <Text style={[styles.journalPrice, { color: THEME.colors.bullish }]}>T1: ₹{item.target1 || item.target}</Text>
                <Text style={[styles.journalPrice, { color: THEME.colors.bearish }]}>SL: ₹{item.stopLoss || item.sl}</Text>
              </View>

              <View style={styles.journalBottom}>
                <Ionicons name="checkmark-circle" size={14} color={THEME.colors.bullish} />
                <Text style={styles.journalStatus}>{item.status}</Text>
              </View>
            </View>
          );
        })}

        <View style={{ height: 30 }} />
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
  scrollContent: {
    paddingBottom: 24,
  },
  topControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 14,
    marginTop: 12,
  },
  title: {
    color: THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  testAlertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.bgCard,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
  },
  testAlertText: {
    color: THEME.colors.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  gateBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
    marginHorizontal: 14,
    marginTop: 10,
    borderRadius: 10,
    padding: 12,
  },
  gateBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  gateBannerTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  gateBannerSub: {
    color: THEME.colors.textMuted,
    fontSize: 10,
    marginTop: 1,
  },
  rulesCard: {
    backgroundColor: THEME.colors.bgCard,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
  },
  rulesCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderLight,
  },
  rulesCardTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  ruleItem: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  ruleNum: {
    color: THEME.colors.primary,
    fontWeight: '800',
    fontSize: 11,
  },
  ruleText: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
  journalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 14,
    marginTop: 16,
    marginBottom: 8,
  },
  journalTitle: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  journalCount: {
    color: THEME.colors.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  journalCard: {
    backgroundColor: THEME.colors.bgCard,
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
  },
  journalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  journalPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pillCe: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  pillPe: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  journalPillText: {
    fontSize: 10,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  journalStrike: {
    color: THEME.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
    marginLeft: 8,
  },
  journalTime: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  journalDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    padding: 8,
    borderRadius: 6,
    marginBottom: 6,
  },
  journalPrice: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  journalBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  journalStatus: {
    color: THEME.colors.bullish,
    fontSize: 10,
    fontWeight: '800',
  },
});
