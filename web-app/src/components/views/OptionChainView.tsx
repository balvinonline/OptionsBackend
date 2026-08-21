import React from 'react';
import { useMarket } from '../../context/MarketContext';
import { Layers } from 'lucide-react';

export const OptionChainView = () => {
  const { marketData, atm } = useMarket();
  const chain = marketData?.chain || [];

  const formatK = (v: number) => {
    if (!v) return '0';
    return Math.abs(v) > 1000 ? (v / 1000).toFixed(1) + 'k' : v.toString();
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 pb-24 bg-gray-950 flex flex-col h-full">
      <div className="flex items-center mb-6 shrink-0">
        <Layers className="w-6 h-6 mr-2 text-blue-500" />
        <h1 className="text-2xl font-bold tracking-tight text-white">Full Option Chain</h1>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl flex-1 flex flex-col overflow-hidden shadow-lg">
        <div className="bg-gray-800/50 border-b border-gray-800 p-3 flex justify-between items-center shrink-0">
          <h2 className="font-bold text-gray-300 uppercase text-sm tracking-wider">Option Chain & Greeks</h2>
        </div>
        
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs text-right whitespace-nowrap">
            <thead className="text-gray-400 bg-gray-900 sticky top-0 z-10 shadow-sm border-b border-gray-800">
              <tr>
                <th className="py-3 px-4 font-bold border-b border-gray-800 text-red-400">CE OI</th>
                <th className="py-3 px-4 font-bold border-b border-gray-800 text-red-400">CE Chg</th>
                <th className="py-3 px-4 font-bold border-b border-gray-800">CE Vol</th>
                <th className="py-3 px-4 font-bold border-b border-gray-800">CE IV</th>
                <th className="py-3 px-4 font-bold border-b border-gray-800">CE LTP</th>
                <th className="py-3 px-4 font-black text-center bg-gray-800 text-blue-400 border-b border-gray-800 border-l border-r border-gray-700">STRIKE</th>
                <th className="py-3 px-4 font-bold border-b border-gray-800">PE LTP</th>
                <th className="py-3 px-4 font-bold border-b border-gray-800">PE IV</th>
                <th className="py-3 px-4 font-bold border-b border-gray-800">PE Vol</th>
                <th className="py-3 px-4 font-bold border-b border-gray-800 text-green-400">PE Chg</th>
                <th className="py-3 px-4 font-bold border-b border-gray-800 text-green-400">PE OI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {chain.map((row: any, i: number) => {
                const isAtm = Number(row.strike) === Number(atm);
                
                const ceOi = Number(row.ce_oi || row.oi_CE || 0);
                const ceOiChg = Number(row.ce_oich || row.oich_CE || 0);
                const ceVol = Number(row.ce_vol || row.vol_CE || 0);
                const ceIv = Number(row.ce_iv || row.iv_CE || 0);
                const ceLtp = Number(row.ce_ltp || row.ltp_CE || 0);
                
                const peOi = Number(row.pe_oi || row.oi_PE || 0);
                const peOiChg = Number(row.pe_oich || row.oich_PE || 0);
                const peVol = Number(row.pe_vol || row.vol_PE || 0);
                const peIv = Number(row.pe_iv || row.iv_PE || 0);
                const peLtp = Number(row.pe_ltp || row.ltp_PE || 0);

                return (
                  <tr key={i} className={`hover:bg-gray-800/80 transition-colors ${isAtm ? 'bg-blue-900/30' : ''}`}>
                    <td className="py-2 px-4 text-red-400/80">{formatK(ceOi)}</td>
                    <td className={`py-2 px-4 font-medium ${ceOiChg > 0 ? 'text-green-400' : ceOiChg < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                      {ceOiChg > 0 ? '+' : ''}{formatK(ceOiChg)}
                    </td>
                    <td className="py-2 px-4 text-gray-400">{formatK(ceVol)}</td>
                    <td className="py-2 px-4 text-gray-400">{ceIv.toFixed(1)}</td>
                    <td className="py-2 px-4 font-medium text-gray-200">{ceLtp.toFixed(1)}</td>
                    
                    <td className={`py-2 px-4 text-center font-bold border-l border-r border-gray-800/50 ${isAtm ? 'bg-blue-600 text-white' : 'bg-gray-800/30 text-gray-300'}`}>
                      {row.strike}
                    </td>
                    
                    <td className="py-2 px-4 font-medium text-gray-200">{peLtp.toFixed(1)}</td>
                    <td className="py-2 px-4 text-gray-400">{peIv.toFixed(1)}</td>
                    <td className="py-2 px-4 text-gray-400">{formatK(peVol)}</td>
                    <td className={`py-2 px-4 font-medium ${peOiChg > 0 ? 'text-green-400' : peOiChg < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                      {peOiChg > 0 ? '+' : ''}{formatK(peOiChg)}
                    </td>
                    <td className="py-2 px-4 text-green-400/80">{formatK(peOi)}</td>
                  </tr>
                );
              })}
              {chain.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-gray-500">
                    No option chain data available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
