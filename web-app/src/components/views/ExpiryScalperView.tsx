import React from 'react';
import { Target, Shield, Activity, TrendingUp, TrendingDown, AlertTriangle, Zap } from 'lucide-react';

const mockScalpData = [
  {
    index: 'NIFTY',
    contract: '22500 CE',
    expiry: 'Today',
    bias: 'BULLISH',
    vwapBias: 'ABOVE VWAP',
    entry: 105.4,
    sl: 92.0,
    trail: 115.0,
    risk: '13.4 pts',
    premium: '108.2',
    pnl: '+2.8',
    status: 'ACTIVE'
  },
  {
    index: 'BANKNIFTY',
    contract: '48000 PE',
    expiry: 'Today',
    bias: 'BEARISH',
    vwapBias: 'BELOW VWAP',
    entry: 320.5,
    sl: 350.0,
    trail: 280.0,
    risk: '29.5 pts',
    premium: '305.1',
    pnl: '+15.4',
    status: 'ACTIVE'
  },
  {
    index: 'SENSEX',
    contract: '74500 CE',
    expiry: 'Tomorrow',
    bias: 'NEUTRAL',
    vwapBias: 'NEAR VWAP',
    entry: 0,
    sl: 0,
    trail: 0,
    risk: '-',
    premium: '145.0',
    pnl: '0.0',
    status: 'WAITING'
  }
];

const ScalpCard = ({ data }) => {
  const isBullish = data.bias === 'BULLISH';
  const isBearish = data.bias === 'BEARISH';
  const isNeutral = !isBullish && !isBearish;

  const headerColor = isBullish ? 'bg-green-600' : isBearish ? 'bg-red-600' : 'bg-gray-600';
  const glowColor = isBullish ? 'shadow-[0_0_15px_rgba(22,163,74,0.15)] border-green-500/20' : isBearish ? 'shadow-[0_0_15px_rgba(220,38,38,0.15)] border-red-500/20' : 'border-gray-700';

  return (
    <div className={`bg-gray-900 rounded-xl border ${glowColor} overflow-hidden flex flex-col`}>
      {/* Header */}
      <div className={`${headerColor} p-4 flex justify-between items-center`}>
        <div>
          <h3 className="text-white font-bold text-lg">{data.index}</h3>
          <span className="text-white/80 text-xs font-medium bg-black/20 px-2 py-0.5 rounded-full inline-block mt-1">
            {data.expiry}
          </span>
        </div>
        <div className="text-right">
          <div className="text-white font-bold text-lg">{data.contract}</div>
          <div className="flex items-center justify-end gap-1 mt-1 text-white/90 text-xs font-semibold">
            {isBullish ? <TrendingUp size={14} /> : isBearish ? <TrendingDown size={14} /> : <Activity size={14} />}
            {data.bias}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex-1 flex flex-col gap-4">
        {/* Signals Row */}
        <div className="flex gap-2">
          <div className={`flex-1 flex flex-col items-center justify-center p-2 rounded-lg ${isBullish ? 'bg-green-500/10 text-green-400' : isBearish ? 'bg-red-500/10 text-red-400' : 'bg-gray-800 text-gray-400'}`}>
            <span className="text-[10px] uppercase font-bold opacity-70 mb-1">VWAP Bias</span>
            <span className="text-xs font-semibold">{data.vwapBias}</span>
          </div>
          <div className={`flex-1 flex flex-col items-center justify-center p-2 rounded-lg ${data.status === 'ACTIVE' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-gray-800 text-gray-400'}`}>
            <span className="text-[10px] uppercase font-bold opacity-70 mb-1">Status</span>
            <span className="text-xs font-semibold flex items-center gap-1">
              {data.status === 'ACTIVE' && <Zap size={12} fill="currentColor" />}
              {data.status}
            </span>
          </div>
        </div>

        {/* Levels Grid */}
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
            <div className="flex items-center gap-1.5 text-gray-400 mb-1">
              <Target size={14} />
              <span className="text-xs font-semibold uppercase">Entry</span>
            </div>
            <div className="text-lg font-bold text-white">{data.entry > 0 ? data.entry.toFixed(1) : '-'}</div>
          </div>
          
          <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
            <div className="flex items-center gap-1.5 text-gray-400 mb-1">
              <Shield size={14} />
              <span className="text-xs font-semibold uppercase">Stop Loss</span>
            </div>
            <div className="text-lg font-bold text-red-400">{data.sl > 0 ? data.sl.toFixed(1) : '-'}</div>
          </div>

          <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
            <div className="flex items-center gap-1.5 text-gray-400 mb-1">
              <Activity size={14} />
              <span className="text-xs font-semibold uppercase">Trail SL</span>
            </div>
            <div className="text-lg font-bold text-indigo-400">{data.trail > 0 ? data.trail.toFixed(1) : '-'}</div>
          </div>

          <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
            <div className="flex items-center gap-1.5 text-gray-400 mb-1">
              <AlertTriangle size={14} />
              <span className="text-xs font-semibold uppercase">Risk</span>
            </div>
            <div className="text-lg font-bold text-yellow-400">{data.risk}</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-950 p-4 border-t border-gray-800 flex justify-between items-center">
        <div>
          <span className="text-gray-500 text-xs font-semibold uppercase block mb-0.5">LTP / Premium</span>
          <span className="text-white font-bold text-lg">{data.premium}</span>
        </div>
        <div className="text-right">
          <span className="text-gray-500 text-xs font-semibold uppercase block mb-0.5">Est. PnL</span>
          <span className={`font-bold text-lg ${data.pnl.startsWith('+') ? 'text-green-400' : data.pnl.startsWith('-') ? 'text-red-400' : 'text-gray-400'}`}>
            {data.pnl}
          </span>
        </div>
      </div>
    </div>
  );
};

export const ExpiryScalperView = () => {
  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap className="text-yellow-400" />
            Expiry Scalper
          </h2>
          <p className="text-gray-400 text-sm mt-1">High probability 0DTE scalping setups based on VWAP and Option Signals.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {mockScalpData.map((data, idx) => (
          <ScalpCard key={idx} data={data} />
        ))}
      </div>
    </div>
  );
}
