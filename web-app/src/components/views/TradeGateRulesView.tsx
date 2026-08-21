import React from 'react';
import { useMarket } from '../../context/MarketContext';
import { ShieldCheck, CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';

export const TradeGateRulesView = () => {
  const { tradeGateAnalysis } = useMarket();
  const { score, total, verdict, items } = tradeGateAnalysis || { score: 0, total: 0, verdict: 'UNKNOWN', items: [] };

  const isBlocked = verdict === "TRAP DETECTED - NO TRADE";
  const isNeutral = verdict === "NEUTRAL - SCALPING ONLY";
  
  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 pb-24 bg-gray-950">
      <div className="flex items-center mb-6">
        <ShieldCheck className="w-6 h-6 mr-2 text-indigo-500" />
        <h1 className="text-2xl font-bold tracking-tight text-white">Trade Gate Rules</h1>
      </div>
      
      <div className="text-gray-400 mb-8 text-sm max-w-3xl">
        The Trade Gate system evaluates multiple market conditions (Gates) before authorizing a signal. 
        If too many gates fail, the AI will block trades to prevent you from entering a trap.
      </div>

      <div className={`mb-8 p-6 rounded-xl border flex flex-col md:flex-row items-center justify-between gap-6 ${
        isBlocked ? 'bg-red-900/20 border-red-900/50' : 
        isNeutral ? 'bg-yellow-900/20 border-yellow-900/50' : 
        'bg-green-900/20 border-green-900/50'
      }`}>
        <div className="flex items-center gap-4">
          {isBlocked ? (
            <ShieldAlert className="w-12 h-12 text-red-500" />
          ) : isNeutral ? (
            <ShieldCheck className="w-12 h-12 text-yellow-500" />
          ) : (
            <ShieldCheck className="w-12 h-12 text-green-500" />
          )}
          <div>
            <div className="text-sm font-bold text-gray-400 mb-1 tracking-wider uppercase">Gate Verdict</div>
            <h2 className={`text-2xl md:text-3xl font-black ${
              isBlocked ? 'text-red-500' : 
              isNeutral ? 'text-yellow-500' : 
              'text-green-500'
            }`}>
              {verdict}
            </h2>
          </div>
        </div>
        
        <div className="flex flex-col items-end">
          <div className="text-4xl font-black text-white">
            {score} <span className="text-xl text-gray-500 font-medium">/ {total}</span>
          </div>
          <div className="text-sm text-gray-400 mt-1">Total Gate Score</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items && items.length > 0 ? (
          items.map((gate: any) => (
            <div 
              key={gate.id} 
              className={`p-4 rounded-xl border ${
                gate.pass 
                  ? 'bg-green-900/10 border-green-900/30 hover:border-green-800/50' 
                  : 'bg-red-900/10 border-red-900/30 hover:border-red-800/50'
              } transition-colors flex flex-col justify-between`}
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-bold text-gray-200">{gate.name}</h3>
                {gate.pass ? (
                  <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-500 shrink-0" />
                )}
              </div>
              
              <div>
                <div className="text-xs uppercase tracking-wider font-bold mb-1 text-gray-500">Condition</div>
                <div className={`font-medium ${gate.pass ? 'text-green-400' : 'text-red-400'}`}>
                  {gate.detail}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-12 text-center text-gray-500 bg-gray-900/50 rounded-xl border border-gray-800">
            Awaiting market data to run Gate analysis...
          </div>
        )}
      </div>
    </div>
  );
};
