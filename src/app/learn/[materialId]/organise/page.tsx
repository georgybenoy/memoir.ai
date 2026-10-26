'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { WorkflowShell } from '@/components/workflow/workflow-shell';
import { Step2OrganiseMaterial } from '@/components/workflow/step2-organise-material';
import { validateStepAccess } from '@/features/workflow/step-guard';
import { getStorage } from '@/lib/db/bootstrap';
import { Loader2 } from 'lucide-react';

export default function Step2Page() {
  const params = useParams();
  const router = useRouter();
  const materialId = params?.materialId as string;

  const [authorized, setAuthorized] = React.useState(false);
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    async function checkAccess() {
      if (!materialId) {
        router.replace('/learn/new');
        return;
      }
      const repos = getStorage();
      const access = await validateStepAccess(materialId, 2, repos);
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
  }, [materialId, router]);

  if (checking || !authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" aria-label="Verifying material access" />
      </div>
    );
  }

  return (
    <WorkflowShell currentStep={2} materialId={materialId}>
      <Step2OrganiseMaterial materialId={materialId} />
    </WorkflowShell>
  );
}
