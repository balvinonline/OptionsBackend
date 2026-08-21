import React, { useState } from 'react';
import { useMarket } from '../../context/MarketContext';
import { Activity } from 'lucide-react';

export const PcrView = () => {
  const { pcrBuckets5m, pcrBuckets15m } = useMarket();
  const [activeTab, setActiveTab] = useState('5m');

  const data = activeTab === '5m' ? pcrBuckets5m : pcrBuckets15m;

  const formatNumber = (num) => {
    if (!num) return '0';
    if (num >= 10000000) return (num / 10000000).toFixed(2) + 'Cr';
    if (num >= 100000) return (num / 100000).toFixed(2) + 'L';
    if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
    return num.toString();
  };

  const getBiasColor = (bias) => {
    if (!bias) return 'bg-gray-800 text-gray-400';
    const upper = bias.toUpperCase();
    if (upper.includes('BULL') || upper.includes('ABOVE') || upper.includes('UP')) return 'bg-green-600/20 text-green-400';
    if (upper.includes('BEAR') || upper.includes('BELOW') || upper.includes('DOWN')) return 'bg-red-500/20 text-red-400';
    return 'bg-yellow-500/20 text-yellow-400';
  };

  const getSignalColor = (signal) => {
    if (!signal) return 'bg-gray-800 text-gray-400';
    const upper = signal.toUpperCase();
    if (upper.includes('BUY') || upper.includes('BULL')) return 'bg-green-600 text-white font-bold';
    if (upper.includes('SELL') || upper.includes('BEAR')) return 'bg-red-600 text-white font-bold';
    return 'bg-yellow-600 text-white font-bold';
  };

  const latest5m = pcrBuckets5m[0];
  const prev5m = pcrBuckets5m[1];
  const prev15m = pcrBuckets15m[1];
  
  const currentPcr = latest5m?.pcr || 0;
  const change5m = (currentPcr - (prev5m?.pcr || currentPcr)).toFixed(2);
  const change15m = (currentPcr - (prev15m?.pcr || currentPcr)).toFixed(2);
  const netOiChange = ((latest5m?.pe_oich || 0) - (latest5m?.ce_oich || 0));

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 pb-24 bg-gray-950 flex flex-col h-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div className="flex items-center">
          <Activity className="w-6 h-6 mr-2 text-blue-500" />
          <h1 className="text-2xl font-bold tracking-tight text-white">Intraday Data PCR</h1>
        </div>
        
        <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-1">
          <button 
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === '5m' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTab('5m')}
          >
            5 Min
          </button>
          <button 
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === '15m' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTab('15m')}
          >
            15 Min
          </button>
        </div>
      </div>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 shadow-sm flex flex-col justify-center">
          <div className="text-gray-500 text-xs mb-1">Current PCR</div>
          <div className="text-2xl font-bold text-white">{currentPcr.toFixed(2)}</div>
          <div className="text-gray-600 text-xs mt-1">Latest snapshot</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 shadow-sm flex flex-col justify-center">
          <div className="text-gray-500 text-xs mb-1">5m Change</div>
          <div className={`text-2xl font-bold ${Number(change5m) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {Number(change5m) >= 0 ? '↑' : '↓'} {Math.abs(Number(change5m))}
          </div>
          <div className="text-gray-600 text-xs mt-1">Short term trend</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 shadow-sm flex flex-col justify-center">
          <div className="text-gray-500 text-xs mb-1">15m Change</div>
          <div className={`text-2xl font-bold ${Number(change15m) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {Number(change15m) >= 0 ? '↑' : '↓'} {Math.abs(Number(change15m))}
          </div>
          <div className="text-gray-600 text-xs mt-1">Medium term trend</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 shadow-sm flex flex-col justify-center">
          <div className="text-gray-500 text-xs mb-1">Net OI Change</div>
          <div className={`text-2xl font-bold ${netOiChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {netOiChange >= 0 ? '↑' : '↓'} {formatNumber(Math.abs(netOiChange))}
          </div>
          <div className="text-gray-600 text-xs mt-1">Put minus call change</div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col overflow-hidden shadow-lg flex-1">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-800/50 text-gray-400 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 font-semibold">Time</th>
                <th className="px-4 py-3 font-semibold text-right">Call OI</th>
                <th className="px-4 py-3 font-semibold text-right">Put OI</th>
                <th className="px-4 py-3 font-semibold text-right">Diff</th>
                <th className="px-4 py-3 font-semibold text-right">PCR</th>
                <th className="px-4 py-3 font-semibold text-center">PCR Bias</th>
                <th className="px-4 py-3 font-semibold text-right">VWAP</th>
                <th className="px-4 py-3 font-semibold text-right">Price</th>
                <th className="px-4 py-3 font-semibold text-center">Price Bias</th>
                <th className="px-4 py-3 font-semibold text-center">VWAP Bias</th>
                <th className="px-4 py-3 font-semibold text-center">Final Signal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {data && data.length > 0 ? (
                data.map((row, i) => {
                  const callOi = row.callOi || 0;
                  const putOi = row.putOi || 0;
                  const diff = putOi - callOi;
                  
                  // Construct a final signal based on available biases
                  let finalSignal = 'NEUTRAL';
                  const bullVotes = [row.optSignal, row.pcrTrend, row.vwapSignal].filter(s => s && (s.includes('BULL') || s.includes('UP') || s.includes('ABOVE'))).length;
                  const bearVotes = [row.optSignal, row.pcrTrend, row.vwapSignal].filter(s => s && (s.includes('BEAR') || s.includes('DOWN') || s.includes('BELOW'))).length;
                  
                  if (bullVotes > bearVotes && bullVotes >= 2) finalSignal = 'STRONG BUY';
                  else if (bullVotes > bearVotes) finalSignal = 'BUY';
                  else if (bearVotes > bullVotes && bearVotes >= 2) finalSignal = 'STRONG SELL';
                  else if (bearVotes > bullVotes) finalSignal = 'SELL';

                  const timeStr = row.timeLabel || (row.bucketTs || row.ts ? new Date(row.bucketTs || row.ts).toLocaleTimeString("en-IN", { hour12: false, hour: '2-digit', minute: '2-digit' }) : '-');

                  return (
                    <tr key={i} className="hover:bg-gray-800/20 transition-colors">
                      <td className="px-4 py-3 text-gray-300 font-medium">{timeStr}</td>
                      <td className="px-4 py-3 text-right text-red-400">{formatNumber(callOi)}</td>
                      <td className="px-4 py-3 text-right text-green-400">{formatNumber(putOi)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-200">
                        <span className={diff >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {diff > 0 ? '+' : ''}{formatNumber(diff)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-white">{row.pcr?.toFixed(2) || '0.00'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${getBiasColor(row.optSignal || row.optionSignal)}`}>
                          {row.optSignal || row.optionSignal || 'NEUTRAL'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400">
                        {row.vwap ? row.vwap.toFixed(2) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">{(row.spot || row.price)?.toFixed(2) || '0.00'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${getBiasColor(row.pcrTrend)}`}>
                          {row.pcrTrend || 'FLAT'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${getBiasColor(row.vwapSignal)}`}>
                          {row.vwapSignal || 'NEUTRAL'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2.5 py-1.5 rounded text-xs ${getSignalColor(finalSignal)}`}>
                          {finalSignal}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                    No PCR data available yet...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
