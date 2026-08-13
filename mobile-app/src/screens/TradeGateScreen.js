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
import { useTheme } from '../context/ThemeContext';

export const TradeGateScreen = ({ onNavigate }) => {
  const { selectedIndex, tradeGateAnalysis, signalAnalysis, marketData } = useMarket();
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  const { score, total, verdict, items } = tradeGateAnalysis;
  const isHighProbability = score >= 16;
  const isModerate = score >= 12 && score < 16;

  const categories = ['ALL', 'Trend', 'Timing', 'Momentum', 'OI Analytics', 'Heavyweights', 'Risk', 'Execution'];

  const filteredItems = items.filter((item) => {
    if (selectedCategory === 'ALL') return true;
    return item.category === selectedCategory;
  });

  return (
    <View style={styles.container}>
      <IndexHeader onOpenSettings={() => onNavigate && onNavigate('Settings')} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Title Header */}
        <View style={styles.titleBanner}>
          <View style={styles.titleRow}>
            <Ionicons name="shield-checkmark" size={20} color={theme.colors.primary} />
            <Text style={styles.pageTitle}>{selectedIndex} OPTION BUYER TRADE GATE</Text>
          </View>
          <Text style={styles.pageSubtitle}>20-Point High Probability Rule-Based Verification</Text>
        </View>

        {/* Master Score Banner */}
        <View
          style={[
            styles.scoreBanner,
            isHighProbability ? styles.scoreBannerBull : isModerate ? styles.scoreBannerWarn : styles.scoreBannerNeutral,
          ]}
        >
          <View style={styles.scoreRow}>
            <View style={styles.scoreNumberCol}>
              <Text style={styles.scoreText}>
                {score} <Text style={styles.scoreTotalText}>/ {total}</Text>
              </Text>
              <Text style={styles.scoreLabel}>CHECKLIST SCORE</Text>
            </View>

            <View style={styles.verdictCol}>
              <View
                style={[
                  styles.verdictBadge,
                  {
                    backgroundColor: isHighProbability
                      ? 'rgba(34, 197, 94, 0.2)'
                      : isModerate
                      ? 'rgba(245, 158, 11, 0.2)'
                      : 'rgba(100, 116, 139, 0.2)',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.verdictText,
                    {
                      color: isHighProbability
                        ? theme.colors.bullish
                        : isModerate
                        ? theme.colors.warning
                        : theme.colors.textSecondary,
                    },
                  ]}
                >
                  {verdict}
                </Text>
              </View>
              <Text style={styles.verdictHint}>
                {isHighProbability
                  ? 'All core momentum & OI conditions met'
                  : 'Wait for higher confirmation before executing'}
              </Text>
            </View>
          </View>
        </View>

        {/* Live Setup Parameter Strip */}
        <View style={styles.paramStrip}>
          <View style={styles.paramItem}>
            <Text style={styles.paramLabel}>SPOT LTP</Text>
            <Text style={styles.paramValue}>
              {Number(marketData?.spot || 0).toLocaleString('en-IN')}
            </Text>
          </View>
          <View style={styles.paramDivider} />
          <View style={styles.paramItem}>
            <Text style={styles.paramLabel}>PCR</Text>
            <Text style={[styles.paramValue, { color: Number(marketData?.pcr_oi) >= 1 ? theme.colors.bullish : theme.colors.bearish }]}>
              {Number(marketData?.pcr_oi || 1).toFixed(2)}
            </Text>
          </View>
          <View style={styles.paramDivider} />
          <View style={styles.paramItem}>
            <Text style={styles.paramLabel}>INDIA VIX</Text>
            <Text style={styles.paramValue}>{Number(marketData?.vix || 14).toFixed(2)}</Text>
          </View>
          <View style={styles.paramDivider} />
          <View style={styles.paramItem}>
            <Text style={styles.paramLabel}>ATM</Text>
            <Text style={[styles.paramValue, { color: theme.colors.primary }]}>
              {signalAnalysis?.atmStrike || '-'}
            </Text>
          </View>
        </View>

        {/* Category Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryPills}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.catPill, selectedCategory === cat && styles.catPillActive]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text style={[styles.catPillText, selectedCategory === cat && styles.catPillTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* 20-Point Checklist Items */}
        <View style={styles.itemsList}>
          {filteredItems.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemLeft}>
                <View
                  style={[
                    styles.checkCircle,
                    item.pass ? styles.checkCirclePass : styles.checkCircleFail,
                  ]}
                >
                  <Ionicons
                    name={item.pass ? 'checkmark' : 'close'}
                    size={14}
                    color={item.pass ? theme.colors.bullish : theme.colors.bearish}
                  />
                </View>
                <View style={styles.itemInfo}>
                  <View style={styles.itemHeaderRow}>
                    <Text style={styles.itemName}>
                      {item.id}. {item.name}
                    </Text>
                    <View style={styles.catBadge}>
                      <Text style={styles.catBadgeText}>{item.category}</Text>
                    </View>
                  </View>
                  <Text style={styles.itemDetail}>{item.detail}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const getStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgDark,
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
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  pageSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  scoreBanner: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  scoreBannerBull: {
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  scoreBannerWarn: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  scoreBannerNeutral: {
    backgroundColor: theme.colors.bgCard,
    borderColor: theme.colors.borderLight,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scoreNumberCol: {
    alignItems: 'flex-start',
  },
  scoreText: {
    fontSize: 32,
    fontWeight: '900',
    color: theme.colors.textPrimary,
  },
  scoreTotalText: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  scoreLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  verdictCol: {
    flex: 1,
    alignItems: 'flex-end',
    marginLeft: 14,
  },
  verdictBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 4,
  },
  verdictText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  verdictHint: {
    color: theme.colors.textMuted,
    fontSize: 10,
    textAlign: 'right',
  },
  paramStrip: {
    flexDirection: 'row',
    backgroundColor: theme.colors.bgCard,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 12,
  },
  paramItem: {
    alignItems: 'center',
  },
  paramLabel: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    marginBottom: 2,
  },
  paramValue: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '900',
  },
  paramDivider: {
    width: 1,
    height: 20,
    backgroundColor: theme.colors.borderLight,
  },
  categoryPills: {
    gap: 6,
    marginBottom: 12,
  },
  catPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: theme.colors.bgCard,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  catPillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  catPillText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  catPillTextActive: {
    color: '#071a26',
    fontWeight: '900',
  },
  itemsList: {
    gap: 8,
  },
  itemCard: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginTop: 2,
  },
  checkCirclePass: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: theme.colors.bullish,
  },
  checkCircleFail: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: theme.colors.bearish,
  },
  itemInfo: {
    flex: 1,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  itemName: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
  },
  catBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  catBadgeText: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  itemDetail: {
    color: theme.colors.textSecondary,
    fontSize: 11,
  },
});
