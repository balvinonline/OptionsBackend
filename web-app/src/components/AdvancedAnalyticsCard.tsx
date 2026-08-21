import React from "react";
import { Activity, Compass, Flame } from "lucide-react";

export const AdvancedAnalyticsCard = ({ analytics }) => {
  if (!analytics) return null;

  const smartOIFlow = analytics.smartOIFlow || {};
  const gamma = analytics.gammaExposure || {};
  const regime = analytics.marketRegime || {};

  const getBadgeColor = (label) => {
    const l = (label || "").toLowerCase();
    if (l.includes("bull") || l.includes("long")) return "text-green-400 border-green-500/30 bg-green-500/10";
    if (l.includes("bear") || l.includes("short")) return "text-red-400 border-red-500/30 bg-red-500/10";
    return "text-gray-300 border-gray-600 bg-gray-800";
  };

  const renderBadge = (label) => {
    return (
      <div className={`px-2 py-0.5 rounded text-xs font-bold border uppercase tracking-wider ${getBadgeColor(label)}`}>
        {label || "Neutral"}
      </div>
    );
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 shadow-lg mb-6">
      <h3 className="text-gray-400 text-xs font-bold tracking-widest uppercase mb-4">Advanced Analytics</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Smart OI Flow */}
        <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
          <div className="flex items-center space-x-2 mb-3 pb-2 border-b border-gray-700">
            <Activity size={16} className="text-blue-400" />
            <h4 className="text-sm font-semibold text-gray-200">Smart OI Flow</h4>
          </div>
          
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400 font-medium uppercase">Trend</span>
            {renderBadge(smartOIFlow.flow_trend)}
          </div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400 font-medium uppercase">Call Flow</span>
            <span className="text-sm text-gray-200 font-medium">{smartOIFlow.call_flow || "-"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium uppercase">Put Flow</span>
            <span className="text-sm text-gray-200 font-medium">{smartOIFlow.put_flow || "-"}</span>
          </div>
        </div>

        {/* Market Regime */}
        <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
          <div className="flex items-center space-x-2 mb-3 pb-2 border-b border-gray-700">
            <Compass size={16} className="text-blue-400" />
            <h4 className="text-sm font-semibold text-gray-200">Market Regime</h4>
          </div>
          
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400 font-medium uppercase">Status</span>
            {renderBadge(regime.status)}
          </div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400 font-medium uppercase">Volatility</span>
            <span className="text-sm text-gray-200 font-medium">{regime.volatility_context || "-"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium uppercase">Momentum</span>
            <span className="text-sm text-gray-200 font-medium">{regime.momentum || "-"}</span>
          </div>
        </div>

        {/* Gamma Exposure */}
        <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
          <div className="flex items-center space-x-2 mb-3 pb-2 border-b border-gray-700">
            <Flame size={16} className="text-blue-400" />
            <h4 className="text-sm font-semibold text-gray-200">Gamma Exposure</h4>
          </div>
          
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400 font-medium uppercase">Profile</span>
            {renderBadge(gamma.profile)}
          </div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400 font-medium uppercase">Total GEX</span>
            <span className="text-sm text-gray-200 font-medium">{gamma.total_gex || "-"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium uppercase">Flip Point</span>
            <span className="text-sm text-gray-200 font-medium">{gamma.flip_strike || "-"}</span>
          </div>
        </div>

      </div>
    </div>
  );
};
