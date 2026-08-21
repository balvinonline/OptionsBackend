'use client';
import React, { useEffect, useState } from 'react';
import '../legacy/index.css';

// We must dynamically import the legacy app to prevent SSR issues
// since it relies heavily on window and react-router-dom
import dynamic from 'next/dynamic';

const LegacyApp = dynamic(() => import('../legacy/App'), { 
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-gray-950 text-white">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mr-4"></div>
      Loading Professional Dashboard...
    </div>
  )
});

export default function LegacyWrapper() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return <LegacyApp />;
}
