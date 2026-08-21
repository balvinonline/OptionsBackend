'use client';

import React, { useState, useEffect } from 'react';
import { useMarket } from '../context/MarketContext';
import { Maximize2, X } from 'lucide-react';

export const OiBarChart = ({ expandedView = false, isModal = false, onCloseModal }: { expandedView?: boolean, isModal?: boolean, onCloseModal?: () => void }) => {
  const { marketData, atm } = useMarket();
  const [mode, setMode] = useState<'OI' | 'CHANGE'>('OI');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Prevent scroll when modal is open and add ESC listener
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
      }
    };
    
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEsc);
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => { 
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isModalOpen]);

  const chain = marketData?.chain || [];
  if (!chain || chain.length === 0) return null;

  // Trim chain to 11 strikes for compact view, 21 for expanded
  let displayChain = chain;
  const numStrikes = (expandedView || isModal) ? 21 : 11;
  const atmIndex = displayChain.findIndex((row: any) => Number(row.strike) === Number(atm));
  
  if (atmIndex !== -1 && displayChain.length > numStrikes) {
    const half = Math.floor(numStrikes / 2);
    let start = Math.max(0, atmIndex - half);
    let end = start + numStrikes;
    
    if (end > displayChain.length) {
      end = displayChain.length;
      start = Math.max(0, end - numStrikes);
    }
    displayChain = displayChain.slice(start, end);
  }

  // Derive total metrics
  const totalCeOi = chain.reduce((sum: number, row: any) => sum + (Number(row.oi_CE || row.ce_oi) || 0), 0);
  const totalPeOi = chain.reduce((sum: number, row: any) => sum + (Number(row.oi_PE || row.pe_oi) || 0), 0);
  const totalCeOich = chain.reduce((sum: number, row: any) => sum + (Number(row.oich_CE || row.ce_oich) || 0), 0);
  const totalPeOich = chain.reduce((sum: number, row: any) => sum + (Number(row.oich_PE || row.pe_oich) || 0), 0);
  const pcr = totalCeOi > 0 ? (totalPeOi / totalCeOi).toFixed(2) : '-';

  // Find max values for scaling the bars
  let maxOi = 1;
  let maxChange = 1;

  displayChain.forEach((row: any) => {
    const ceOi = Number(row.oi_CE || row.ce_oi) || 0;
    const peOi = Number(row.oi_PE || row.pe_oi) || 0;
    const ceChg = Math.abs(Number(row.oich_CE || row.ce_oich) || 0);
    const peChg = Math.abs(Number(row.oich_PE || row.pe_oich) || 0);

    if (ceOi > maxOi) maxOi = ceOi;
    if (peOi > maxOi) maxOi = peOi;
    if (ceChg > maxChange) maxChange = ceChg;
    if (peChg > maxChange) maxChange = peChg;
  });

  const formatCompact = (val: number) => {
    if (!val || isNaN(val)) return '0';
    if (Math.abs(val) >= 100000) return (val / 100000).toFixed(1) + 'L';
    if (Math.abs(val) >= 1000) return (val / 1000).toFixed(1) + 'k';
    return String(val);
  };

  const ChartContent = (
    <div className={`bg-bg-card border border-border rounded-xl p-4 shadow-md flex flex-col ${isModal ? 'w-full h-full' : 'mb-6'}`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-sm font-bold text-text-primary">
            {mode === 'OI' ? 'Open Interest' : 'OI Change'}
          </h3>
          <span className="text-xs text-text-muted">{atm ? `₹${atm} ATM` : 'Near Strikes'}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-bg-dark rounded p-1">
            <button 
              className={`px-3 py-1 text-xs rounded ${mode === 'OI' ? 'bg-primary text-bg-dark font-bold' : 'text-text-muted hover:text-text-primary'}`}
              onClick={() => setMode('OI')}
            >
              OI
            </button>
            <button 
              className={`px-3 py-1 text-xs rounded ${mode === 'CHANGE' ? 'bg-primary text-bg-dark font-bold' : 'text-text-muted hover:text-text-primary'}`}
              onClick={() => setMode('CHANGE')}
            >
              Chg
            </button>
          </div>
          
          {isModal ? (
            <button onClick={onCloseModal} className="p-1.5 bg-bg-dark rounded text-text-muted hover:text-text-primary border border-border">
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={() => setIsModalOpen(true)} className="p-1.5 bg-bg-dark rounded text-text-muted hover:text-text-primary border border-border">
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center mb-6 bg-bg-card-solid p-3 rounded-lg text-xs">
        <div className="text-center">
          <div className="text-text-muted mb-1">PCR</div>
          <div className={`font-bold ${Number(pcr) > 1 ? 'text-bullish' : 'text-bearish'}`}>{pcr}</div>
        </div>
        <div className="text-center">
          <div className="text-text-muted mb-1">Total Call {mode}</div>
          <div className="font-bold text-bearish">{formatCompact(mode === 'OI' ? totalCeOi : totalCeOich)}</div>
        </div>
        <div className="text-center">
          <div className="text-text-muted mb-1">Total Put {mode}</div>
          <div className="font-bold text-bullish">{formatCompact(mode === 'OI' ? totalPeOi : totalPeOich)}</div>
        </div>
      </div>

      <div className={`flex-1 flex justify-between items-end pb-6 relative ${isModal ? 'min-h-[300px]' : 'min-h-[160px]'}`}>
        {displayChain.map((row: any) => {
          const strike = Number(row.strike);
          const isAtm = strike === Number(atm);
          
          const ceVal = mode === 'OI' ? Number(row.oi_CE || row.ce_oi) : Number(row.oich_CE || row.ce_oich);
          const peVal = mode === 'OI' ? Number(row.oi_PE || row.pe_oi) : Number(row.oich_PE || row.pe_oich);
          
          const maxVal = mode === 'OI' ? maxOi : maxChange;
          
          const ceHeight = Math.max(2, (Math.abs(ceVal || 0) / maxVal) * 100);
          const peHeight = Math.max(2, (Math.abs(peVal || 0) / maxVal) * 100);

          return (
            <div key={strike} className={`flex flex-col items-center justify-end h-full flex-1 mx-[2px] ${isAtm ? 'bg-primary/5 rounded' : ''}`}>
              <div className={`flex items-end justify-center w-full gap-[1px] ${isModal ? 'h-[250px]' : 'h-[120px]'}`}>
                <div 
                  className="bg-bearish rounded-t w-1/2 max-w-[16px] opacity-80" 
                  style={{ height: `${ceHeight}%` }} 
                  title={`Call ${mode}: ${ceVal}`}
                />
                <div 
                  className="bg-bullish rounded-t w-1/2 max-w-[16px] opacity-80" 
                  style={{ height: `${peHeight}%` }} 
                  title={`Put ${mode}: ${peVal}`}
                />
              </div>
              <div className={`mt-2 text-[10px] sm:text-xs rotate-[-45deg] origin-top-left -ml-2 whitespace-nowrap ${isAtm ? 'font-bold text-primary' : 'text-text-muted'}`}>
                {strike >= 1000 ? (strike / 1000).toFixed(1) + 'k' : strike}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-center items-center gap-6 mt-4 pt-4 border-t border-border-light text-xs">
        <div className="flex items-center">
          <div className="w-3 h-3 rounded-full bg-bearish mr-2" />
          <span className="text-text-muted">Call OI (Res)</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 rounded-full bg-bullish mr-2" />
          <span className="text-text-muted">Put OI (Sup)</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {ChartContent}
      
      {!isModal && isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-6xl h-[80vh]">
            <OiBarChart isModal={true} expandedView={true} onCloseModal={() => setIsModalOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
};
