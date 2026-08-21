"use client";
import React, { useState } from 'react';
import { useMarket } from '../../context/MarketContext';
import { Activity, Target, Zap, ShieldAlert, BarChart3, TrendingUp, TrendingDown } from 'lucide-react';
import { StockDetailModal } from './StockDetailModal';

export const StockOptionsDeskView = () => {
  const { heavyweights = [] } = useMarket();
  const [selectedStock, setSelectedStock] = useState<any>(null);

  // Parse heavyweights
  const stocks = (heavyweights || []).map(s => {
    const pChange = Number(s.pChange ?? s.change_pct ?? s.pct_change ?? 0);
    const ltp = Number(s.ltp ?? s.lastPrice ?? s.close ?? 0);
    const symbol = s.symbol ?? s.name ?? "Unknown";
    const volume = Number(s.volume ?? 0);
    const oiPChange = Number(s.oiPChange ?? s.oi_change_pct ?? s.oi_pct_change ?? 0);
    return { ...s, symbol, ltp, pChange, volume, oiPChange };
  }).sort((a, b) => Math.abs(b.pChange) - Math.abs(a.pChange)); // Sort by most active (abs change)

  return (
    <div className="p-6 text-slate-200 space-y-6">
      
      {/* Heatmap Grid */}
      <div className="bg-slate-800/80 rounded-2xl p-5 border border-slate-700/50 shadow-xl">
        <div className="flex items-center gap-2 mb-6">
          <Activity className="w-5 h-5 text-indigo-400" />
          <h2 className="text-xl font-bold">Trending Stocks Heatmap</h2>
        </div>
        
        {stocks.length === 0 ? (
          <div className="text-slate-500 text-center py-10">Awaiting Market Data...</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {stocks.map((stock, i) => {
              const isUp = stock.pChange >= 0;
              const intensity = Math.min(Math.abs(stock.pChange) / 3, 1); // 0 to 1
              
              // Dynamic background based on intensity
              const opacity = 0.2 + (intensity * 0.8);
              
              const isSelected = selectedStock?.symbol === stock.symbol;

              return (
                <button
                  key={i}
                  onClick={() => setSelectedStock(stock)}
                  className={`relative p-3 rounded-xl border flex flex-col items-center justify-center transition-all hover:scale-105 active:scale-95 ${isSelected ? 'border-white ring-2 ring-white/20' : 'border-transparent'}`}
                  style={{ backgroundColor: isUp ? `rgba(16, 185, 129, ${opacity})` : `rgba(244, 63, 94, ${opacity})` }}
                >
                  <span className="font-bold text-sm text-white truncate w-full text-center">{stock.symbol}</span>
                  <span className="text-xs font-mono text-white/90">₹{stock.ltp.toFixed(1)}</span>
                  <span className="text-xs font-bold text-white mt-1">
                    {stock.pChange > 0 ? '+' : ''}{stock.pChange.toFixed(2)}%
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Signal Detail Pane */}
      {selectedStock ? (
        <div className="bg-slate-800/90 rounded-2xl p-6 border border-slate-700 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl ${selectedStock.pChange >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                {selectedStock.pChange >= 0 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
              </div>
              <div>
                <h2 className="text-2xl font-bold">{selectedStock.symbol} Action</h2>
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <span>₹{selectedStock.ltp.toFixed(2)}</span>
                  <span className={selectedStock.pChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    ({selectedStock.pChange > 0 ? '+' : ''}{selectedStock.pChange.toFixed(2)}%)
                  </span>
                </div>
              </div>
            </div>
            
            <div className="text-right">
              <div className="text-sm text-slate-400 mb-1">Signal Strength</div>
              <div className={`text-lg font-bold ${Math.abs(selectedStock.pChange) > 2 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {Math.abs(selectedStock.pChange) > 2 ? 'STRONG' : 'MODERATE'}
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
              <div className="text-slate-400 text-sm flex items-center gap-2 mb-2"><BarChart3 className="w-4 h-4"/> Volume</div>
              <div className="text-xl font-mono">{selectedStock.volume > 0 ? selectedStock.volume.toLocaleString() : 'N/A'}</div>
            </div>
            
            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
              <div className="text-slate-400 text-sm flex items-center gap-2 mb-2"><Activity className="w-4 h-4"/> OI Change</div>
              <div className={`text-xl font-mono ${selectedStock.oiPChange > 0 ? 'text-blue-400' : 'text-orange-400'}`}>
                {selectedStock.oiPChange > 0 ? '+' : ''}{selectedStock.oiPChange.toFixed(2)}%
              </div>
            </div>
            
            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
              <div className="text-slate-400 text-sm flex items-center gap-2 mb-2"><Target className="w-4 h-4"/> Action Type</div>
              <div className="text-lg font-semibold text-slate-200">
                {selectedStock.pChange > 0 && selectedStock.oiPChange > 0 ? 'Long Build Up' :
                 selectedStock.pChange < 0 && selectedStock.oiPChange > 0 ? 'Short Build Up' :
                 selectedStock.pChange > 0 && selectedStock.oiPChange < 0 ? 'Short Covering' :
                 selectedStock.pChange < 0 && selectedStock.oiPChange < 0 ? 'Long Unwinding' : 'Neutral'}
              </div>
            </div>

            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
              <div className="text-slate-400 text-sm flex items-center gap-2 mb-2"><Zap className="w-4 h-4"/> Trade Bias</div>
              <div className={`text-lg font-semibold ${selectedStock.pChange > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {selectedStock.pChange > 0 ? 'BULLISH' : 'BEARISH'}
              </div>
            </div>
          </div>
          
        </div>
      ) : (
        <div className="bg-slate-800/30 border border-slate-700/30 rounded-2xl p-10 flex flex-col items-center justify-center text-slate-500 border-dashed">
          <ShieldAlert className="w-8 h-8 mb-3 opacity-50" />
          <p>Select a stock from the heatmap to view detailed signals</p>
        </div>
      )}
      
      <StockDetailModal 
        isOpen={!!selectedStock} 
        symbol={selectedStock?.symbol} 
        onClose={() => setSelectedStock(null)} 
      />
    </div>
  );
};
