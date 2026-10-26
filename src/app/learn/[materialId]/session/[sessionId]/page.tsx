'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { WorkflowShell } from '@/components/workflow/workflow-shell';
import { Step4SessionHost } from '@/components/workflow/step4-session-host';
import { validateStepAccess } from '@/features/workflow/step-guard';
import { getStorage } from '@/lib/db/bootstrap';
import { Loader2 } from 'lucide-react';

export default function Step4Page() {
  const params = useParams();
  const router = useRouter();
  const materialId = params?.materialId as string;
  const sessionId = params?.sessionId as string;

  const [authorized, setAuthorized] = React.useState(false);
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    async function checkAccess() {
      if (!materialId || !sessionId) {
        router.replace('/learn');
        return;
      }
      const repos = getStorage();
      const access = await validateStepAccess(materialId, 4, repos, sessionId);
      if (!mounted) return;

      if (!access.allowed) {
        router.replace(access.effectiveRoute);
      } else {
        setAuthorized(true);
      }
      setChecking(false);
    }

    checkAccess();
    return () => {
      mounted = false;
    };
  }, [materialId, sessionId, router]);

  if (checking || !authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" aria-label="Verifying session access" />
      </div>
    );
  }

  return (
    <WorkflowShell currentStep={4} materialId={materialId}>
      <Step4SessionHost materialId={materialId} sessionId={sessionId} />
    </WorkflowShell>
  );
}
