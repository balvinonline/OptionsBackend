"use client";
import React from 'react';
import { useMarket } from '../../context/MarketContext';
import { ArrowUpRight, ArrowDownRight, Activity, TrendingUp, TrendingDown, Layers } from 'lucide-react';

export const StockActionView = () => {
  const { sectorStocks = [], heavyweights = [] } = useMarket();

  // Parse sector data
  const sectors = (sectorStocks || []).map(s => {
    const change = s.pChange ?? s.change_pct ?? s.change ?? 0;
    const name = s.sector ?? s.symbol ?? s.name ?? "Unknown";
    return { name, change: Number(change) };
  }).sort((a, b) => b.change - a.change);

  // Parse heavyweights
  const stocks = (heavyweights || []).map(s => {
    const pChange = Number(s.pChange ?? s.change_pct ?? s.pct_change ?? 0);
    const oiPChange = Number(s.oiPChange ?? s.oi_change_pct ?? s.oi_pct_change ?? 0);
    const ltp = Number(s.ltp ?? s.lastPrice ?? s.close ?? 0);
    const symbol = s.symbol ?? s.name ?? "Unknown";
    return { symbol, ltp, pChange, oiPChange };
  });

  // Categorize
  const topGainers = [...stocks].sort((a, b) => b.pChange - a.pChange).slice(0, 5);
  const topLosers = [...stocks].sort((a, b) => a.pChange - b.pChange).slice(0, 5);

  const longBuildup = stocks.filter(s => s.pChange > 0 && s.oiPChange > 0).sort((a, b) => b.oiPChange - a.oiPChange).slice(0, 5);
  const shortBuildup = stocks.filter(s => s.pChange < 0 && s.oiPChange > 0).sort((a, b) => b.oiPChange - a.oiPChange).slice(0, 5);
  const shortCovering = stocks.filter(s => s.pChange > 0 && s.oiPChange < 0).sort((a, b) => a.oiPChange - b.oiPChange).slice(0, 5);
  const longUnwinding = stocks.filter(s => s.pChange < 0 && s.oiPChange < 0).sort((a, b) => a.oiPChange - b.oiPChange).slice(0, 5);

  const renderStockList = (title, items, icon, colorClass) => (
    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
      <div className={`flex items-center gap-2 mb-4 ${colorClass}`}>
        {icon}
        <h3 className="font-semibold text-lg">{title}</h3>
      </div>
      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-4">No stocks found</div>
        ) : (
          items.map((item, i) => (
            <div key={i} className="flex justify-between items-center text-sm">
              <span className="text-slate-200 font-medium truncate w-1/3">{item.symbol}</span>
              <span className="text-slate-400 font-mono w-1/3 text-right">₹{item.ltp.toFixed(1)}</span>
              <span className={`font-mono text-right w-1/3 ${item.pChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {item.pChange > 0 ? '+' : ''}{item.pChange.toFixed(2)}%
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="p-6 text-slate-200 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Sectors Performance */}
        <div className="col-span-1 bg-slate-800/80 rounded-2xl p-5 border border-slate-700/50 shadow-xl">
          <div className="flex items-center gap-2 mb-6">
            <Layers className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-bold">Sectors Performance</h2>
          </div>
          
          <div className="space-y-4">
            {sectors.length === 0 ? (
              <div className="text-slate-500 text-center py-10">Awaiting Sector Data...</div>
            ) : (
              sectors.map((sector, i) => (
                <div key={i} className="relative">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{sector.name}</span>
                    <span className={sector.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {sector.change > 0 ? '+' : ''}{sector.change.toFixed(2)}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-700/50 rounded-full overflow-hidden flex relative">
                     {/* Center line */}
                     <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-slate-600 z-10" />
                     <div className="w-1/2 flex justify-end pr-[1px]">
                       {sector.change < 0 && (
                          <div 
                            className="h-full bg-rose-500 rounded-l-full transition-all" 
                            style={{ width: `${Math.min(Math.abs(sector.change) * 15, 100)}%` }}
                           />
                       )}
                     </div>
                     <div className="w-1/2 pl-[1px]">
                       {sector.change >= 0 && (
                          <div 
                            className="h-full bg-emerald-500 rounded-r-full transition-all" 
                            style={{ width: `${Math.min(Math.abs(sector.change) * 15, 100)}%` }}
                           />
                       )}
                     </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Stock Action Board */}
        <div className="col-span-1 lg:col-span-2 bg-slate-800/80 rounded-2xl p-5 border border-slate-700/50 shadow-xl">
          <div className="flex items-center gap-2 mb-6">
            <Activity className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-bold">Stock Action Board</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderStockList("Top Gainers", topGainers, <TrendingUp className="w-4 h-4" />, "text-emerald-400")}
            {renderStockList("Top Losers", topLosers, <TrendingDown className="w-4 h-4" />, "text-rose-400")}
            {renderStockList("Long Build Up", longBuildup, <ArrowUpRight className="w-4 h-4" />, "text-blue-400")}
            {renderStockList("Short Build Up", shortBuildup, <ArrowDownRight className="w-4 h-4" />, "text-orange-400")}
            {renderStockList("Short Covering", shortCovering, <ArrowUpRight className="w-4 h-4" />, "text-emerald-400")}
            {renderStockList("Long Unwinding", longUnwinding, <ArrowDownRight className="w-4 h-4" />, "text-rose-400")}
          </div>
        </div>
        
      </div>
    </div>
  );
};
