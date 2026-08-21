import React from "react";
import { 
  Home, 
  Zap, 
  ShieldCheck, 
  Layers, 
  TrendingUp, 
  BarChart2, 
  Briefcase, 
  Rocket,
  Settings,
  X,
  Moon,
  Sun
} from "lucide-react";

export const Sidebar = ({ isOpen, onClose, activeTab, onNavigate }) => {
  const MENU_ITEMS = [
    { id: "Dashboard", title: "Market Overview", icon: Home },
    { id: "Signals", title: "Live Signals", icon: Zap },
    { id: "TradeGate", title: "Trade Gate Rules", icon: ShieldCheck },
    { id: "Chain", title: "Option Chain & OI", icon: Layers },
    { id: "PCR", title: "PCR View", icon: BarChart2 },
    { id: "Scanner", title: "F&O Watchlist", icon: TrendingUp },
    { id: "Chart", title: "Live Chart", icon: BarChart2 },
    { id: "StockOptions", title: "Stock Options Desk", icon: Briefcase },
    { id: "OptionBuyer", title: "Option Buyer Hub", icon: Rocket },
    { id: "Scalper", title: "Expiry Scalper", icon: Zap },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden" 
          onClick={onClose}
        />
      )}

      {/* Sidebar Panel */}
      <div 
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-gray-900 border-r border-gray-800 flex flex-col transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 lg:static`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-xl font-bold text-white">Options Desk</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white lg:hidden">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          <nav className="space-y-1 px-2">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    onClose();
                  }}
                  className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-gray-300 hover:bg-gray-800 hover:text-white"
                  }`}
                >
                  <Icon size={20} className="mr-3" />
                  {item.title}
                </button>
              );
            })}
            
            <div className="my-4 border-t border-gray-800" />
            
            <button
              onClick={() => {
                onNavigate("Settings");
                onClose();
              }}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg ${
                activeTab === "Settings"
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <Settings size={20} className="mr-3" />
              Settings & Token Login
            </button>
          </nav>
        </div>

        <div className="p-4 border-t border-gray-800">
          <button className="flex items-center text-gray-400 hover:text-white">
            <Sun size={20} className="mr-2" />
            <span className="text-sm">Switch Theme (Coming Soon)</span>
          </button>
        </div>
      </div>
    </>
  );
};
