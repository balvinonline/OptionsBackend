'use client';

import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import ProfessionalDashboard from '../../legacy/ProfessionalDashboard';

export default function LegacyPage() {
  return (
    <MemoryRouter>
      <ProfessionalDashboard />
    </MemoryRouter>
  );
}
