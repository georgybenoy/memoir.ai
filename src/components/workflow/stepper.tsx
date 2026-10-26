'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2, CircleDot, Circle, ArrowRight } from 'lucide-react';
import { type WorkflowStep, WORKFLOW_STEPS } from '@/features/workflow/types';
import { cn } from '@/lib/utils/cn';

export interface WorkflowStepperProps {
  currentStep: WorkflowStep;
  materialId?: string;
  highestCompletedStep?: WorkflowStep;
  onStepClick?: (step: WorkflowStep) => void;
  className?: string;
}

export function WorkflowStepper({
  currentStep,
  materialId,
  highestCompletedStep = 1,
  onStepClick,
  className,
}: WorkflowStepperProps) {
  return (
    <nav
      aria-label="Learning workflow progress"
      className={cn(
        'w-full border-b border-[var(--border-color)] bg-[var(--surface)] px-2 py-2 sm:px-6 sm:py-3',
        className
      )}
    >
      <div className="max-w-5xl mx-auto">
        <ol className="flex items-center justify-between sm:justify-center gap-1 sm:gap-4 md:gap-8">
          {WORKFLOW_STEPS.map((stepInfo, idx) => {
            const stepNum = stepInfo.step;
            const isCompleted =
              stepNum < currentStep ||
              (highestCompletedStep && stepNum <= highestCompletedStep && stepNum !== currentStep);
            const isActive = stepNum === currentStep;
            const isUpcoming = !isActive && !isCompleted;

            // Route destination for completed steps
            const destination = stepInfo.routeTemplate(materialId);
            const isClickable = isCompleted && Boolean(materialId || stepNum === 1);

            return (
              <li
                key={stepInfo.id}
                className="flex items-center gap-1 sm:gap-3 flex-1 sm:flex-initial min-w-0 justify-center"
              >
                <div
                  className={cn(
                    'flex items-center gap-1.5 sm:gap-2 rounded-lg px-1.5 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium transition-colors min-w-0',
                    isActive &&
                      'bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--primary)] shadow-sm',
                    isCompleted &&
                      'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                    isUpcoming && 'text-[var(--text-muted)]'
                  )}
                  aria-current={isActive ? 'step' : undefined}
                >
                  {/* Status Icon */}
                  {isCompleted ? (
                    <CheckCircle2
                      className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--accent-green)] shrink-0"
                      aria-hidden="true"
                    />
                  ) : isActive ? (
                    <CircleDot
                      className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--accent-cyan)] animate-pulse shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--text-muted)] shrink-0"
                      aria-hidden="true"
                    />
                  )}

                  {/* Step Label with accessible state */}
                  {isClickable ? (
                    <Link
                      href={destination}
                      onClick={() => onStepClick?.(stepNum)}
                      className="flex flex-col text-left hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--primary)] rounded min-w-0"
                      aria-label={`Step ${stepNum}: ${stepInfo.shortTitle} (Completed, click to revisit)`}
                    >
                      <span className="text-[9px] sm:text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                        Step {stepNum}:
                      </span>
                      <span className="font-semibold text-[11px] sm:text-sm text-[var(--text-primary)] truncate max-w-[55px] sm:max-w-none">
                        {stepInfo.shortTitle}
                      </span>
                    </Link>
                  ) : (
                    <div className="flex flex-col text-left min-w-0">
                      <span
                        className={cn(
                          'text-[9px] sm:text-xs uppercase tracking-wider font-semibold',
                          isActive ? 'text-[var(--accent-cyan)]' : 'text-[var(--text-muted)]'
                        )}
                      >
                        Step {stepNum} {isActive ? '(Active)' : isCompleted ? '(Done)' : '(Upcoming)'}
                      </span>
                      <span
                        className={cn(
                          'font-semibold text-[11px] sm:text-sm truncate max-w-[50px] sm:max-w-none',
                          isActive
                            ? 'text-[var(--text-primary)] font-bold'
                            : isCompleted
                            ? 'text-[var(--text-secondary)]'
                            : 'text-[var(--text-muted)]'
                        )}
                      >
                        {stepInfo.shortTitle}
                      </span>
                    </div>
                  )}
                </div>

                {/* Arrow connector between steps (desktop) */}
                {idx < WORKFLOW_STEPS.length - 1 && (
                  <ArrowRight
                    className="hidden md:inline-block h-3.5 w-3.5 text-[var(--text-muted)] opacity-40 shrink-0 ml-1"
                    aria-hidden="true"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
