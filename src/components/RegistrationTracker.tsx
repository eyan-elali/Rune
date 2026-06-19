'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { trackPixelEvent } from '@/lib/meta-pixel';

const STORAGE_KEY = 'rune_complete_registration_tracked';

function Tracker() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.get('registered') !== '1') return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(STORAGE_KEY)) return;

    trackPixelEvent('CompleteRegistration');
    localStorage.setItem(STORAGE_KEY, 'true');

    const url = new URL(window.location.href);
    url.searchParams.delete('registered');
    router.replace(url.pathname + url.search, { scroll: false });
  }, [searchParams, router]);

  return null;
}

export function RegistrationTracker() {
  return (
    <Suspense fallback={null}>
      <Tracker />
    </Suspense>
  );
}
