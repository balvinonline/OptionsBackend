import React from "react";
import { ArrowUp, ArrowDown } from "lucide-react";

const formatNumber = (val) => {
  if (!val || isNaN(val)) return "-";
  return Number(val).toLocaleString("en-IN", { maximumFractionDigits: 2 });
};

const formatOi = (val) => {
  if (!val || isNaN(val)) return "-";
  const absVal = Math.abs(val);
  const sign = val < 0 ? "-" : "";
  if (absVal >= 10000000) return sign + (absVal / 10000000).toFixed(2) + " Cr";
  if (absVal >= 100000) return sign + (absVal / 100000).toFixed(2) + " L";
  return sign + absVal.toLocaleString("en-IN");
};

const MetricTile = ({ label, value, colorClass, subtitle }) => (
  <div className="bg-gray-800 p-3 flex flex-col justify-center rounded-lg border border-gray-700">
    <span className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">
      {label}
    </span>
    <span className={`text-lg font-bold leading-none ${colorClass}`}>
      {value}
    </span>
    {subtitle && (
      <span className="text-[10px] text-gray-500 mt-1 uppercase tracking-wide">
        {subtitle}
      </span>
    )}
  </div>
);

export const KpiCard = ({ data, atm }) => {
  const spot = Number(data?.spot || 0);
  const change = Number(data?.change || 0);
  const pctChange = Number(data?.change_pct || 0);
  const isPositive = change >= 0;

  const pcr = Number(data?.pcr || 0);
  const vix = Number(data?.vix || 0);
  
  // Calculate total OI
  const optionChain = data?.optionChain || [];
  let callOi = 0;
  let putOi = 0;
  optionChain.forEach((row) => {
    callOi += Number(row.ce_oi || 0);
    putOi += Number(row.pe_oi || 0);
  });

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 shadow-lg flex flex-col mb-6">
      {/* Spot Price Big Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <div>
          <div className="text-gray-400 text-sm font-semibold uppercase tracking-widest mb-1">
            {data?.symbol || "INDEX"} SPOT
          </div>
          <div className="text-3xl font-extrabold text-white tracking-tight">
            {spot > 0 ? formatNumber(spot) : "Loading..."}
          </div>
        </div>

        <div
          className={`flex items-center px-3 py-1.5 rounded-full mt-2 sm:mt-0 shadow-sm ${
            isPositive ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}
        >
          {isPositive ? <ArrowUp size={16} className="mr-1" /> : <ArrowDown size={16} className="mr-1" />}
          <span className="font-bold text-sm">
            {change > 0 ? `+${formatNumber(change)}` : formatNumber(change)} ({pctChange.toFixed(2)}%)
          </span>
        </div>
      </div>

      {/* Grid of Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricTile
          label="PCR (OI)"
          value={pcr > 0 ? pcr.toFixed(2) : "-"}
          colorClass={pcr >= 1.05 ? "text-green-400" : pcr <= 0.95 ? "text-red-400" : "text-yellow-400"}
          subtitle={pcr >= 1.05 ? "Bullish" : pcr <= 0.95 ? "Bearish" : "Neutral"}
        />

        <MetricTile
          label="India VIX"
          value={vix > 0 ? vix.toFixed(2) : "-"}
          colorClass={vix > 16 ? "text-red-400" : "text-blue-400"}
          subtitle={vix > 16 ? "High Volatility" : "Normal"}
        />

        <MetricTile
          label="ATM Strike"
          value={atm ? formatNumber(atm) : "-"}
          colorClass="text-blue-400"
          subtitle="Current ATM"
        />

        <MetricTile
          label="Total PE OI"
          value={formatOi(putOi)}
          colorClass="text-green-400"
          subtitle="Support OI"
        />

        <MetricTile
          label="Total CE OI"
          value={formatOi(callOi)}
          colorClass="text-red-400"
          subtitle="Resistance OI"
        />

        <MetricTile
          label="OI Diff (PE - CE)"
          value={formatOi(putOi - callOi)}
          colorClass={putOi - callOi > 0 ? "text-green-400" : "text-red-400"}
          subtitle={putOi - callOi > 0 ? "Bulls Dominating" : "Bears Dominating"}
        />
      </div>
    </div>
  );
};
