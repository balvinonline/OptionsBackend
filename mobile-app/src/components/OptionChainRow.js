import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export const OptionChainRow = React.memo(({ row, isATM, maxOi, onOptionPress }) => {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const strike = Number(row.strike);
  const ceSymbol = row.symbol_CE || row.ce_symbol || '';
  const peSymbol = row.symbol_PE || row.pe_symbol || '';
  const ceOi = Number(row.oi_CE || row.ce_oi || 0);
  const ceOiChg = Number(row.oich_CE || row.ce_oich || 0);
  const ceLtp = Number(row.ltp_CE || row.ce_ltp || 0);
  const ceChg = Number(row.chng_CE || row.ce_ch || 0);
  const ceVol = Number(row.volume_CE || row.ce_volume || 0);
  const ceIv = Number(row.iv_CE || row.ce_iv || 0);

  const peOi = Number(row.oi_PE || row.pe_oi || 0);
  const peOiChg = Number(row.oich_PE || row.pe_oich || 0);
  const peLtp = Number(row.ltp_PE || row.pe_ltp || 0);
  const peChg = Number(row.chng_PE || row.pe_ch || 0);
  const peVol = Number(row.volume_PE || row.pe_volume || 0);
  const peIv = Number(row.iv_PE || row.pe_iv || 0);

  const getBuildUp = (ltpChg, oiChg) => {
    if (ltpChg > 0 && oiChg > 0) return { label: 'L', bg: theme.colors.bullish, color: '#fff' }; // Long Buildup
    if (ltpChg > 0 && oiChg < 0) return { label: 'SC', bg: '#4ade80', color: '#000' }; // Short Covering
    if (ltpChg < 0 && oiChg > 0) return { label: 'S', bg: theme.colors.bearish, color: '#fff' }; // Short Writing
    if (ltpChg < 0 && oiChg < 0) return { label: 'LU', bg: theme.colors.warning, color: '#000' }; // Long Unwinding
    return null;
  };

  const checkSqueeze = (vol, oi, oiChg) => {
    if (oi > 0 && vol > oi * 2.5 && oiChg > 0) return true;
    return false;
  };

  const ceBuildUp = getBuildUp(ceChg, ceOiChg);
  const peBuildUp = getBuildUp(peChg, peOiChg);
  
  const ceSqueeze = checkSqueeze(ceVol, ceOi, ceOiChg);
  const peSqueeze = checkSqueeze(peVol, peOi, peOiChg);

  const [ceFlash, setCeFlash] = useState(null); // 'up' or 'down'
  const [peFlash, setPeFlash] = useState(null); // 'up' or 'down'
  
  const prevCeLtp = useRef(ceLtp);
  const prevPeLtp = useRef(peLtp);

  useEffect(() => {
    if (ceLtp > prevCeLtp.current) {
      setCeFlash('up');
      setTimeout(() => setCeFlash(null), 300);
    } else if (ceLtp < prevCeLtp.current) {
      setCeFlash('down');
      setTimeout(() => setCeFlash(null), 300);
    }
    prevCeLtp.current = ceLtp;
  }, [ceLtp]);

  useEffect(() => {
    if (peLtp > prevPeLtp.current) {
      setPeFlash('up');
      setTimeout(() => setPeFlash(null), 300);
    } else if (peLtp < prevPeLtp.current) {
      setPeFlash('down');
      setTimeout(() => setPeFlash(null), 300);
    }
    prevPeLtp.current = peLtp;
  }, [peLtp]);

  const ceFlashStyle = ceFlash === 'up' ? styles.flashUp : ceFlash === 'down' ? styles.flashDown : null;
  const peFlashStyle = peFlash === 'up' ? styles.flashUp : peFlash === 'down' ? styles.flashDown : null;

  const ceBarWidth = maxOi > 0 ? Math.min(100, (ceOi / maxOi) * 100) : 0;
  const peBarWidth = maxOi > 0 ? Math.min(100, (peOi / maxOi) * 100) : 0;

  const formatCompact = (val) => {
    if (!val || isNaN(val)) return '0';
    if (Math.abs(val) >= 100000) return (val / 100000).toFixed(1) + 'L';
    if (Math.abs(val) >= 1000) return (val / 1000).toFixed(0) + 'k';
    return String(val);
  };

  return (
    <View style={[styles.row, isATM && styles.atmRow]}>
      {/* CALL SIDE */}
      <TouchableOpacity 
        style={styles.sideColumn}
        onPress={() => onOptionPress && onOptionPress({ symbol: ceSymbol, ltp: ceLtp, side: 'CE' })}
        activeOpacity={0.7}
      >
        <View style={[styles.ceOiBar, { width: `${ceBarWidth}%` }]} />
        <View style={styles.cellContent}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {ceSqueeze && <Text style={{ fontSize: 12 }}>🔥</Text>}
            {ceBuildUp && (
              <View style={[styles.buildupBadge, { backgroundColor: ceBuildUp.bg }]}>
                <Text style={[styles.buildupText, { color: ceBuildUp.color }]}>{ceBuildUp.label}</Text>
              </View>
            )}
            <Text style={[styles.oiText, { color: theme.colors.bearish, textAlign: 'right' }]}>{formatCompact(ceOi)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.oiChgText, ceOiChg >= 0 ? styles.positiveChg : styles.negativeChg]}>
              {ceOiChg > 0 ? `+${formatCompact(ceOiChg)}` : formatCompact(ceOiChg)}
            </Text>
            {ceIv > 0 && <Text style={styles.ivText}>IV: {ceIv.toFixed(1)}</Text>}
          </View>
          <Text style={[styles.ltpText, ceFlashStyle]}>₹{ceLtp.toFixed(1)}</Text>
        </View>
      </TouchableOpacity>

      {/* STRIKE */}
      <View style={styles.strikeCenter}>
        <Text style={[styles.strikeText, isATM && styles.atmStrikeText]}>{strike}</Text>
        {isATM ? <Text style={styles.atmBadge}>ATM</Text> : null}
      </View>

      {/* PUT SIDE */}
      <TouchableOpacity 
        style={styles.sideColumn}
        onPress={() => onOptionPress && onOptionPress({ symbol: peSymbol, ltp: peLtp, side: 'PE' })}
        activeOpacity={0.7}
      >
        <View style={[styles.peOiBar, { width: `${peBarWidth}%` }]} />
        <View style={[styles.cellContent, { justifyContent: 'flex-end' }]}>
          <Text style={[styles.ltpText, peFlashStyle]}>₹{peLtp.toFixed(1)}</Text>
          <View style={{ alignItems: 'flex-start' }}>
            <Text style={[styles.oiChgText, peOiChg >= 0 ? styles.positiveChg : styles.negativeChg]}>
              {peOiChg > 0 ? `+${formatCompact(peOiChg)}` : formatCompact(peOiChg)}
            </Text>
            {peIv > 0 && <Text style={styles.ivText}>IV: {peIv.toFixed(1)}</Text>}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[styles.oiText, { color: theme.colors.bullish }]}>{formatCompact(peOi)}</Text>
            {peBuildUp && (
              <View style={[styles.buildupBadge, { backgroundColor: peBuildUp.bg }]}>
                <Text style={[styles.buildupText, { color: peBuildUp.color }]}>{peBuildUp.label}</Text>
              </View>
            )}
            {peSqueeze && <Text style={{ fontSize: 12 }}>🔥</Text>}
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
});

const getStyles = (theme) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.bgDark,
  },
  atmRow: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.primary,
  },
  sideColumn: {
    flex: 1,
    height: '100%',
    position: 'relative',
    justifyContent: 'center',
  },
  ceOiBar: {
    position: 'absolute',
    left: 0,
    top: 2,
    bottom: 2,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 2,
  },
  peOiBar: {
    position: 'absolute',
    right: 0,
    top: 2,
    bottom: 2,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 2,
  },
  cellContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 8,
  },
  oiText: {
    fontSize: 11,
    fontWeight: '800',
    width: 42,
  },
  oiChgText: {
    fontSize: 9,
    fontWeight: '700',
  },
  ivText: {
    fontSize: 8,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  positiveChg: {
    color: theme.colors.bullish,
  },
  negativeChg: {
    color: theme.colors.bearish,
  },
  ltpText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '900',
    minWidth: 46,
  },
  strikeCenter: {
    width: 76,
    height: '100%',
    backgroundColor: theme.colors.bgCardElevated,
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: theme.colors.border,
  },
  atmStrikeCenter: {
    backgroundColor: theme.colors.primary,
  },
  strikeText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '900',
  },
  atmStrikeText: {
    color: '#071a26',
    fontWeight: '900',
  },
  atmBadge: {
    color: '#071a26',
    fontSize: 8,
    fontWeight: '900',
    marginTop: -2,
  },
  flashUp: {
    backgroundColor: 'rgba(16, 185, 129, 0.4)',
    color: '#fff',
    borderRadius: 4,
    overflow: 'hidden',
  },
  flashDown: {
    backgroundColor: 'rgba(239, 68, 68, 0.4)',
    color: '#fff',
    borderRadius: 4,
    overflow: 'hidden',
  },
});
