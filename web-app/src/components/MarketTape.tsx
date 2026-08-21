'use client';

import React from 'react';
import { useMarket } from '../context/MarketContext';
import { Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export const MarketTape = () => {
  const { marketStrip, selectedIndex, setSelectedIndex } = useMarket();

  // Fallback default strip symbols if market is closed or loading
  const defaultItems = [
    { label: 'NIFTY 50', symbol: 'NIFTY', ltp: null, change: null, change_pct: null },
    { label: 'NIFTY BANK', symbol: 'BANKNIFTY', ltp: null, change: null, change_pct: null },
    { label: 'SENSEX', symbol: 'SENSEX', ltp: null, change: null, change_pct: null },
    { label: 'NIFTY FIN SERVICE', symbol: 'FINNIFTY', ltp: null, change: null, change_pct: null },
    { label: 'NIFTY MIDCAP 100', symbol: 'MIDCPNIFTY', ltp: null, change: null, change_pct: null },
  ];

  // Merge live items with fallback labels
  const displayItems = (marketStrip && marketStrip.length > 0)
    ? marketStrip.map((item: any, idx: number) => {
        const fallback = defaultItems[idx] || {};
        return {
          label: item.label || fallback.label,
          symbol: item.symbol || fallback.symbol,
          ltp: item.ltp !== null && item.ltp !== undefined ? Number(item.ltp) : fallback.ltp,
          change: item.change !== null && item.change !== undefined ? Number(item.change) : fallback.change,
          change_pct: item.change_pct !== null && item.change_pct !== undefined ? Number(item.change_pct) : fallback.change_pct,
        };
      })
    : defaultItems;

  const handleSelect = (item: any) => {
    if (item.label?.includes('BANK') || item.symbol === 'BANKNIFTY') setSelectedIndex('BANKNIFTY');
    else if (item.label?.includes('FIN') || item.symbol === 'FINNIFTY') setSelectedIndex('FINNIFTY');
    else if (item.label?.includes('MID') || item.symbol === 'MIDCPNIFTY') setSelectedIndex('MIDCPNIFTY');
    else if (item.label?.includes('SENSEX') || item.symbol === 'SENSEX') setSelectedIndex('SENSEX');
    else setSelectedIndex('NIFTY');
  };

  return (
    <div className="w-full bg-bg-card-elevated border-b border-border-light overflow-hidden">
      <div className="flex overflow-x-auto hide-scrollbar py-2 px-4 gap-3 items-center">
        <div className="flex items-center text-primary pr-2 border-r border-border-light hidden md:flex">
          <Activity className="w-4 h-4 mr-1" />
          <span className="text-xs font-bold uppercase">Markets</span>
        </div>
        
        {displayItems.map((item: any, idx: number) => {
          const isPos = (item.change ?? 0) >= 0;
          const isSelected = selectedIndex === item.symbol || (item.label?.includes(selectedIndex));
          
          return (
            <button
              key={idx}
              onClick={() => handleSelect(item)}
              className={`flex-shrink-0 flex flex-col justify-center px-4 py-2 rounded-lg border transition-all ${
                isSelected 
                  ? 'bg-bg-card border-primary ring-1 ring-primary/30' 
                  : 'bg-bg-dark border-border-light hover:border-text-muted'
              }`}
            >
              <div className="text-[11px] font-bold text-text-muted mb-1 text-left">
                {item.label}
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className={`text-sm font-bold ${item.ltp == null ? 'text-text-muted' : (isPos ? 'text-bullish' : 'text-bearish')}`}>
                  {item.ltp != null ? item.ltp.toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '--'}
                </span>
                <span className={`flex items-center text-xs ${item.change == null ? 'text-text-muted' : (isPos ? 'text-bullish' : 'text-bearish')}`}>
                  {isPos ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
                  {item.change != null ? Math.abs(item.change).toFixed(1) : '--'}
                  ({item.change_pct != null ? Math.abs(item.change_pct).toFixed(2) : '--'}%)
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
