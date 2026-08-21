import React from 'react';
import { CandlestickChart } from '../CandlestickChart';

export const LiveChartView = () => {
  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 pb-24 h-full flex flex-col">
      <h2 className="text-xl font-bold text-white mb-4">Live Chart</h2>
      <div className="flex-1 min-h-[600px]">
        <CandlestickChart fullScreen={true} />
      </div>
    </div>
  );
};
