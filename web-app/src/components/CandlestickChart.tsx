'use client';

import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, ISeriesApi, Time, CandlestickSeries, LineSeries } from 'lightweight-charts';
import { useMarket } from '../context/MarketContext';
import { calculateVWAP, calculateEMA, calculateSupportResistance } from '../utils/indicators';

export const CandlestickChart = ({ fullScreen = false }: { fullScreen?: boolean }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const vwapSeriesRef = useRef<any>(null);
  const ema9SeriesRef = useRef<any>(null);
  const ema21SeriesRef = useRef<any>(null);
  const supportResistanceLinesRef = useRef<any[]>([]);
  const liveCandleRef = useRef<any>(null);
  
  const { indexCandles, marketData, selectedIndex, chartResolution, setChartResolution } = useMarket();

  const timeframes = [
    { label: '1m', value: '1' },
    { label: '5m', value: '5' },
    { label: '15m', value: '15' },
    { label: '1H', value: '60' },
    { label: '1D', value: 'D' },
  ];

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: 'rgba(31, 41, 55, 0.5)' },
        horzLines: { color: 'rgba(31, 41, 55, 0.5)' },
      },
      crosshair: {
        mode: 1, // Normal mode
      },
      rightPriceScale: {
        borderColor: 'rgba(31, 41, 55, 0.5)',
      },
      timeScale: {
        borderColor: 'rgba(31, 41, 55, 0.5)',
        timeVisible: true,
        secondsVisible: false,
      },
      autoSize: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    const vwapSeries = chart.addSeries(LineSeries, {
      color: '#eab308', // yellow
      lineWidth: 2,
      crosshairMarkerVisible: false,
    });

    const ema9Series = chart.addSeries(LineSeries, {
      color: '#3b82f6', // blue
      lineWidth: 1,
      lineStyle: 2, // dashed
      crosshairMarkerVisible: false,
    });

    const ema21Series = chart.addSeries(LineSeries, {
      color: '#ec4899', // pink
      lineWidth: 1,
      crosshairMarkerVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = candleSeries;
    vwapSeriesRef.current = vwapSeries;
    ema9SeriesRef.current = ema9Series;
    ema21SeriesRef.current = ema21Series;

    return () => {
      chart.remove();
      supportResistanceLinesRef.current = [];
    };
  }, []);

  // Update data when indexCandles changes
  useEffect(() => {
    if (!seriesRef.current || !indexCandles || indexCandles.length === 0) return;
    
    // Convert to lightweight-charts format
    const displayCandles = fullScreen ? indexCandles : indexCandles.slice(-120);
    const formattedData = displayCandles.map((c: any) => {
      const timeVal = c.ts > 10000000000 ? Math.floor(c.ts / 1000) : c.ts;
      return {
        time: timeVal as Time,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      };
    });

    const uniqueData = Array.from(new Map(formattedData.map((item: any) => [item.time, item])).values())
      .sort((a: any, b: any) => (a.time as number) - (b.time as number));

    seriesRef.current.setData(uniqueData as any);

    // Calculate indicators based on the NEW data
    const vwapData = calculateVWAP(uniqueData);
    if (vwapSeriesRef.current) vwapSeriesRef.current.setData(vwapData as any);

    const ema9Data = calculateEMA(uniqueData, 9).filter(d => d.value !== null);
    if (ema9SeriesRef.current) ema9SeriesRef.current.setData(ema9Data as any);

    const ema21Data = calculateEMA(uniqueData, 21).filter(d => d.value !== null);
    if (ema21SeriesRef.current) ema21SeriesRef.current.setData(ema21Data as any);

    const srLevels = calculateSupportResistance(uniqueData);
    
    // Remove old price lines safely
    try {
      if (supportResistanceLinesRef.current && supportResistanceLinesRef.current.length > 0) {
        supportResistanceLinesRef.current.forEach(line => {
          if (line && seriesRef.current) {
            seriesRef.current.removePriceLine(line);
          }
        });
      }
    } catch (e) {
      console.warn("Could not remove old price lines", e);
    }
    
    supportResistanceLinesRef.current = srLevels.map(level => {
      return seriesRef.current!.createPriceLine({
        price: level.price,
        color: level.type === 'Support' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)',
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `${level.type} (${level.strength})`,
      });
    });

    liveCandleRef.current = null;
    if (uniqueData.length) {
      const last = uniqueData[uniqueData.length - 1];
      liveCandleRef.current = { ...last };
    }
    // Preserve the user's current viewport during periodic history refreshes.
    if (uniqueData.length && !chartRef.current?.timeScale().getVisibleLogicalRange()) {
      chartRef.current?.timeScale().fitContent();
    }
  }, [indexCandles]);

  // Aggregate each live spot tick into its actual timeframe bucket.
  useEffect(() => {
    if (!seriesRef.current || !marketData?.spot) return;

    const currentSpot = typeof marketData.spot === 'object'
      ? Number(marketData.spot?.ltp || 0)
      : Number(marketData.spot);
    if (!Number.isFinite(currentSpot) || currentSpot <= 0) return;

    // tickTimestamp is the backend's WebSocket receipt time (milliseconds).
    // It is used as a fallback clock, not represented as an exchange timestamp.
    const tickMs = Number(marketData.tickTimestamp) || Date.now();
    const intervalMinutes = chartResolution === 'D' ? 1440 : Math.max(1, Number(chartResolution) || 5);
    const istOffsetSeconds = 19800;
    const tickSeconds = Math.floor(tickMs / 1000);
    const istSeconds = tickSeconds + istOffsetSeconds;
    let bucketSeconds;

    if (chartResolution === 'D') {
      const istDate = new Date(istSeconds * 1000);
      istDate.setUTCHours(0, 0, 0, 0);
      bucketSeconds = Math.floor(istDate.getTime() / 1000) - istOffsetSeconds;
    } else {
      const intervalSeconds = intervalMinutes * 60;
      // Intraday bars are anchored to the 09:15 IST exchange session open.
      const sessionAnchor = Math.floor(istSeconds / 86400) * 86400 + (9 * 60 + 15) * 60;
      bucketSeconds = sessionAnchor + Math.floor((istSeconds - sessionAnchor) / intervalSeconds) * intervalSeconds - istOffsetSeconds;
    }

    const lastHistorical = indexCandles?.length ? indexCandles[indexCandles.length - 1] : null;
    const lastHistoricalTime = lastHistorical
      ? (lastHistorical.ts > 10000000000 ? Math.floor(lastHistorical.ts / 1000) : Number(lastHistorical.ts))
      : null;
    const current = liveCandleRef.current;

    if (current && Number(current.time) === bucketSeconds) {
      current.high = Math.max(Number(current.high), currentSpot);
      current.low = Math.min(Number(current.low), currentSpot);
      current.close = currentSpot;
    } else if (lastHistoricalTime === bucketSeconds && lastHistorical) {
      liveCandleRef.current = {
        time: bucketSeconds,
        open: Number(lastHistorical.open),
        high: Math.max(Number(lastHistorical.high), currentSpot),
        low: Math.min(Number(lastHistorical.low), currentSpot),
        close: currentSpot,
      };
    } else if (lastHistoricalTime === null || bucketSeconds > lastHistoricalTime) {
      liveCandleRef.current = {
        time: bucketSeconds,
        open: currentSpot,
        high: currentSpot,
        low: currentSpot,
        close: currentSpot,
      };
    } else {
      return;
    }

    seriesRef.current.update({ ...liveCandleRef.current, time: bucketSeconds as Time } as any);
  }, [marketData?.spot, marketData?.tickTimestamp, chartResolution, indexCandles]);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 shadow-lg flex flex-col h-[500px]">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <div className="flex space-x-1 bg-gray-950 p-1 rounded-lg border border-gray-800">
            {timeframes.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setChartResolution(tf.value)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  chartResolution === tf.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
          <span className="text-sm font-bold text-gray-200 ml-2">{selectedIndex} Spot</span>
        </div>
        <div className="text-xs text-gray-400 flex items-center gap-3">
          <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-yellow-500 mr-1"></span> VWAP</span>
          <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-blue-500 mr-1"></span> 9 EMA</span>
          <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-pink-500 mr-1"></span> 21 EMA</span>
        </div>
      </div>
      <div className="flex-1 w-full relative" ref={chartContainerRef}>
        {/* Chart is injected here */}
      </div>
    </div>
  );
};
