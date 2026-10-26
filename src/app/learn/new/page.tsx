'use client';

import * as React from 'react';
import { WorkflowShell } from '@/components/workflow/workflow-shell';
import { Step1AddMaterial } from '@/components/workflow/step1-add-material';

export default function Step1Page() {
  return (
    <WorkflowShell currentStep={1}>
      <Step1AddMaterial />
    </WorkflowShell>
  );
}
