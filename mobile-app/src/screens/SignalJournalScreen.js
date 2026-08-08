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
import { THEME } from '../constants/theme';

export const SignalJournalScreen = ({ onNavigate }) => {
  const { selectedIndex, signalJournal, signalAnalysis, marketData } = useMarket();
  const [filterType, setFilterType] = useState('ALL'); // ALL, BUY_CE, BUY_PE

  const filteredJournal = signalJournal.filter((entry) => {
    if (filterType === 'ALL') return true;
    return entry.type === filterType;
  });

  const hasLiveSignal = signalAnalysis?.signalType && signalAnalysis.signalType !== 'NEUTRAL';
  const isBuyCe = signalAnalysis?.signalType === 'BUY_CE';

  return (
    <View style={styles.container}>
      <IndexHeader onOpenSettings={() => onNavigate && onNavigate('Settings')} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Title Header */}
        <View style={styles.titleBanner}>
          <View style={styles.titleRow}>
            <Ionicons name="journal" size={20} color={THEME.colors.primary} />
            <Text style={styles.pageTitle}>{selectedIndex} SIGNAL JOURNAL & TRADE LOG</Text>
          </View>
          <Text style={styles.pageSubtitle}>Live Strategy Triggers, Targets, and SL Management</Text>
        </View>

        {/* Current Active Signal Highlight Card */}
        {hasLiveSignal ? (
          <View style={[styles.activeCard, isBuyCe ? styles.activeCardBull : styles.activeCardBear]}>
            <View style={styles.activeCardTop}>
              <View style={styles.activeSignalTag}>
                <Ionicons
                  name={isBuyCe ? 'arrow-up-circle' : 'arrow-down-circle'}
                  size={18}
                  color={isBuyCe ? THEME.colors.bullish : THEME.colors.bearish}
                />
                <Text
                  style={[
                    styles.activeSignalText,
                    { color: isBuyCe ? THEME.colors.bullish : THEME.colors.bearish },
                  ]}
                >
                  LIVE ACTIVE: {signalAnalysis.signalStrength} ({isBuyCe ? 'CALL BUY' : 'PUT BUY'})
                </Text>
              </View>
              <View style={styles.confidenceBadge}>
                <Text style={styles.confidenceText}>{signalAnalysis.confidence}% CONFIDENCE</Text>
              </View>
            </View>

            <View style={styles.metricsGrid}>
              <View style={styles.metricCol}>
                <Text style={styles.metricLabel}>STRIKE</Text>
                <Text style={styles.metricVal}>{signalAnalysis.atmStrike || marketData?.spot} {isBuyCe ? 'CE' : 'PE'}</Text>
              </View>
              <View style={styles.metricCol}>
                <Text style={styles.metricLabel}>SUGG. ENTRY</Text>
                <Text style={styles.metricVal}>₹{signalAnalysis.suggestedEntry || '120'}</Text>
              </View>
              <View style={styles.metricCol}>
                <Text style={styles.metricLabel}>TARGET 1</Text>
                <Text style={[styles.metricVal, { color: THEME.colors.bullish }]}>₹{signalAnalysis.target1 || '155'}</Text>
              </View>
              <View style={styles.metricCol}>
                <Text style={styles.metricLabel}>STOP LOSS</Text>
                <Text style={[styles.metricVal, { color: THEME.colors.bearish }]}>₹{signalAnalysis.stopLoss || '95'}</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.noSignalCard}>
            <Ionicons name="hourglass-outline" size={24} color={THEME.colors.textMuted} />
            <Text style={styles.noSignalTitle}>Waiting for High Probability Trade Trigger</Text>
            <Text style={styles.noSignalDesc}>
              PCR ({Number(marketData?.pcr_oi || 1).toFixed(2)}) & Momentum currently in range-bound accumulation.
            </Text>
          </View>
        )}

        {/* Filter Pills */}
        <View style={styles.filterRow}>
          <Text style={styles.filterSectionTitle}>HISTORICAL LOGS ({filteredJournal.length})</Text>
          <View style={styles.filterGroup}>
            {['ALL', 'BUY_CE', 'BUY_PE'].map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterPill, filterType === f && styles.filterPillActive]}
                onPress={() => setFilterType(f)}
              >
                <Text style={[styles.filterPillText, filterType === f && styles.filterPillTextActive]}>
                  {f === 'BUY_CE' ? 'Calls' : f === 'BUY_PE' ? 'Puts' : 'All'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Journal Entries List */}
        {filteredJournal.length === 0 ? (
          <View style={styles.emptyJournal}>
            <Ionicons name="document-text-outline" size={32} color={THEME.colors.textMuted} />
            <Text style={styles.emptyJournalText}>No trade signals triggered yet in this session.</Text>
          </View>
        ) : (
          <View style={styles.journalList}>
            {filteredJournal.map((entry) => {
              const entryBull = entry.type === 'BUY_CE';
              return (
                <View key={entry.id} style={styles.journalCard}>
                  <View style={styles.journalCardHeader}>
                    <View style={styles.journalTypeTag}>
                      <Ionicons
                        name={entryBull ? 'arrow-up' : 'arrow-down'}
                        size={14}
                        color={entryBull ? THEME.colors.bullish : THEME.colors.bearish}
                      />
                      <Text
                        style={[
                          styles.journalTypeText,
                          { color: entryBull ? THEME.colors.bullish : THEME.colors.bearish },
                        ]}
                      >
                        {entry.symbol} {entry.strike} {entryBull ? 'CE' : 'PE'}
                      </Text>
                    </View>
                    <Text style={styles.journalTime}>{entry.time}</Text>
                  </View>

                  <View style={styles.journalDetailsGrid}>
                    <View style={styles.jDetailItem}>
                      <Text style={styles.jDetailLabel}>Entry</Text>
                      <Text style={styles.jDetailVal}>₹{entry.entry}</Text>
                    </View>
                    <View style={styles.jDetailItem}>
                      <Text style={styles.jDetailLabel}>Target 1</Text>
                      <Text style={[styles.jDetailVal, { color: THEME.colors.bullish }]}>₹{entry.target1}</Text>
                    </View>
                    <View style={styles.jDetailItem}>
                      <Text style={styles.jDetailLabel}>Target 2</Text>
                      <Text style={[styles.jDetailVal, { color: THEME.colors.bullish }]}>₹{entry.target2}</Text>
                    </View>
                    <View style={styles.jDetailItem}>
                      <Text style={styles.jDetailLabel}>Stop Loss</Text>
                      <Text style={[styles.jDetailVal, { color: THEME.colors.bearish }]}>₹{entry.stopLoss}</Text>
                    </View>
                  </View>

                  <View style={styles.journalFooter}>
                    <Text style={styles.footerNote}>
                      PCR at trigger: <Text style={{ color: THEME.colors.textPrimary, fontWeight: '700' }}>{Number(entry.pcr || 1).toFixed(2)}</Text>
                    </Text>
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusBadgeText}>{entry.status}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.bgDark,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 40,
  },
  titleBanner: {
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pageTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  pageSubtitle: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  activeCard: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  activeCardBull: {
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  activeCardBear: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  activeCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  activeSignalTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeSignalText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  confidenceBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  confidenceText: {
    color: THEME.colors.textPrimary,
    fontSize: 10,
    fontWeight: '800',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: THEME.colors.bgCard,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
  },
  metricCol: {
    alignItems: 'center',
  },
  metricLabel: {
    color: THEME.colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    marginBottom: 2,
  },
  metricVal: {
    color: THEME.colors.textPrimary,
    fontSize: 12,
    fontWeight: '900',
  },
  noSignalCard: {
    backgroundColor: THEME.colors.bgCard,
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  noSignalTitle: {
    color: THEME.colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
  },
  noSignalDesc: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  filterSectionTitle: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  filterGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: THEME.colors.bgCard,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
  },
  filterPillActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary,
  },
  filterPillText: {
    color: THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  filterPillTextActive: {
    color: '#071a26',
    fontWeight: '900',
  },
  journalList: {
    gap: 10,
  },
  journalCard: {
    backgroundColor: THEME.colors.bgCard,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
  },
  journalCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  journalTypeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  journalTypeText: {
    fontSize: 12,
    fontWeight: '900',
  },
  journalTime: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  journalDetailsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  jDetailItem: {
    alignItems: 'center',
  },
  jDetailLabel: {
    color: THEME.colors.textMuted,
    fontSize: 9,
  },
  jDetailVal: {
    color: THEME.colors.textPrimary,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  journalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerNote: {
    color: THEME.colors.textMuted,
    fontSize: 10,
  },
  statusBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: {
    color: THEME.colors.primary,
    fontSize: 9,
    fontWeight: '800',
  },
  emptyJournal: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    gap: 8,
  },
  emptyJournalText: {
    color: THEME.colors.textMuted,
    fontSize: 12,
  },
});
