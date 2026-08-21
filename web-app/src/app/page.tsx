'use client';

import React, { useState } from 'react';
import { useMarket } from '../context/MarketContext';
import { Activity, ShieldAlert, Settings } from 'lucide-react';
import { CandlestickChart } from '../components/CandlestickChart';
import { OiBarChart } from '../components/OiBarChart';
import { MarketTape } from '../components/MarketTape';
import { ServerSettingsModal } from '../components/ServerSettingsModal';
import { Sidebar } from '../components/Sidebar';
import { KpiCard } from '../components/KpiCard';
import { MarketGateCard } from '../components/MarketGateCard';
import { AdvancedAnalyticsCard } from '../components/AdvancedAnalyticsCard';
import { SignalCard } from '../components/SignalCard';
import { LiveChartView } from '../components/views/LiveChartView';
import { OptionBuyerHubView } from '../components/views/OptionBuyerHubView';
import { LiveSignalsView } from '../components/views/LiveSignalsView';
import { TradeGateRulesView } from '../components/views/TradeGateRulesView';
import { OptionChainView } from '../components/views/OptionChainView';
import { PcrView } from '../components/views/PcrView';
import { ExpiryScalperView } from '../components/views/ExpiryScalperView';
import { StockActionView } from '../components/views/StockActionView';
import { StockOptionsDeskView } from '../components/views/StockOptionsDeskView';

const MainDashboardView = ({ setIsSidebarOpen, setIsSettingsOpen }) => {
  const { selectedIndex, marketData, signalAnalysis, atm } = useMarket();
  const chain = marketData?.chain || [];

  return (
    <div className="flex-1 overflow-y-scroll p-4 lg:p-6 pb-24">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div className="flex items-center">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="mr-4 p-2 bg-gray-900 border border-gray-800 rounded-lg lg:hidden hover:bg-gray-800"
          >
            <Activity size={20} className="text-gray-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center">
              <Activity className="w-6 h-6 mr-2 text-blue-500 hidden lg:block" /> OPTIONS DESK
            </h1>
            <p className="text-gray-400 mt-1 text-sm">Automated Market Intelligence ({selectedIndex})</p>
          </div>
        </div>
        
        <button onClick={() => setIsSettingsOpen(true)} className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg hover:bg-gray-800 transition-colors flex items-center shadow-sm">
          <Settings className="w-4 h-4 mr-2 text-gray-400" />
          Settings
        </button>
      </header>

      <KpiCard data={marketData} atm={atm} />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <AdvancedAnalyticsCard analytics={marketData?.analytics} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <MarketGateCard signalAnalysis={signalAnalysis} />
            <SignalCard signalAnalysis={signalAnalysis} indexSymbol={selectedIndex} />
          </div>
        </div>
        <div>
          <OiBarChart />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CandlestickChart />
        
        <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col overflow-hidden shadow-lg h-[500px]">
          <div className="bg-gray-800/50 border-b border-gray-800 p-3 flex justify-between items-center">
            <h2 className="font-bold text-gray-300 uppercase text-sm tracking-wider">Option Chain</h2>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-xs text-right">
              <thead className="text-gray-400 bg-gray-900/90 sticky top-0 z-10 backdrop-blur-sm">
                <tr>
                  <th className="py-2 px-3 font-medium border-b border-gray-800">CE OI</th>
                  <th className="py-2 px-3 font-medium border-b border-gray-800">Chg</th>
                  <th className="py-2 px-3 font-medium border-b border-gray-800">LTP</th>
                  <th className="py-2 px-3 font-bold text-center text-blue-400 border-b border-gray-800">STRIKE</th>
                  <th className="py-2 px-3 font-medium border-b border-gray-800">LTP</th>
                  <th className="py-2 px-3 font-medium border-b border-gray-800">Chg</th>
                  <th className="py-2 px-3 font-medium border-b border-gray-800">PE OI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {chain.map((row: any, i: number) => {
                  const isAtm = Number(row.strike) === Number(atm);
                  
                  const ceOi = Number(row.ce_oi || row.oi_CE || 0);
                  const ceOiChg = Number(row.ce_oich || row.oich_CE || 0);
                  const ceLtp = Number(row.ce_ltp || row.ltp_CE || 0);
                  
                  const peOi = Number(row.pe_oi || row.oi_PE || 0);
                  const peOiChg = Number(row.pe_oich || row.oich_PE || 0);
                  const peLtp = Number(row.pe_ltp || row.ltp_PE || 0);

                  const formatK = (v: number) => Math.abs(v) > 1000 ? (v/1000).toFixed(1) + 'k' : v;
                  
                  return (
                    <tr key={i} className={`hover:bg-gray-800/50 transition-colors ${isAtm ? 'bg-blue-900/20' : ''}`}>
                      <td className="py-2 px-3 text-red-400">{formatK(ceOi)}</td>
                      <td className={`py-2 px-3 ${ceOiChg >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {ceOiChg > 0 ? '+' : ''}{formatK(ceOiChg)}
                      </td>
                      <td className="py-2 px-3 font-medium text-gray-200">{ceLtp.toFixed(1)}</td>
                      
                      <td className={`py-2 px-3 text-center font-bold relative ${isAtm ? 'bg-blue-500 text-white rounded' : 'text-gray-300'}`}>
                        {row.strike}
                      </td>
                      
                      <td className="py-2 px-3 font-medium text-gray-200">{peLtp.toFixed(1)}</td>
                      <td className={`py-2 px-3 ${peOiChg >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {peOiChg > 0 ? '+' : ''}{formatK(peOiChg)}
                      </td>
                      <td className="py-2 px-3 text-green-400">{formatK(peOi)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const { selectedIndex, marketData, signalAnalysis, atm, error, advancedSignals } = useMarket();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('Dashboard');

  if (error && !marketData) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-red-400 p-4">
        <ShieldAlert className="w-8 h-8 mr-2" />
        <span className="text-lg">{error}</span>
      </div>
    );
  }

  const renderActiveView = () => {
    switch (activeTab) {
      case 'Dashboard':
        return <MainDashboardView setIsSidebarOpen={setIsSidebarOpen} setIsSettingsOpen={setIsSettingsOpen} />;
      case 'Signals':
        return <LiveSignalsView />;
      case 'TradeGate':
        return <TradeGateRulesView />;
      case 'Chain':
        return <OptionChainView />;
      case 'PCR':
        return <PcrView />;
      case 'Scanner':
        return <StockActionView />;
      case 'Chart':
        return <LiveChartView />;
      case 'StockOptions':
        return <StockOptionsDeskView />;
      case 'OptionBuyer':
        return <OptionBuyerHubView />;
      case 'Scalper':
        return <ExpiryScalperView />;
      default:
        return (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <h2 className="text-xl font-bold mb-2">{activeTab}</h2>
              <p>Coming Soon</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex font-sans overflow-hidden">
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        activeTab={activeTab} 
        onNavigate={setActiveTab} 
      />
      
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <MarketTape />
        <ServerSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        
        <div className="flex-1 overflow-hidden">
          {renderActiveView()}
        </div>
      </div>
    </div>
  );
}
