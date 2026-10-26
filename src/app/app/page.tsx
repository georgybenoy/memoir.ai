'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function AppIndexPage() {
  const router = useRouter();

  React.useEffect(() => {
    router.replace('/learn');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
      <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" aria-label="Redirecting to learning home" />
    </div>
  );
}
