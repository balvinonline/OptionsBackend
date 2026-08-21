import React from "react";
import { Hourglass, TrendingUp, TrendingDown, Target, Shield } from "lucide-react";

export const SignalCard = ({ signalAnalysis, indexSymbol }) => {
  if (!signalAnalysis) return null;

  const { signalType = "NEUTRAL", signalStrength = "", confidence = 0, atmStrike, advancedSignals = [] } = signalAnalysis;
  const isBuy = signalType === "BUY_CE";
  const isSell = signalType === "BUY_PE";
  const isBullish = isBuy;
  const isBearish = isSell;

  if (signalType === "NEUTRAL") {
    return (
      <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 flex items-center space-x-4 mb-6 shadow-sm">
        <Hourglass className="text-gray-500 animate-pulse" size={24} />
        <div>
          <h4 className="text-gray-300 font-bold tracking-wider text-sm">NO CONFIRMED SIGNAL YET</h4>
          <p className="text-gray-500 text-xs mt-1">Waiting for clear momentum & PCR divergence on {indexSymbol}</p>
        </div>
      </div>
    );
  }

  const recommendedStrike = atmStrike
    ? `${indexSymbol} ${atmStrike} ${isBuy ? "CE" : "PE"}`
    : `${indexSymbol} ATM ${isBuy ? "CE" : "PE"}`;

  return (
    <div
      className={`rounded-xl border p-4 shadow-lg flex flex-col max-h-[450px] ${
        isBuy ? "bg-green-900/10 border-green-500/30" : "bg-red-900/10 border-red-500/30"
      }`}
    >
      {/* Top Tag & Confidence */}
      <div className="flex justify-between items-center mb-4">
        <div
          className={`flex items-center px-3 py-1 rounded-full text-xs font-bold shadow-sm ${
            isBuy ? "bg-green-500 text-green-950" : "bg-red-500 text-red-950"
          }`}
        >
          {isBuy ? <TrendingUp size={14} className="mr-1" /> : <TrendingDown size={14} className="mr-1" />}
          {signalStrength}
        </div>
        <div className="text-xs text-gray-400 font-medium">{new Date().toLocaleTimeString("en-IN")}</div>
      </div>

      {/* Recommended Instrument */}
      <div className="mb-5">
        <div className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Recommended Option</div>
        <div
          className={`text-2xl font-extrabold tracking-tight ${
            isBuy ? "text-green-400" : "text-red-400"
          }`}
        >
          {recommendedStrike}
        </div>
      </div>

      {/* Target & Risk Levels */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-gray-900/50 rounded p-2 border border-gray-800">
          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Confidence</div>
          <div className={`text-lg font-bold ${isBuy ? "text-green-400" : "text-red-400"}`}>{confidence}%</div>
        </div>

        <div className="bg-gray-900/50 rounded p-2 border border-gray-800">
          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Action</div>
          <div className="text-lg font-bold text-white">{isBuy ? "BUY CE" : "BUY PE"}</div>
        </div>
        
        <div className="bg-gray-900/50 rounded p-2 border border-gray-800 flex flex-col justify-center">
           <div className="flex items-center text-[10px] text-gray-500 font-bold uppercase tracking-wide mb-1">
             <Target size={12} className="mr-1 text-blue-400"/>
             Target
           </div>
           <div className="text-sm font-bold text-gray-300">Fast Scalp</div>
        </div>
        
        <div className="bg-gray-900/50 rounded p-2 border border-gray-800 flex flex-col justify-center">
           <div className="flex items-center text-[10px] text-gray-500 font-bold uppercase tracking-wide mb-1">
             <Shield size={12} className="mr-1 text-yellow-400"/>
             Stoploss
           </div>
           <div className="text-sm font-bold text-gray-300">Strict SL</div>
        </div>
      </div>

      {/* Advanced Signals Log */}
      {/* Advanced Signals Log */}
      {advancedSignals && advancedSignals.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-700/50 flex flex-col flex-1 min-h-[150px]">
          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">Technical Confirmation</div>
          <div className="space-y-1 overflow-y-auto flex-1 pr-2 custom-scrollbar">
            {advancedSignals.map((msg, i) => (
              <div key={i} className="flex items-start">
                <div className="text-blue-400 mr-2 text-sm">•</div>
                <div className="text-xs text-gray-300 leading-relaxed">{msg.message || msg}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
