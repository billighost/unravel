'use client';

import { ToastContainer } from '@/components/ui/Toast';
import OfflineWarmup from './OfflineWarmup';

export default function ClientProviders() {
  return (
    <>
      <ToastContainer />
      <OfflineWarmup />
    </>
  );
}
