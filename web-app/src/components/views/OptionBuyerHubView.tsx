import React from 'react';
import { useMarket } from '../../context/MarketContext';
import { Rocket, Activity, Zap, TrendingUp, Target } from 'lucide-react';

export const OptionBuyerHubView = () => {
  const { marketData, signalAnalysis, atm, selectedIndex } = useMarket();

  if (!marketData || !marketData.chain) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <Activity className="w-8 h-8 animate-pulse text-blue-500" />
      </div>
    );
  }

  const action = signalAnalysis?.action || 'NEUTRAL';
  const confidence = signalAnalysis?.confidence || 0;
  
  // Decide which side to show based on signal
  const isCall = action.includes('CE') || action === 'BUY CE';
  const isPut = action.includes('PE') || action === 'BUY PE';
  const targetSide = isCall ? 'CE' : isPut ? 'PE' : null;

  // Filter option chain for 3 closest strikes
  const atmNumber = Number(atm);
  
  const relevantStrikes = marketData.chain
    .sort((a: any, b: any) => Math.abs(Number(a.strike) - atmNumber) - Math.abs(Number(b.strike) - atmNumber))
    .slice(0, 3)
    .sort((a: any, b: any) => Number(a.strike) - Number(b.strike));

  const formatK = (v: number) => Math.abs(v) > 1000 ? (v / 1000).toFixed(1) + 'k' : v;

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 pb-24 space-y-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center">
          <Rocket className="w-6 h-6 mr-2 text-purple-500" /> OPTION BUYER HUB
        </h1>
        <p className="text-gray-400 mt-1 text-sm">Actionable insights tailored for Option Buyers ({selectedIndex})</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Active Signal Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Zap size={64} />
          </div>
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Active Trading Signal</h2>
          
          <div className="flex items-center space-x-4 mb-4">
            <div className={`px-4 py-2 rounded-lg font-bold text-xl ${
              action.includes('BUY') ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
              action.includes('SELL') ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
              'bg-gray-800 text-gray-300'
            }`}>
              {action}
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 uppercase">Confidence</span>
              <span className="font-bold text-lg text-white">{confidence}%</span>
            </div>
          </div>
          
          {targetSide && (
            <p className="text-sm text-gray-400 mt-2">
              Signal suggests buying {targetSide} options. Check the recommended strikes below.
            </p>
          )}
        </div>

        {/* Momentum Meter Placeholder */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-lg flex flex-col justify-center">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center">
            <TrendingUp className="w-4 h-4 mr-2" /> Momentum Meter
          </h2>
          <div className="w-full bg-gray-800 rounded-full h-4 mb-2 overflow-hidden">
            <div className="bg-gradient-to-r from-red-500 via-gray-500 to-green-500 h-4 w-full opacity-50"></div>
          </div>
          <div className="flex justify-between text-xs text-gray-500 font-medium">
            <span>Strong Bearish</span>
            <span>Neutral</span>
            <span>Strong Bullish</span>
          </div>
        </div>
      </div>

      {/* Recommended Strikes */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col overflow-hidden shadow-lg">
        <div className="bg-gray-800/50 border-b border-gray-800 p-4 flex justify-between items-center">
          <h2 className="font-bold text-gray-300 uppercase text-sm tracking-wider flex items-center">
            <Target className="w-4 h-4 mr-2" /> Target Strikes (ATM ±1)
          </h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="text-gray-400 bg-gray-900/90">
              <tr>
                <th className="py-3 px-4 font-medium border-b border-gray-800 text-left">Type</th>
                <th className="py-3 px-4 font-medium border-b border-gray-800 text-center text-blue-400 font-bold">STRIKE</th>
                <th className="py-3 px-4 font-medium border-b border-gray-800">LTP</th>
                <th className="py-3 px-4 font-medium border-b border-gray-800">OI</th>
                <th className="py-3 px-4 font-medium border-b border-gray-800">OI Chg</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {relevantStrikes.map((row: any, i: number) => {
                const isAtm = Number(row.strike) === atmNumber;
                
                // If there's a specific target side, prioritize showing it. Otherwise show both rows for each strike.
                const renderRow = (side: 'CE' | 'PE') => {
                  const ltp = Number(side === 'CE' ? (row.ce_ltp || row.ltp_CE) : (row.pe_ltp || row.ltp_PE)) || 0;
                  const oi = Number(side === 'CE' ? (row.ce_oi || row.oi_CE) : (row.pe_oi || row.oi_PE)) || 0;
                  const oich = Number(side === 'CE' ? (row.ce_oich || row.oich_CE) : (row.pe_oich || row.oich_PE)) || 0;
                  
                  return (
                    <tr key={`${i}-${side}`} className={`hover:bg-gray-800/50 transition-colors ${isAtm ? 'bg-blue-900/10' : ''}`}>
                      <td className="py-3 px-4 text-left font-bold text-gray-300">
                        {side} {isAtm ? <span className="ml-2 text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">ATM</span> : ''}
                      </td>
                      <td className={`py-3 px-4 text-center font-bold ${isAtm ? 'text-white' : 'text-gray-300'}`}>
                        {row.strike}
                      </td>
                      <td className="py-3 px-4 font-medium text-gray-200">{ltp.toFixed(1)}</td>
                      <td className="py-3 px-4 text-gray-300">{formatK(oi)}</td>
                      <td className={`py-3 px-4 ${oich >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {oich > 0 ? '+' : ''}{formatK(oich)}
                      </td>
                    </tr>
                  );
                };

                if (targetSide) {
                  return renderRow(targetSide);
                }
                
                return (
                  <React.Fragment key={i}>
                    {renderRow('CE')}
                    {renderRow('PE')}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Whale Tracker Placeholder */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-lg">
         <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center">
            Whale Tracker Feed
          </h2>
          <div className="text-sm text-gray-500 text-center py-8 border border-dashed border-gray-700 rounded-lg">
            Institutional order flow monitoring coming soon...
          </div>
      </div>
    </div>
  );
};
