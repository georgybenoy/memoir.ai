'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { resolveLegacyRoute } from '@/features/workflow/redirects';
import { Loader2 } from 'lucide-react';

function LegacyTutorRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  React.useEffect(() => {
    const target = resolveLegacyRoute('/app/tutor', searchParams);
    router.replace(target);
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
      <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" aria-label="Redirecting to learning workflow" />
    </div>
  );
}

export default function LegacyTutorPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" aria-label="Loading..." />
        </div>
      }
    >
      <LegacyTutorRedirectInner />
    </React.Suspense>
  );
}
