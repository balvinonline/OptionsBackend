import React, { useMemo } from 'react';
import { StyleSheet, Text, View, Dimensions } from 'react-native';
import Svg, { Line, Rect, Polyline, Text as SvgText } from 'react-native-svg';
import { THEME } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const CandlestickChart = ({ candles = [], height = 260, showIndicators = true }) => {
  const chartWidth = SCREEN_WIDTH - 28;
  const chartHeight = height - 40;

  // If no candles provided, generate realistic synthetic intraday data for testing/fallback
  const data = useMemo(() => {
    if (candles && candles.length > 5) return candles.slice(-40);
    
    // Generate synthetic 30 candles
    let base = 24350;
    const list = [];
    for (let i = 0; i < 30; i++) {
      const open = base + (Math.sin(i / 3) * 20) + (Math.random() * 15 - 7);
      const close = open + (Math.random() * 24 - 11);
      const high = Math.max(open, close) + Math.random() * 8;
      const low = Math.min(open, close) - Math.random() * 8;
      base = close;
      list.push({ open, close, high, low, time: `${9 + Math.floor(i / 12)}:${(i * 5) % 60}` });
    }
    return list;
  }, [candles]);

  const { minVal, maxVal, candleWidth, candlesRenderData, vwapPoints, emaPoints } = useMemo(() => {
    if (!data.length) return { minVal: 0, maxVal: 1, candleWidth: 6, candlesRenderData: [], vwapPoints: '', emaPoints: '' };

    let min = Infinity;
    let max = -Infinity;
    data.forEach(c => {
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
    });

    // Add padding to range
    const pad = (max - min) * 0.1 || 10;
    min -= pad;
    max += pad;
    const range = max - min;

    const widthPerCandle = chartWidth / data.length;
    const cWidth = Math.max(3, widthPerCandle * 0.7);

    // Compute VWAP and EMA
    let cumulativeTpVol = 0;
    let cumulativeVol = 0;
    const vwapCoords = [];
    const emaCoords = [];
    let ema = data[0].close;
    const k = 2 / (9 + 1);

    const rendered = data.map((c, i) => {
      const x = i * widthPerCandle + widthPerCandle / 2;
      const yOpen = chartHeight - ((c.open - min) / range) * chartHeight;
      const yClose = chartHeight - ((c.close - min) / range) * chartHeight;
      const yHigh = chartHeight - ((c.high - min) / range) * chartHeight;
      const yLow = chartHeight - ((c.low - min) / range) * chartHeight;

      const isBull = c.close >= c.open;
      const top = Math.min(yOpen, yClose);
      const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));

      // Indicator tracking
      const typicalPrice = (c.high + c.low + c.close) / 3;
      cumulativeTpVol += typicalPrice * 100;
      cumulativeVol += 100;
      const currentVwap = cumulativeTpVol / cumulativeVol;
      const yVwap = chartHeight - ((currentVwap - min) / range) * chartHeight;
      vwapCoords.push(`${x},${yVwap}`);

      ema = c.close * k + ema * (1 - k);
      const yEma = chartHeight - ((ema - min) / range) * chartHeight;
      emaCoords.push(`${x},${yEma}`);

      return {
        x,
        top,
        bodyHeight,
        yHigh,
        yLow,
        isBull,
        data: c
      };
    });

    return {
      minVal: min,
      maxVal: max,
      candleWidth: cWidth,
      candlesRenderData: rendered,
      vwapPoints: vwapCoords.join(' '),
      emaPoints: emaCoords.join(' ')
    };
  }, [data, chartWidth, chartHeight]);

  return (
    <View style={[styles.container, { height }]}>
      {/* Indicator Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: THEME.colors.primary }]} />
          <Text style={styles.legendText}>VWAP</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#eab308' }]} />
          <Text style={styles.legendText}>EMA 9</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: THEME.colors.bullish }]} />
          <Text style={styles.legendText}>Bullish</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: THEME.colors.bearish }]} />
          <Text style={styles.legendText}>Bearish</Text>
        </View>
      </View>

      {/* SVG Candlestick Canvas */}
      <Svg width={chartWidth} height={chartHeight}>
        {/* Horizontal grid lines */}
        {[0.2, 0.5, 0.8].map((ratio, idx) => {
          const y = chartHeight * ratio;
          const val = maxVal - (maxVal - minVal) * ratio;
          return (
            <React.Fragment key={idx}>
              <Line
                x1={0}
                y1={y}
                x2={chartWidth}
                y2={y}
                stroke={THEME.colors.borderLight}
                strokeDasharray="4 4"
                strokeWidth={1}
              />
              <SvgText
                x={chartWidth - 45}
                y={y - 4}
                fill={THEME.colors.textMuted}
                fontSize={9}
                fontWeight="700"
              >
                {val.toFixed(0)}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* Candles */}
        {candlesRenderData.map((c, i) => (
          <React.Fragment key={i}>
            {/* High/Low Wick */}
            <Line
              x1={c.x}
              y1={c.yHigh}
              x2={c.x}
              y2={c.yLow}
              stroke={c.isBull ? THEME.colors.bullish : THEME.colors.bearish}
              strokeWidth={1.5}
            />
            {/* Real Candle Body */}
            <Rect
              x={c.x - candleWidth / 2}
              y={c.top}
              width={candleWidth}
              height={c.bodyHeight}
              fill={c.isBull ? THEME.colors.bullish : THEME.colors.bearish}
              rx={1}
            />
          </React.Fragment>
        ))}

        {/* Indicator Overlays */}
        {showIndicators && vwapPoints ? (
          <Polyline
            points={vwapPoints}
            fill="none"
            stroke={THEME.colors.primary}
            strokeWidth={1.8}
          />
        ) : null}

        {showIndicators && emaPoints ? (
          <Polyline
            points={emaPoints}
            fill="none"
            stroke="#eab308"
            strokeWidth={1.5}
          />
        ) : null}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: THEME.colors.bgCardSolid,
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    ...THEME.shadows.card,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    color: THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
});
