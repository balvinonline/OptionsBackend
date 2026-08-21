import React from 'react';
import { useMarket } from '../../context/MarketContext';
import { Zap, ArrowUpRight, ArrowDownRight, Clock, Target, AlertTriangle } from 'lucide-react';

export const LiveSignalsView = () => {
  const { signalJournal, selectedIndex } = useMarket();

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 pb-24 bg-gray-950">
      <div className="flex items-center mb-6">
        <Zap className="w-6 h-6 mr-2 text-yellow-500" />
        <h1 className="text-2xl font-bold tracking-tight text-white">Live Signals Journal</h1>
      </div>
      
      <div className="text-gray-400 mb-6 text-sm">
        Chronological feed of generated signals for {selectedIndex}.
      </div>

      <div className="space-y-4">
        {(!signalJournal || signalJournal.length === 0) ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 flex flex-col items-center justify-center text-gray-500">
            <Zap className="w-12 h-12 mb-4 text-gray-700" />
            <p>No signals generated yet today.</p>
            <p className="text-sm mt-2">Waiting for market movement and trap detection...</p>
          </div>
        ) : (
          signalJournal.map((signal) => (
            <div key={signal.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 lg:p-6 shadow-sm hover:border-gray-700 transition-colors">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-800 pb-4 mb-4">
                <div className="flex items-center gap-3">
                  {signal.type === 'BUY CE' ? (
                    <div className="p-2 bg-green-900/30 text-green-400 rounded-lg">
                      <ArrowUpRight size={24} />
                    </div>
                  ) : signal.type === 'BUY PE' ? (
                    <div className="p-2 bg-red-900/30 text-red-400 rounded-lg">
                      <ArrowDownRight size={24} />
                    </div>
                  ) : (
                    <div className="p-2 bg-gray-800 text-gray-400 rounded-lg">
                      <Zap size={24} />
                    </div>
                  )}
                  <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      {signal.type}
                      <span className={`text-xs px-2 py-1 rounded font-medium ${
                        signal.type === 'BUY CE' ? 'bg-green-900/50 text-green-400' :
                        signal.type === 'BUY PE' ? 'bg-red-900/50 text-red-400' :
                        'bg-gray-800 text-gray-400'
                      }`}>
                        {signal.strength}
                      </span>
                    </h3>
                    <div className="text-gray-400 text-sm flex items-center gap-4 mt-1">
                      <span className="flex items-center"><Clock size={14} className="mr-1" /> {signal.time}</span>
                      <span>Strike: {signal.strike}</span>
                      <span>Spot: {signal.spot}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col items-end">
                  <div className="text-2xl font-black text-white">{signal.confidence}%</div>
                  <div className="text-xs text-gray-500">Confidence Score</div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-950 p-4 rounded-lg">
                <div className="flex flex-col">
                  <span className="text-gray-500 text-xs mb-1 uppercase font-bold tracking-wider">Entry Zone</span>
                  <span className="text-blue-400 font-bold">{signal.entry}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-500 text-xs mb-1 uppercase font-bold tracking-wider flex items-center"><Target size={12} className="mr-1" /> Targets</span>
                  <span className="text-green-400 font-bold">{signal.target1} / {signal.target2}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-500 text-xs mb-1 uppercase font-bold tracking-wider flex items-center"><AlertTriangle size={12} className="mr-1" /> Stop Loss</span>
                  <span className="text-red-400 font-bold">{signal.stopLoss}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
