import React from "react";
import { ShieldCheck, AlertCircle, PauseCircle, CheckCircle2, XCircle, Zap } from "lucide-react";

const CheckItem = ({ passed, label, isWarning, isSpecial }) => {
  return (
    <div className="flex items-start mb-2 last:mb-0">
      <div className="mt-0.5 mr-2 flex-shrink-0">
        {isSpecial ? (
          <Zap size={16} className="text-yellow-400" />
        ) : passed && !isWarning ? (
          <CheckCircle2 size={16} className="text-green-500" />
        ) : isWarning ? (
          <AlertCircle size={16} className="text-red-500" />
        ) : (
          <XCircle size={16} className="text-gray-500" />
        )}
      </div>
      <div
        className={`text-sm ${
          isSpecial
            ? "text-yellow-400 font-medium"
            : isWarning
            ? "text-red-400 font-medium"
            : "text-gray-300"
        }`}
      >
        {label}
      </div>
    </div>
  );
};

export const MarketGateCard = ({ signalAnalysis }) => {
  if (!signalAnalysis) return null;

  const {
    gateStatus = "NEUTRAL",
    pcr = 0,
    confidence = 0,
    totalCeOiChg = 0,
    totalPeOiChg = 0,
    trapWarning = null,
    absorptionDetected = false,
  } = signalAnalysis;

  const isBullish = gateStatus === "BULLISH";
  const isBearish = gateStatus === "BEARISH";

  const containerClass = isBullish
    ? "bg-green-900/20 border-green-500/30"
    : isBearish
    ? "bg-red-900/20 border-red-500/30"
    : "bg-gray-800/50 border-gray-700/50";

  return (
    <div className={`rounded-xl border p-4 mb-6 ${containerClass}`}>
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
        <div className="flex items-center">
          {isBullish ? (
            <ShieldCheck size={24} className="text-green-500 mr-2" />
          ) : isBearish ? (
            <AlertCircle size={24} className="text-red-500 mr-2" />
          ) : (
            <PauseCircle size={24} className="text-yellow-500 mr-2" />
          )}
          <h3
            className={`text-lg font-bold ${
              isBullish ? "text-green-400" : isBearish ? "text-red-400" : "text-yellow-400"
            }`}
          >
            TRADE GATE:{" "}
            {isBullish
              ? "BULLISH (CE PERMITTED)"
              : isBearish
              ? "BEARISH (PE PERMITTED)"
              : "NO TRADE GATE / CHOPPY"}
          </h3>
        </div>

        <div
          className={`mt-2 sm:mt-0 px-3 py-1 rounded-full text-sm font-bold ${
            isBullish
              ? "bg-green-500 text-green-950"
              : isBearish
              ? "bg-red-500 text-red-950"
              : "bg-yellow-500 text-yellow-950"
          }`}
        >
          {confidence}% CONFIDENCE
        </div>
      </div>

      {/* Rules Checklist */}
      <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
        <CheckItem
          passed={pcr > 1.05 || pcr < 0.95}
          label={`PCR OI Filter: ${pcr.toFixed(2)} (${
            pcr >= 1.05 ? "Bullish > 1.05" : pcr <= 0.95 ? "Bearish < 0.95" : "Neutral Range"
          })`}
        />
        <CheckItem
          passed={totalPeOiChg !== totalCeOiChg}
          label={`OI Buildup: PE Chg (${(totalPeOiChg / 1000).toFixed(0)}k) vs CE Chg (${(
            totalCeOiChg / 1000
          ).toFixed(0)}k)`}
        />
        <CheckItem
          passed={!trapWarning}
          label={
            trapWarning ? `⚠️ Trap Detected: ${trapWarning}` : "No Trap Detected (Clear Path)"
          }
          isWarning={Boolean(trapWarning)}
        />
        {absorptionDetected && (
          <CheckItem
            passed={true}
            label="⚡ Absorption Detected (Smart Money Activity)"
            isSpecial
          />
        )}
      </div>
    </div>
  );
};
