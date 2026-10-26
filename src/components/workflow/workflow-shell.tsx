'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { WorkflowStepper } from './stepper';
import { type WorkflowStep } from '@/features/workflow/types';
import { WorkspaceLayout } from '@/components/workspace/layout';
import { Container } from '@/components/ui/container';
import { cn } from '@/lib/utils/cn';

export interface WorkflowShellProps {
  currentStep: WorkflowStep;
  materialId?: string;
  highestCompletedStep?: WorkflowStep;
  children: React.ReactNode;
  className?: string;
}

export function WorkflowShell({
  currentStep,
  materialId,
  highestCompletedStep,
  children,
  className,
}: WorkflowShellProps) {
  const router = useRouter();

  const handleStepClick = (step: WorkflowStep) => {
    if (step === 1) {
      router.push('/learn/new');
    } else if (materialId) {
      if (step === 2) router.push(`/learn/${materialId}/organise`);
      if (step === 3) router.push(`/learn/${materialId}/mode`);
    }
  };

  return (
    <WorkspaceLayout>
      {/* Top Workflow Stepper (4 steps) */}
      <WorkflowStepper
        currentStep={currentStep}
        materialId={materialId}
        highestCompletedStep={highestCompletedStep}
        onStepClick={handleStepClick}
      />

      {/* Main Step Content Area */}
      <main
        id="workflow-content"
        className={cn('flex-1 focus:outline-none', className)}
        tabIndex={-1}
      >
        <Container size="workspace" className="py-4 sm:py-6">
          {children}
        </Container>
      </main>
    </WorkspaceLayout>
  );
}
