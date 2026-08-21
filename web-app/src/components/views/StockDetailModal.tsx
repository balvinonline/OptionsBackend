"use client";
import React, { useEffect, useState, useRef } from 'react';
import { X, Activity } from 'lucide-react';
import { api } from '../../services/api';
import { createChart, ColorType, CandlestickSeries, Time } from 'lightweight-charts';

export const StockDetailModal = ({ symbol, isOpen, onClose }: { symbol: string, isOpen: boolean, onClose: () => void }) => {
  const [detail, setDetail] = useState<any>(null);
  const [candles, setCandles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen || !symbol) return;
    
    let isMounted = true;
    setLoading(true);
    
    const fetchAll = async () => {
      try {
        const [detailRes, histRes] = await Promise.allSettled([
          api.getStockOptionsDetail(symbol),
          api.getFyersHistory(`NSE:${symbol}-EQ`, "5", 21600) // 15 days
        ]);
        
        if (!isMounted) return;
        
        if (detailRes.status === 'fulfilled') setDetail(detailRes.value);
        if (histRes.status === 'fulfilled' && histRes.value?.candles) {
          setCandles(histRes.value.candles);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchAll();
    
    return () => { isMounted = false; };
  }, [symbol, isOpen]);

  // Chart init
  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0 || !isOpen) return;
    
    if (chartRef.current) {
      chartRef.current.remove();
    }
    
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
      timeScale: {
        borderColor: 'rgba(31, 41, 55, 0.5)',
        timeVisible: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });
    
    const displayCandles = candles.slice(-200);
    const formatted = displayCandles.map(c => {
      let timeVal = c.ts > 10000000000 ? Math.floor(c.ts / 1000) : c.ts;
      return {
        time: (timeVal + 19800) as Time,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close)
      };
    });
    
    candleSeries.setData(formatted);
    chart.timeScale().fitContent();
    
    chartRef.current = chart;
    seriesRef.current = candleSeries;
    
    return () => {
      if (chartRef.current) chartRef.current.remove();
    };
  }, [candles, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-950 border border-gray-800 rounded-xl w-full max-w-7xl h-[80vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-gray-900/80">
          <div>
            <div className="text-xs text-blue-500 font-bold tracking-wider uppercase mb-1">Selected Stock</div>
            <h2 className="text-xl font-bold text-white flex items-center">
              {symbol} 
              {detail?.spot?.change_pct && (
                <span className={`ml-3 text-sm ${detail.spot.change_pct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {detail.spot.change_pct >= 0 ? '↑' : '↓'} {Math.abs(detail.spot.change_pct)}%
                </span>
              )}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12">
            <Activity className="w-8 h-8 text-blue-500 animate-pulse mb-4" />
            <p className="text-gray-400">Loading comprehensive option data for {symbol}...</p>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col md:flex-row p-4 gap-4">
            
            {/* Left: Option Chain */}
            <div className="w-full md:w-1/2 flex flex-col border border-gray-800 rounded-lg overflow-hidden bg-gray-900">
              <div className="p-3 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
                <div>
                  <span className="text-xs text-blue-400 font-bold uppercase tracking-wider">Option Chain</span>
                  <div className="text-sm text-gray-300 font-semibold">{symbol} Chain</div>
                </div>
                <div className="text-xs bg-gray-950 px-2 py-1 rounded text-gray-400 border border-gray-800">
                  Spot: {detail?.spot?.ltp || '-'}
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-xs text-right">
                  <thead className="text-gray-400 bg-gray-950 sticky top-0 z-10 border-b border-gray-800 shadow-sm">
                    <tr>
                      <th className="py-2 px-2">Call OI</th>
                      <th className="py-2 px-2">Call Chg</th>
                      <th className="py-2 px-2">Call LTP</th>
                      <th className="py-2 px-2 font-bold text-center text-blue-400">Strike</th>
                      <th className="py-2 px-2">Put LTP</th>
                      <th className="py-2 px-2">Put Chg</th>
                      <th className="py-2 px-2">Put OI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {(detail?.optionChain || []).map((row: any, i: number) => {
                      const ceOi = Number(row.ce_oi || row.oi_CE || 0);
                      const ceOiChg = Number(row.ce_oich || row.oich_CE || 0);
                      const ceLtp = Number(row.ce_ltp || row.ltp_CE || 0);
                      
                      const peOi = Number(row.pe_oi || row.oi_PE || 0);
                      const peOiChg = Number(row.pe_oich || row.oich_PE || 0);
                      const peLtp = Number(row.pe_ltp || row.ltp_PE || 0);
                      
                      const formatK = (v: number) => Math.abs(v) > 1000 ? (v/1000).toFixed(1) + 'k' : v;
                      
                      return (
                        <tr key={i} className="hover:bg-gray-800/50">
                          <td className="py-2 px-2 text-red-400/80">{formatK(ceOi)}</td>
                          <td className={`py-2 px-2 ${ceOiChg >= 0 ? 'text-green-500' : 'text-red-500'}`}>{ceOiChg > 0 ? '+' : ''}{formatK(ceOiChg)}</td>
                          <td className="py-2 px-2 font-medium text-gray-200">{ceLtp.toFixed(1)}</td>
                          <td className="py-2 px-2 text-center font-bold text-gray-300 bg-gray-950/30">{row.strike}</td>
                          <td className="py-2 px-2 font-medium text-gray-200">{peLtp.toFixed(1)}</td>
                          <td className={`py-2 px-2 ${peOiChg >= 0 ? 'text-green-500' : 'text-red-500'}`}>{peOiChg > 0 ? '+' : ''}{formatK(peOiChg)}</td>
                          <td className="py-2 px-2 text-green-400/80">{formatK(peOi)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Right: Chart */}
            <div className="w-full md:w-1/2 flex flex-col border border-gray-800 rounded-lg overflow-hidden bg-gray-900">
              <div className="p-3 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
                <div>
                  <span className="text-xs text-blue-400 font-bold uppercase tracking-wider">Live Stock Chart</span>
                  <div className="text-sm text-gray-300 font-semibold">{symbol} 5m Chart</div>
                </div>
                <div className="text-xs bg-gray-950 px-2 py-1 rounded text-gray-400 border border-gray-800">
                  {candles.length} candles
                </div>
              </div>
              
              <div className="flex-1 w-full relative" ref={chartContainerRef}>
                {/* Chart injects here */}
              </div>
            </div>
            
          </div>
        )}
      </div>
    </div>
  );
};
